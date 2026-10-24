"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Plus, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Download, ExternalLink, RefreshCw, Eye, Edit2 } from "lucide-react";
import { RESOURCES } from "@/lib/resources";
import { AREA_UNIT_LABELS, cn, formatDateTime, formatPrice } from "@/lib/utils";
import { api, Badge, Btn, Confirm, EmptyState, inputCls, statusTone, useToast } from "./ui";

type Row = Record<string, unknown> & { id: number };

export function ResourceManager({ resourceKey, canWrite, canExport }: { resourceKey: string; canWrite: boolean; canExport?: boolean }) {
  const def = RESOURCES[resourceKey];
  const router = useRouter();
  const sp = useSearchParams();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>(() => Object.fromEntries((def.filters ?? []).map((f) => [f.name, sp.get(f.name) ?? ""])));
  const [sort, setSort] = useState(def.defaultSort);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<{ action: string; label: string } | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort: sort.column, dir: sort.dir });
      if (q) params.set("q", q);
      for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
      const d = await api<{ data: Row[]; total: number }>(`/api/admin/${resourceKey}?${params}`);
      setRows(d.data); setTotal(d.total); setSelected([]);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); } finally { setLoading(false); }
  }, [resourceKey, page, pageSize, q, filters, sort]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError("");
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort: sort.column, dir: sort.dir });
        if (q) params.set("q", q);
        for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
        const d = await api<{ data: Row[]; total: number }>(`/api/admin/${resourceKey}?${params}`);
        if (!cancelled) { setRows(d.data); setTotal(d.total); setSelected([]); }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load"); } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [resourceKey, page, pageSize, q, filters, sort, tick]);

  const bulk = async (action: string) => {
    try {
      await api(`/api/admin/${resourceKey}/bulk`, { method: "POST", body: JSON.stringify({ action, ids: selected }) });
      toast(`${selected.length} item(s) ${action}d`.replace("dd", "d").replace("deleted", "deleted"));
      setTick((t) => t + 1); router.refresh();
    } catch (e) { toast(e instanceof Error ? e.message : "Action failed", "error"); }
  };

  const move = async (row: Row, dir: -1 | 1) => {
    const idx = rows.findIndex((r) => r.id === row.id);
    const other = rows[idx + dir];
    if (!other) return;
    const a = Number(row.order ?? idx), b = Number(other.order ?? idx + dir);
    const order = a === b ? [{ id: row.id, order: idx + dir }, { id: other.id, order: idx }] : [{ id: row.id, order: b }, { id: other.id, order: a }];
    try { await api(`/api/admin/${resourceKey}/bulk`, { method: "POST", body: JSON.stringify({ action: "reorder", ids: [row.id, other.id], order }) }); setTick((t) => t + 1); router.refresh(); } catch (e) { toast(e instanceof Error ? e.message : "Reorder failed", "error"); }
  };

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const fieldMap = useMemo(() => Object.fromEntries(def.fields.map((f) => [f.name, f])), [def.fields]);

  const cell = (row: Row, col: string) => {
    const v = row[col];
    const f = fieldMap[col];
    if (col === "price") return <span className="font-medium">{formatPrice(v as string, row.currency as string)}</span>;
    if (col === "areaValue") {
      const unit = row.areaUnit ? AREA_UNIT_LABELS[String(row.areaUnit)] : null;
      if (v == null || v === "") return <span className="text-mist">{unit && row.area ? `${row.area} ${unit}` : (row.area as string) || "—"}</span>;
      return <span>{Number(v).toLocaleString()}{unit ? ` ${unit}` : ""}</span>;
    }
    if (col === "purpose" && typeof v === "string") return <Badge tone={v === "rent" ? "amber" : "green"}>{v === "rent" ? "For Rent" : "For Sale"}</Badge>;
    if (col === "status" && typeof v === "string") return <Badge tone={statusTone(v)}>{v.replace(/-/g, " ")}</Badge>;
    if (col === "role" && typeof v === "string") return <Badge tone={v === "SUPER_ADMIN" ? "slate" : v === "ADMIN" ? "green" : "neutral"}>{v.replace("_", " ")}</Badge>;
    if (typeof v === "boolean") return <Badge tone={v ? "green" : "neutral"}>{v ? (col === "archived" ? "Archived" : "Yes") : col === "archived" ? "Active" : "No"}</Badge>;
    if (v instanceof Date || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v))) return <span className="text-mist">{formatDateTime(v as string)}</span>;
    if (f?.type === "relation") return <span>{(row[`${col}Label`] as string) ?? <span className="text-mist">—</span>}</span>;
    if (v == null || v === "") return <span className="text-mist">—</span>;
    const s = String(v);
    return <span title={s}>{s.length > 60 ? `${s.slice(0, 60)}…` : s}</span>;
  };

  const rowHref = (row: Row) => (def.detailPath ? def.detailPath(row) : `/admin/${resourceKey}/${row.id}`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-[22px] font-semibold tracking-tight">{def.label}</h1><p className="text-[13px] text-mist">{total} total</p></div>
        <div className="flex gap-2">
          <Btn variant="ghost" size="sm" onClick={load} aria-label="Refresh"><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /></Btn>
          {canExport && <Btn variant="ghost" size="sm" onClick={() => window.location.assign("/api/admin/lead-export")}><Download className="h-4 w-4" /> Export CSV</Btn>}
          {canWrite && !def.readOnly && <Link href={`/admin/${resourceKey}/new`} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-[13.5px] font-medium text-white hover:bg-brand-deep"><Plus className="h-4 w-4" /> New {def.singular}</Link>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-ink/8 bg-white p-3 shadow-sm">
        <form onSubmit={(e) => { e.preventDefault(); setPage(1); setQ(qInput); }} className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" />
          <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder={`Search ${def.label.toLowerCase()}…`} className={cn(inputCls, "pl-9")} aria-label="Search" />
        </form>
        {(def.filters ?? []).map((f) => (
          <select key={f.name} value={filters[f.name] ?? ""} onChange={(e) => { setPage(1); setFilters({ ...filters, [f.name]: e.target.value }); }} className={cn(inputCls, "w-auto")} aria-label={f.label}>
            <option value="">{f.label}: All</option>
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        <select value={`${sort.column}:${sort.dir}`} onChange={(e) => { const [column, dir] = e.target.value.split(":"); setSort({ column, dir: dir as "asc" | "desc" }); }} className={cn(inputCls, "w-auto")} aria-label="Sort">
          {def.listColumns.filter((c) => !fieldMap[c] || fieldMap[c].type !== "relation").map((c) => (
            <optgroup key={c} label={fieldMap[c]?.label ?? c}><option value={`${c}:asc`}>{fieldMap[c]?.label ?? c} ↑</option><option value={`${c}:desc`}>{fieldMap[c]?.label ?? c} ↓</option></optgroup>
          ))}
        </select>
      </div>
      {selected.length > 0 && canWrite && !def.readOnly && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-brand/30 bg-brand/5 px-4 py-2.5 text-[13px]">
          <span className="font-medium">{selected.length} selected</span>
          {def.publishable && <><Btn size="sm" variant="secondary" onClick={() => bulk("publish")}>Publish</Btn><Btn size="sm" variant="secondary" onClick={() => bulk("unpublish")}>Unpublish</Btn></>}
          {def.featurable && <><Btn size="sm" variant="secondary" onClick={() => bulk("feature")}>Feature</Btn><Btn size="sm" variant="secondary" onClick={() => bulk("unfeature")}>Unfeature</Btn></>}
          {def.archivable && <><Btn size="sm" variant="secondary" onClick={() => bulk("archive")}>Archive</Btn><Btn size="sm" variant="secondary" onClick={() => bulk("restore")}>Restore</Btn></>}
          {(resourceKey === "sections" || resourceKey === "navigation" || resourceKey === "users") && <><Btn size="sm" variant="secondary" onClick={() => bulk("enable")}>{resourceKey === "users" ? "Activate" : "Enable"}</Btn><Btn size="sm" variant="secondary" onClick={() => bulk("disable")}>{resourceKey === "users" ? "Deactivate" : "Disable"}</Btn></>}
          {def.duplicatable && <Btn size="sm" variant="secondary" onClick={() => bulk("duplicate")}>Duplicate</Btn>}
          <Btn size="sm" variant="danger" onClick={() => setConfirm({ action: "delete", label: "Delete" })}>Delete</Btn>
          <button type="button" className="ml-auto text-mist hover:text-ink" onClick={() => setSelected([])}>Clear</button>
        </div>
      )}

      {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{error} <button className="underline" onClick={load}>Retry</button></div>}

      {/* Phones: compact cards instead of a 10-column table (no sideways scrolling). */}
      <div className="space-y-2 md:hidden">
        {loading && rows.length === 0 && Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-16 rounded-2xl" />)}
        {rows.map((row) => {
          const primary = def.listColumns[0] ?? "name";
          const rest = def.listColumns.slice(1);
          return (
            <Link key={row.id} href={rowHref(row)} className="block rounded-2xl border border-ink/8 bg-white p-4 shadow-sm active:bg-slate-50">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-ink">{cell(row, primary)}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-charcoal/70">
                    {rest.slice(0, 3).map((c) => <span key={c} className="inline-flex items-center gap-1"><span className="text-mist">{fieldMap[c]?.label ?? c}:</span> {cell(row, c)}</span>)}
                  </div>
                </div>
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-mist" />
              </div>
            </Link>
          );
        })}
        {!loading && rows.length === 0 && !error && <div className="p-2"><EmptyState title={`No ${def.label.toLowerCase()} found`} description={`Create your first ${def.singular.toLowerCase()} to get started.`} /></div>}
        <div className="flex items-center justify-between px-1 py-2 text-[12.5px] text-mist">
          <span>Page {page} of {pages}</span>
          <div className="flex gap-1"><Btn size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /> Prev</Btn><Btn size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next <ChevronRight className="h-4 w-4" /></Btn></div>
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-ink/8 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-mist">
              <tr>
                {canWrite && !def.readOnly && <th className="w-10 px-3 py-3"><input type="checkbox" aria-label="Select all" checked={rows.length > 0 && selected.length === rows.length} onChange={(e) => setSelected(e.target.checked ? rows.map((r) => r.id) : [])} /></th>}
                {def.orderable && <th className="w-16 px-2 py-3">Order</th>}
                {def.listColumns.map((c) => <th key={c} className="px-3 py-3 font-semibold">{fieldMap[c]?.label ?? c}</th>)}
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/6">
              {loading && rows.length === 0 && Array.from({ length: 6 }).map((_, i) => <tr key={i}><td colSpan={def.listColumns.length + 3} className="px-3 py-3"><div className="skeleton h-5 w-full rounded" /></td></tr>)}
              {rows.map((row, i) => (
                <tr key={row.id} className={cn("group cursor-pointer transition hover:bg-brand/[0.04]", selected.includes(row.id) && "bg-brand/[0.06]")} onClick={() => router.push(rowHref(row))}>
                  {canWrite && !def.readOnly && <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${row.id}`} checked={selected.includes(row.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, row.id] : selected.filter((x) => x !== row.id))} /></td>}
                  {def.orderable && <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}><div className="flex items-center gap-0.5 text-mist"><button type="button" disabled={i === 0 || !canWrite} onClick={() => move(row, -1)} className="rounded p-1 hover:bg-slate-100 disabled:opacity-30" aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></button><button type="button" disabled={i === rows.length - 1 || !canWrite} onClick={() => move(row, 1)} className="rounded p-1 hover:bg-slate-100 disabled:opacity-30" aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></button></div></td>}
                  {def.listColumns.map((c) => <td key={c} className="max-w-[260px] truncate px-3 py-2.5">{cell(row, c)}</td>)}
                  <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {def.previewPath && <a href={def.previewPath(row)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-mist hover:text-brand"><ExternalLink className="h-3.5 w-3.5" /> {row.published === false ? "Preview" : "View"}</a>}
                      {canWrite && !def.readOnly && def.previewPath && (
                        <a href={`/admin/${resourceKey}?edit=${row.id}`} className="inline-flex items-center gap-1 text-[12px] text-mist hover:text-brand" title="Edit"><Edit2 className="h-3.5 w-3.5" /></a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && rows.length === 0 && !error && <div className="p-6"><EmptyState title={`No ${def.label.toLowerCase()} found`} description={q || Object.values(filters).some(Boolean) ? "Try adjusting your search or filters." : `Create your first ${def.singular.toLowerCase()} to get started.`} action={canWrite && !def.readOnly ? <Link href={`/admin/${resourceKey}/new`} className="rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white">New {def.singular}</Link> : undefined} /></div>}
        <div className="flex items-center justify-between border-t border-ink/8 px-4 py-3 text-[12.5px] text-mist">
          <span>Page {page} of {pages}</span>
          <div className="flex gap-1"><Btn size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /> Prev</Btn><Btn size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next <ChevronRight className="h-4 w-4" /></Btn></div>
        </div>
      </div>

      <Confirm open={!!confirm} onClose={() => setConfirm(null)} title={`${confirm?.label} ${selected.length} item(s)?`} message="This action cannot be undone." confirmLabel={confirm?.label} danger onConfirm={() => bulk(confirm!.action)} />
    </div>
  );
}
