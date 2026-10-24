"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, Trash2, Copy } from "lucide-react";
import { RESOURCES } from "@/lib/resources";
import { slugify } from "@/lib/utils";
import { api, Btn, Confirm, useToast } from "./ui";
import { FieldInput } from "./FieldInput";

type Opt = { value: number | string; label: string };

export function ResourceForm({ resourceKey, id, canWrite, inline, onSaved }: { resourceKey: string; id: number | "new"; canWrite: boolean; inline?: boolean; onSaved?: () => void }) {
  const def = RESOURCES[resourceKey];
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(id !== "new");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [relOpts, setRelOpts] = useState<Record<string, Opt[]>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [slugTouched, setSlugTouched] = useState(id !== "new");

  const groups = useMemo(() => {
    const g = new Map<string, typeof def.fields>();
    for (const f of def.fields) { const k = f.group ?? "General"; if (!g.has(k)) g.set(k, []); g.get(k)!.push(f); }
    return Array.from(g.entries());
  }, [def]);

  const relationsKey = def.fields.filter((f) => f.type === "relation" && f.relation).map((f) => f.relation).join(",");
  /** Sections resource: published pages from the Pages module appear in the page dropdown. */
  const wantsPagesLookup = resourceKey === "sections" && def.fields.some((f) => f.name === "page");
  const [pageOpts, setPageOpts] = useState<Opt[]>([]);

  useEffect(() => {
    if (!wantsPagesLookup) return;
    let cancelled = false;
    (async () => {
      try {
        const d = await api<{ data: { id: number; title: string; pageKey: string }[] }>("/api/admin/pages-lookup");
        if (!cancelled) setPageOpts(d.data.map((p) => ({ value: p.pageKey, label: `${p.title} (created page)` })));
      } catch { /* without pages.read the standard dropdown still shows the defaults */ }
    })();
    return () => { cancelled = true; };
  }, [wantsPagesLookup]);

  useEffect(() => {
    if (!relationsKey) return;
    let cancelled = false;
    const rels = relationsKey.split(",").filter(Boolean);
    (async () => {
      try {
        const entries = await Promise.all(rels.map(async (r) => {
          const d = await api<{ data: Record<string, unknown>[] }>(`/api/admin/${r}?all=1&sort=name&dir=asc`);
          return [r, d.data.map((x) => ({ value: x.id as number, label: `${x.flag ? `${x.flag} ` : ""}${x.name ?? x.email}` }))] as const;
        }));
        if (!cancelled) setRelOpts(Object.fromEntries(entries));
      } catch { /* relation options stay empty; selects still render */ }
    })();
    return () => { cancelled = true; };
  }, [relationsKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (id === "new") {
        const defaults: Record<string, unknown> = {};
        for (const f of def.fields) if (f.type === "boolean") defaults[f.name] = f.name === "published" || f.name === "active" || f.name === "enabled" || f.name === "visible" ? true : false;
        if (resourceKey === "projects") { defaults.currency = "USD"; defaults.status = "available"; defaults.published = false; defaults.purpose = "sale"; defaults.areaUnit = "sqft"; }
        if (resourceKey === "leads") { defaults.status = "NEW"; defaults.source = "manual"; }
        if (!cancelled) { setValues(defaults); setLoading(false); }
        return;
      }
      try {
        const d = await api<{ data: Record<string, unknown> }>(`/api/admin/${resourceKey}/${id}`);
        if (!cancelled) setValues(d.data);
      } catch (e) { if (!cancelled) toast((e as Error).message, "error"); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [id, resourceKey, def.fields, toast]);

  const set = (name: string, v: unknown) => {
    setValues((prev) => {
      const next = { ...prev, [name]: v };
      if (name === "name" && !slugTouched && def.fields.some((f) => f.name === "slug")) next.slug = slugify(String(v ?? ""));
      if (name === "title" && !slugTouched && resourceKey === "legal") next.slug = slugify(String(v ?? ""));
      return next;
    });
    if (name === "slug") setSlugTouched(true);
  };

  const save = async (extra?: Record<string, unknown>) => {
    setSaving(true); setErrors({});
    try {
      const payload: Record<string, unknown> = {};
      for (const f of def.fields) if (!f.readOnly && values[f.name] !== undefined) payload[f.name] = values[f.name];
      Object.assign(payload, extra);
      if (payload.password === "" || payload.password == null) delete payload.password;
      const res = id === "new" ? await api<{ data: { id: number } }>(`/api/admin/${resourceKey}`, { method: "POST", body: JSON.stringify(payload) }) : await api<{ data: { id: number } }>(`/api/admin/${resourceKey}/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      toast(`${def.singular} saved`);
      router.refresh();
      if (onSaved) onSaved();
      else if (id === "new") router.replace(def.detailPath ? def.detailPath(res.data) : `/admin/${resourceKey}/${res.data.id}`);
      else setValues((v) => ({ ...v, ...extra }));
    } catch (e) {
      const err = e as Error & { issues?: { path: string; message: string }[] };
      if (err.issues) setErrors(Object.fromEntries(err.issues.map((i) => [i.path, i.message])));
      toast(err.message, "error");
    } finally { setSaving(false); }
  };

  const remove = async () => {
    await api(`/api/admin/${resourceKey}/${id}`, { method: "DELETE" });
    toast(`${def.singular} deleted`);
    router.replace(`/admin/${resourceKey}`);
    router.refresh();
  };

  const duplicate = async () => {
    try { await api(`/api/admin/${resourceKey}/bulk`, { method: "POST", body: JSON.stringify({ action: "duplicate", ids: [id] }) }); toast("Duplicated as draft"); router.push(`/admin/${resourceKey}`); } catch (e) { toast((e as Error).message, "error"); }
  };

  if (loading) return <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>;

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-6">
      {!inline && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href={`/admin/${resourceKey}`} className="rounded-lg border border-ink/10 bg-white p-2 hover:border-ink/25" aria-label="Back"><ArrowLeft className="h-4 w-4" /></Link>
            <div><h1 className="text-[20px] font-semibold tracking-tight">{id === "new" ? `New ${def.singular}` : (values.name as string) || (values.title as string) || (values.label as string) || `${def.singular} #${id}`}</h1>{id !== "new" && <p className="text-[12px] text-mist">ID {id}{values.updatedAt ? ` · Updated ${new Date(values.updatedAt as string).toLocaleString()}` : ""}</p>}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {def.previewPath && id !== "new" && <a href={def.previewPath(values)} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg border border-ink/10 bg-white px-3 text-[13px] hover:border-ink/25"><ExternalLink className="h-4 w-4" /> {values.published === false ? "Preview draft" : "View live"}</a>}
            {def.duplicatable && id !== "new" && canWrite && <Btn type="button" variant="secondary" onClick={duplicate}><Copy className="h-4 w-4" /> Duplicate</Btn>}
            {id !== "new" && canWrite && <Btn type="button" variant="danger" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" /></Btn>}
          </div>
        </div>
      )}

      {groups.map(([group, fields]) => (
        <section key={group} className="rounded-2xl border border-ink/8 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-[12px] font-semibold uppercase tracking-[0.18em] text-mist">{group}</h2>
          <div className="grid gap-4 md:grid-cols-6">
            {fields.map((f) => <FieldInput key={f.name} field={f} value={values[f.name]} onChange={(v) => set(f.name, v)} error={errors[f.name]} relationOptions={relOpts} extraOptions={f.name === "page" && resourceKey === "sections" ? pageOpts : undefined} />)}
          </div>
        </section>
      ))}

      {canWrite && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-ink/8 bg-white/90 p-3 shadow-lg backdrop-blur">
          {def.publishable && values.published !== true && <Btn type="button" variant="secondary" loading={saving} onClick={() => save({ published: true })}>Save & Publish</Btn>}
          {def.publishable && values.published === true && <Btn type="button" variant="secondary" loading={saving} onClick={() => save({ published: false })}>Unpublish</Btn>}
          {def.archivable && id !== "new" && <Btn type="button" variant="secondary" loading={saving} onClick={() => save({ archived: !values.archived })}>{values.archived ? "Restore" : "Archive"}</Btn>}
          <Btn type="submit" loading={saving}>{id === "new" ? `Create ${def.singular}` : "Save changes"}</Btn>
        </div>
      )}
      <Confirm open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={remove} title={`Delete this ${def.singular.toLowerCase()}?`} message="This permanently removes the record. This cannot be undone." confirmLabel="Delete" danger />
    </form>
  );
}
