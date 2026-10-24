"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { cn, STATUS_LABELS } from "@/lib/utils";

type Props = {
  markets: { id: number; slug: string; name: string; flag: string; cities?: string[] }[];
  types: string[];
  /** Every published city so the City dropdown works before a market is picked. */
  cities?: { name: string; marketId: number | null }[];
};

const sel = "h-11 rounded-full border border-ink/10 bg-white px-4 text-[13.5px] text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10";

export function ProjectFilters({ markets, types, cities = [] }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const urlQ = params.get("q") ?? "";
  const [q, setQ] = useState(urlQ);
  const [prevUrlQ, setPrevUrlQ] = useState(urlQ);
  // Adjust local state during render when the URL changes (React-sanctioned
  // pattern — avoids setState-in-effect cascades).
  if (urlQ !== prevUrlQ) {
    setPrevUrlQ(urlQ);
    setQ(urlQ);
  }

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  const market = params.get("market") ?? "";
  const city = params.get("city") ?? "";
  const activeMarket = markets.find((m) => m.slug === market);
  const cityOptions = Array.from(
    new Set([
      ...(activeMarket?.cities ?? []),
      ...cities.filter((c) => !activeMarket || c.marketId === activeMarket.id).map((c) => c.name),
    ]),
  ).sort((a, b) => a.localeCompare(b));
  const hasAny = !!(market || city || params.get("type") || params.get("status") || params.get("q"));

  return (
    <div className={cn("mt-10 flex flex-col gap-4 transition-opacity", pending && "opacity-60")} role="search" aria-label="Filter projects">
      <div className="flex snap-x gap-2 overflow-x-auto pb-1 scrollbar-none" data-lenis-prevent>
        <button type="button" onClick={() => update("market", "")} className={cn("snap-start shrink-0 rounded-full border px-4 py-2 text-[13px] transition", !market ? "border-brand bg-brand text-white shadow-glow" : "border-ink/10 bg-white text-charcoal hover:border-brand/40")}>All Markets</button>
        {markets.map((m) => (
          <button key={m.slug} type="button" aria-pressed={market === m.slug} onClick={() => update("market", market === m.slug ? "" : m.slug)} className={cn("snap-start shrink-0 rounded-full border px-4 py-2 text-[13px] transition", market === m.slug ? "border-brand bg-brand text-white shadow-glow" : "border-ink/10 bg-white text-charcoal hover:border-brand/40")}>
            <span aria-hidden>{m.flag}</span> {m.name}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={(e) => { e.preventDefault(); update("q", q); }} className="relative flex-1 min-w-[220px]">
          <label htmlFor="project-search" className="sr-only">Search projects</label>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" />
          <input id="project-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, city or developer" className={cn(sel, "w-full pl-10")} />
        </form>
        <label className="sr-only" htmlFor="type-filter">Property type</label>
        <select id="type-filter" value={params.get("type") ?? ""} onChange={(e) => update("type", e.target.value)} className={sel}>
          <option value="">All Types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className="sr-only" htmlFor="status-filter">Status</label>
        <select id="status-filter" value={params.get("status") ?? ""} onChange={(e) => update("status", e.target.value)} className={sel}>
          <option value="">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="sr-only" htmlFor="city-filter">City</label>
        <select id="city-filter" value={city} onChange={(e) => update("city", e.target.value)} className={sel}>
          <option value="">All Cities</option>
          {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {hasAny && <button type="button" onClick={() => start(() => router.replace(pathname, { scroll: false }))} className="inline-flex h-11 items-center gap-1 rounded-full px-3 text-[13px] text-charcoal/70 hover:text-brand"><X className="h-3.5 w-3.5" /> Clear</button>}
      </div>
    </div>
  );
}
