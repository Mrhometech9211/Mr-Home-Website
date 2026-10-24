"use client";

/**
 * Project-page pricing card client island:
 *   - Searchable "all world currencies" selector (ISO 4217) at the very top,
 *     chosen above the Download Brochure action — changing it converts the
 *     project price live (rates from open.er-api.com, cached client-side 6h).
 *   - Children render the action buttons (Download Brochure / Request /
 *     WhatsApp) so the selector always sits above them.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { CURRENCIES, findCurrency } from "@/lib/currencies";

type Props = {
  price: string | number | null;
  currency: string | null | undefined;
  roi?: string | null;
  className?: string;
  children?: React.ReactNode;
};

const LS_KEY = "mrh_price_currency";
const CACHE_PREFIX = "mrh_rates_";
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6h

type RateCache = { fetchedAt: number; rates: Record<string, number> };

function readRateCache(base: string): RateCache | null {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + base);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RateCache;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL || !parsed.rates) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function fetchRates(base: string): Promise<Record<string, number> | null> {
  const cached = readRateCache(base);
  if (cached) return cached.rates;
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (data.result !== "success" || !data.rates) return null;
    try {
      sessionStorage.setItem(CACHE_PREFIX + base, JSON.stringify({ fetchedAt: Date.now(), rates: data.rates } satisfies RateCache));
    } catch { /* private mode — fine */ }
    return data.rates;
  } catch {
    return null;
  }
}

