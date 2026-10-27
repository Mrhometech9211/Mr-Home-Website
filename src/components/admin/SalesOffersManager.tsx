"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FileText, Plus, Search, RefreshCw, ChevronRight } from "lucide-react";
import { api, Badge, Btn, EmptyState, inputCls } from "./ui";
import { STATUS_LABELS, type OfferStatus } from "@/lib/offers/types";
import { formatDateTime } from "@/lib/utils";

type Row = {
  id: number;
  reference: string;
  title: string | null;
  status: OfferStatus;
  projectName: string | null;
  leadName: string | null;
  unitNo: string | null;
  currency: string | null;
  terms: { currency?: string; plans?: { name?: string }[] } | null;
  updatedAt: string;
  createdAt: string;
  currentVersion: number;
};

const TONES: Record<OfferStatus, "neutral" | "green" | "amber" | "red" | "blue" | "slate"> = {
  draft: "neutral",
  needs_info: "amber",
  ready_for_review: "blue",
  approved: "green",
  archived: "slate",
};

export function SalesOffersManager({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      const d = await api<{ data: Row[] }>(`/api/admin/sales-offers?${params}`);
      setRows(d.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load offers");
    } finally {
      setLoading(false);
    }
  }, [q, status]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        if (status) params.set("status", status);
        const d = await api<{ data: Row[] }>(`/api/admin/sales-offers?${params}`);
        if (!cancelled) {
          setRows(d.data);
          setError("");
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load offers");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [q, status, tick]);

  const stats = {
    total: rows.length,
    approved: rows.filter((r) => r.status === "approved").length,
    review: rows.filter((r) => r.status === "ready_for_review").length,
    needs: rows.filter((r) => r.status === "needs_info").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[22px] font-semibold tracking-tight"><FileText className="h-5 w-5 text-brand" /> Sales Offers</h1>
          <p className="text-[13px] text-mist">Project offers, payment plans and branded PDFs — drafts stay private until approved.</p>
        </div>
        <div className="flex gap-2">
          <Btn variant="ghost" size="sm" onClick={() => setTick((t) => t + 1)} aria-label="Refresh"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Btn>
          {canWrite && <Link href="/admin/sales-offers/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-[13.5px] font-medium text-white hover:bg-brand-deep"><Plus className="h-4 w-4" /> New sales offer</Link>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Total shown", stats.total],
          ["Approved", stats.approved],
          ["Ready for review", stats.review],
          ["Need information", stats.needs],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-ink/8 bg-white p-3 shadow-sm">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-mist">{label}</div>
            <div className="mt-0.5 text-[22px] font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-ink/8 bg-white p-3 shadow-sm">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reference, customer, project or unit…" className={`${inputCls} pl-9`} aria-label="Search offers" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputCls} w-auto`} aria-label="Status">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-ink/8 bg-white shadow-sm">
        {loading && rows.length === 0 ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No sales offers yet"
              description={q || status ? "Try a different search or status." : "Start from a lead or build a standalone offer with validated payment plans."}
              action={canWrite ? <Link href="/admin/sales-offers/new" className="rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white">Create the first offer</Link> : undefined}
            />
          </div>
        ) : (
          <ul className="divide-y divide-ink/6">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/sales-offers/${r.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-brand/[0.04]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-[10px] font-bold text-brand">PDF</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[13.5px] font-semibold">{r.title || r.reference}</span>
                      <Badge tone={TONES[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                      {r.currentVersion > 0 && <span className="text-[10.5px] text-mist">v{r.currentVersion}</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-mist">
                      <span className="font-mono">{r.reference}</span>
                      {r.projectName && <span>{r.projectName}</span>}
                      {r.unitNo && <span>Unit {r.unitNo}</span>}
                      {r.leadName && <span>· {r.leadName}</span>}
                      <span>Updated {formatDateTime(r.updatedAt)}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-mist" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