export function ProjectPricing({ price, currency: base, roi, className, children }: Props) {
  const baseCur = (base || "USD").toUpperCase();
  const baseCode = findCurrency(baseCur) ? baseCur : "USD";
  const baseName = findCurrency(baseCode)?.name ?? baseCode;

  const [selected, setSelected] = useState<string | null>(null); // null = listing currency
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // One state object per base currency: `base` identifies which rates these
  // are, so switching projects never shows a stale conversion. SetState only
  // happens inside async callbacks (never synchronously in an effect).
  const [rateState, setRateState] = useState<{ base: string; data: Record<string, number> | null; error: boolean }>({ base: "", data: null, error: false });
  const rootRef = useRef<HTMLDivElement>(null);

  // Restore the visitor's last-used currency after hydration.
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(LS_KEY); } catch { /* private mode */ }
    if (!saved || !findCurrency(saved) || saved === baseCode) return;
    const code = saved;
    const t = setTimeout(() => setSelected(code), 0);
    return () => clearTimeout(t);
  }, [baseCode]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  // Rates are only fetched once a currency other than the listing one is picked.
  useEffect(() => {
    if (!selected || selected === baseCode || rateState.base === baseCode) return;
    let alive = true;
    const apply = (data: Record<string, number> | null) => {
      if (alive) setRateState({ base: baseCode, data, error: !data });
    };
    const cached = readRateCache(baseCode);
    if (cached) {
      const t = setTimeout(() => apply(cached.rates), 0);
      return () => { alive = false; clearTimeout(t); };
    }
    void fetchRates(baseCode).then(apply);
    return () => { alive = false; };
  }, [selected, baseCode, rateState.base]);

  const rates = rateState.base === baseCode ? rateState.data : null;
  const ratesError = rateState.base === baseCode && rateState.error;

  const shown = selected && selected !== baseCode ? selected : baseCode;
  const priceNum = typeof price === "string" ? parseFloat(price) : price;
  const converted = useMemo(() => {
    if (priceNum == null || Number.isNaN(priceNum)) return null;
    if (shown === baseCode || !rates) return priceNum;
    const rate = rates[shown];
    return rate && rate > 0 ? priceNum * rate : null;
  }, [priceNum, shown, baseCode, rates]);

  const money = (() => {
    if (converted == null) return "Price on request";
    try {
      const f = new Intl.NumberFormat("en", { style: "currency", currency: shown, maximumFractionDigits: 0, notation: "compact" });
      return f.format(Math.round(converted));
    } catch {
      return `${shown} ${Math.round(converted).toLocaleString()}`;
    }
  })();

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = CURRENCIES.map((c) => ({
      ...c,
      hay: `${c.code} ${c.name} ${c.symbol ?? ""}`.toLowerCase(),
    }));
    return (q ? list.filter((c) => c.hay.includes(q)) : list).sort((a, b) => a.code.localeCompare(b.code));
  }, [query]);

  const select = (code: string) => {
    setSelected(code === baseCode ? null : code);
    try { localStorage.setItem(LS_KEY, code === baseCode ? "" : code); } catch { /* ignore */ }
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={rootRef} className={className}>
      {/* Currency selector — deliberate first element, above Download Brochure. */}
      <div className="relative z-30">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => { setOpen((o) => !o); setQuery(""); }}
          className="flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-white/25 bg-white/10 px-3.5 text-[13.5px] font-medium text-white backdrop-blur transition hover:border-brand-bright/70 hover:bg-white/15"
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <Tag className="h-4 w-4 shrink-0 text-brand-bright" aria-hidden />
            <span className="truncate">
              {money === "Price on request" ? baseName : findCurrency(shown)?.name ?? baseName}
              <span className="ml-2 text-white/60">
                {money === "Price on request" ? baseCode : (findCurrency(shown)?.symbol ?? shown) + " " + shown}
              </span>
            </span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-white/70 transition-transform", open && "rotate-180")} aria-hidden />
        </button>

        {open && (
          <div
            role="listbox"
            aria-label="Choose a currency"
            className="absolute bottom-[calc(100%+8px)] left-0 z-50 w-full min-w-[240px] max-w-[340px] overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-[0_24px_60px_-18px_rgba(17,20,17,0.45)]"
          >
            <div className="flex items-center gap-2 border-b border-ink/8 px-3 py-2.5">
              <Search className="h-4 w-4 shrink-0 text-mist" aria-hidden />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search currency (e.g. SAR, Euro, Rupee)"
                aria-label="Search currencies"
                autoComplete="off"
                className="h-9 w-full bg-transparent text-[13.5px] text-ink outline-none placeholder:text-mist"
                autoFocus
              />
            </div>
            <div className="max-h-72 overflow-y-auto overscroll-contain p-1.5">
              {options.length === 0 && <p className="px-3 py-4 text-center text-[13px] text-mist">No currency matches “{query}”.</p>}
              {options.map((c) => {
                const active = shown === c.code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => select(c.code)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition",
                      active ? "bg-brand/10 text-brand" : "text-charcoal hover:bg-slate-50",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="font-semibold">{c.code}</span>
                      <span className={cn("ml-2 truncate", active ? "text-brand/80" : "text-mist")}>{c.name}</span>
                    </span>
                    <span className="shrink-0 text-[12.5px] text-charcoal/70">{c.symbol ?? c.code}{active && <Check className="ml-1 inline h-3.5 w-3.5" />}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Price — converts live with the selection above. */}
      <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-white/50">
        {money === "Price on request" ? "Price" : selected && selected !== baseCode ? "Starting from · converted" : "Starting from"}
      </div>
      <div className="mt-1 flex min-h-[40px] flex-wrap items-baseline gap-x-2 text-[32px] font-semibold tracking-tight text-brand-bright" data-testid="project-price">
        <span>{money}</span>
        {shown !== baseCode && <span className="text-[14px] font-normal text-white/60">{baseCode}</span>}
      </div>
      {selected && selected !== baseCode && (
        <p className="mt-1 text-[11.5px] text-white/55" role="status">
          {rates
            ? `Converted from ${baseCode} · live rates.`
            : ratesError
              ? `Live rates unavailable — showing exact ${baseCode} price.`
              : "Fetching live rates…"}
        </p>
      )}
      {roi && <div className="mt-1 text-[13px] text-white/70">Est. ROI {roi}</div>}

      {children}
    </div>
  );
}
