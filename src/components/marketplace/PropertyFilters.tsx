"use client";

/**
 * Provident-style marketplace filter row (MR.HOME visual language):
 *  [ search ] [Property Type ▾] [Price ▾] [Beds ▾] [Size ▾] [Filters ▾] [Search]
 * Beds offers Studio → 7 (plain numbers, no "1+"). Size is a unit-only picker
 * (Sqft / Sqmt / Marla / Kanal) — no min/max range selection.
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Search, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Market = { id: number; slug: string; name: string; flag: string; cities?: string[] };
type CityOption = { name: string; marketId: number | null };
type Props = {
  purpose: "sale" | "rent";
  markets: Market[];
  types: string[];
  /** Display currency options — sale marketplaces only. */
  currencies?: string[];
  /** All published cities (admin Cities + cities used by projects/listings). */
  cities?: CityOption[];
};

const AREA_UNITS = [
  { value: "sqft", label: "Sqft" },
  { value: "sqmt", label: "Sqmt" },
  { value: "marla", label: "Marla" },
  { value: "kanal", label: "Kanal" },
] as const;
type AreaUnit = (typeof AREA_UNITS)[number]["value"];

const CHIP_KEYS = ["market", "city", "type", "minPrice", "maxPrice", "beds", "maxBeds", "minArea", "maxArea", "period", "ref", "currency", "sort", "unit"] as const;

const UNIT_CHIP_LABELS: Record<string, string> = { sqft: "Sqft", sqmt: "Sqmt", marla: "Marla", kanal: "Kanal" };
// `minArea`/`maxArea` remain for legacy saved URLs; the Size panel is unit-only now.

const KEY_LABELS: Record<string, string> = {
  market: "Market", city: "City", type: "Type", beds: "Min beds", maxBeds: "Max beds",
  minPrice: "Min price", maxPrice: "Max price", minArea: "Min area", maxArea: "Max area",
  period: "Period", ref: "Ref #", currency: "Currency", unit: "Unit",
};

/** Canonical Provident-style property types — shown alongside the types actually used by live listings. */
const BASE_TYPES = ["Apartment", "Villa", "Townhouse", "Duplex", "Penthouse", "Studio", "Office", "Shop", "Retail", "Land / Plot", "Farmhouse", "Building", "Warehouse"] as const;

/** Full labelled dropdown options: min starts at Studio, plain numbers up to 7. */
const BED_MIN_OPTIONS = [{ value: "0", label: "Studio" }, ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: String(n) }))];
const BED_MAX_OPTIONS = [{ value: "0", label: "Studio" }, ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: String(n) }))];

const TRIGGER =
  "inline-flex h-12 items-center gap-2 rounded-xl border border-ink/10 bg-white px-4 text-[13.5px] font-medium text-ink outline-none transition hover:border-brand/50 focus-visible:border-brand active:scale-[0.98]";

export function PropertyFilters(props: Props) {
  const { purpose, markets, types, currencies, cities = [] } = props;
  const isRent = purpose === "rent";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Phones render the open panel through a portal on <body>. A fixed sheet
  // inside the page hero gets clipped by its overflow/transform context, which
  // left the lower half of the sheet invisible and unclickable.
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches);

  /** Apply several filter keys in ONE navigation — two sequential replaces built
   *  from stale params dropped the first value (e.g. Beds min was lost). */
  const updateMany = useCallback(
    (entries: [string, string][]) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of entries) {
        if (value) next.set(key, value); else next.delete(key);
      }
      next.delete("page");
      start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
    },
    [params, pathname, router],
  );

  const update = useCallback(
    (key: string, value: string) => updateMany([[key, value]]),
    [updateMany],
  );

  /** Resets every filter including the search box, back to the plain list. */
  const clearAll = useCallback(() => {
    start(() => router.replace(pathname, { scroll: false }));
  }, [pathname, router, start]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(mq.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Close a menu on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      // The phone sheet is portaled to <body>, outside rootRef — keep it open
      // for clicks inside the sheet itself.
      if (target instanceof Element && target.closest("[data-filter-sheet]")) return;
      setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  // Lock page scroll while a bottom sheet is open on phones (desktop dropdowns
  // must not freeze the page). The mrh-menu-open class also hides floating
  // CTAs (WhatsApp bubble) so they can never sit over a sheet option.
  useEffect(() => {
    if (!open) return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.classList.add("mrh-menu-open");
    return () => {
      document.body.style.overflow = prev;
      document.documentElement.classList.remove("mrh-menu-open");
    };
  }, [open]);

  const market = params.get("market") ?? "";
  const city = params.get("city") ?? "";
  // Cities from the admin Cities module (and the cities live projects/listings
  // use) are always selectable — not only after picking a market first.
  const activeMarket = markets.find((m) => m.slug === market);
  const cityOptions = Array.from(
    new Set([
      ...(activeMarket?.cities ?? []),
      ...cities.filter((c) => !activeMarket || c.marketId === activeMarket.id).map((c) => c.name),
    ]),
  ).sort((a, b) => a.localeCompare(b));
  const beds = params.get("beds") ?? "";
  const sort = params.get("sort") ?? "";
  const unit = (AREA_UNITS.find((u) => u.value === (params.get("unit") || "sqft")) ?? AREA_UNITS[0]).value as AreaUnit;
  const unitLabel = unit === "sqft" ? "Sqft" : unit === "sqmt" ? "Sqmt" : unit === "marla" ? "Marla" : "Kanal";
  const activeType = types.find((t) => t === params.get("type")) ?? null;
  /** Provident parity: show every canonical type plus any live-listing type not already covered. */
  const typeOptions = [...BASE_TYPES, ...types.filter((t) => !BASE_TYPES.some((b) => b.toLowerCase() === t.toLowerCase()))];
  const maxBeds = params.get("maxBeds") ?? "";
  const hasAny = CHIP_KEYS.some((k) => params.get(k));
  const activeCount = CHIP_KEYS.filter((k) => params.get(k)).length;
  const searchFormId = `market-search-form-${purpose}`;

  const applySearch = () => {
    const el = document.getElementById(`market-search-${purpose}`) as HTMLInputElement | null;
    update("q", (el?.value ?? "").trim());
  };

  const applyPrice = (f: HTMLFormElement) => {
    const minEl = f.elements.namedItem("pMin") as HTMLInputElement | null;
    const maxEl = f.elements.namedItem("pMax") as HTMLInputElement | null;
    updateMany([["minPrice", (minEl?.value ?? "").trim()], ["maxPrice", (maxEl?.value ?? "").trim()]]);
    setOpen(null);
  };

  const applyBeds = (f: HTMLFormElement) => {
    const minEl = f.elements.namedItem("bMin") as HTMLSelectElement | null;
    const maxEl = f.elements.namedItem("bMax") as HTMLSelectElement | null;
    updateMany([["beds", minEl?.value ?? ""], ["maxBeds", maxEl?.value ?? ""]]);
    setOpen(null);
  };

  /** Unit-only: choosing Sqft / Sqmt / Marla / Kanal just re-renders listings in that unit. */
  const applySize = (f: HTMLFormElement) => {
    const unitEl = f.elements.namedItem("uSel") as HTMLSelectElement | null;
    const u = (unitEl?.value ?? "sqft") as AreaUnit;
    update("unit", u);
    setOpen(null);
  };

  const fieldLabel = "mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-mist";
  const inputCls = "h-10 w-full rounded-lg border border-ink/10 bg-white px-3 text-[13.5px] text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10";

  const labelled = (label: string, node: React.ReactNode) => (
    <div><span className={fieldLabel}>{label}</span>{node}</div>
  );
  const selectRow = (label: string, value: string, onValue: (v: string) => void, options: { value: string; label: string }[], disabled = false) =>
    labelled(label, (
      <select value={value} onChange={(e) => onValue(e.target.value)} className={inputCls} disabled={disabled}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    ));

  const radioRow = (active: boolean, label: React.ReactNode) =>
    cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13.5px] transition", active ? "bg-brand/10 font-semibold text-brand" : "text-charcoal hover:bg-slate-50");

  const panel = (name: string, label: string, badge: string | null, content: React.ReactNode, align: "left" | "right" = "left") => {
    const expanded = open === name;
    const active = !!badge;
    // Single panel body used either as an anchored desktop dropdown or as a
    // phone bottom sheet rendered through a portal on <body>.
    const panelEl = (
      <div role="dialog" aria-label={label} data-filter-sheet className={cn(
        "absolute top-[calc(100%+8px)] z-[60] max-h-[min(70vh,560px)] w-[290px] max-w-[calc(100vw-24px)] overflow-y-auto overscroll-contain rounded-2xl border border-ink/8 bg-white p-4 shadow-[0_24px_60px_-18px_rgba(17,20,17,0.25)]",
        "max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:z-[95] max-md:max-h-[min(78dvh,640px)] max-md:w-auto max-md:max-w-none max-md:rounded-b-none max-md:rounded-t-3xl max-md:px-5 max-md:pt-3 max-md:pb-[max(1.25rem,env(safe-area-inset-bottom))]",
        align === "right" ? "md:left-auto md:right-0" : "left-0 md:right-auto",
      )}>
        <div className="mb-3 flex items-center justify-between md:hidden">
          <span className="text-[13px] font-semibold uppercase tracking-[0.12em] text-charcoal/70">{label}</span>
          <button type="button" aria-label={`Close ${label}`} onClick={() => setOpen(null)} className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/10 text-charcoal"><X className="h-4 w-4" /></button>
        </div>
        {content}
      </div>
    );
    const sheet = (
      <>
        {/* Backdrop + sheet sit above the cookie-consent card (z-80) and the
            WhatsApp float. Portaled on phones so the hero's overflow/transform
            context cannot clip the lower half of the sheet. */}
        <div aria-hidden className="fixed inset-0 z-[85] bg-ink/45 backdrop-blur-[2px] md:hidden" onClick={() => setOpen(null)} />
        {panelEl}
      </>
    );
    return (
      // The open trigger lifts its own stacking context so the panel it owns can
      // never be painted underneath a later sibling (that was the "market card is
      // hidden beneath another card" bug on /buy).
      <div className={cn("relative shrink-0 max-md:w-full", expanded ? "z-40" : "z-0")}>
        <button type="button" aria-haspopup="dialog" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : name)} className={cn(TRIGGER, active && "border-brand bg-brand/5")}>
          {/* The Filters trigger keeps its name and shows the count, so it is
              always obvious where to reopen the panel. */}
          <span className="whitespace-nowrap">{badge && name === "more" ? `${label} · ${badge}` : badge ?? label}</span>
          <ChevronDown className={cn("h-4 w-4 text-mist transition-transform", expanded && "rotate-180")} />
        </button>
        {expanded && (isMobile && typeof document !== "undefined" ? createPortal(sheet, document.body) : sheet)}
      </div>
    );
  };

  return (
    <div className={cn("transition-opacity", pending && "pointer-events-none opacity-60")} role="search" aria-label={`Filter ${isRent ? "rental" : "sale"} properties`}>
  <h2 className="display mb-5 text-[clamp(2rem,4vw,3rem)] leading-[1.05] tracking-tight text-ink">
    Your home search <span className="italic text-brand-bright">starts here</span>
  </h2>

      {/* Mobile: single wrapping row keeps controls full-width; ≥md uses the inline Provident layout. */}
      <div ref={rootRef} className="relative z-40 flex flex-wrap items-stretch gap-2 max-md:flex-col">
        <form id={searchFormId} onSubmit={(e) => { e.preventDefault(); applySearch(); }} className="relative min-w-[240px] flex-1 md:min-w-[300px]">
          <label htmlFor={`market-search-${purpose}`} className="sr-only">Search by area, project or community</label>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" />
          <input
            id={`market-search-${purpose}`}
            name="q"
            defaultValue={params.get("q") ?? ""}
            key={`q-${params.get("q") ?? ""}`}
            placeholder="Area, project or community"
            className="h-12 w-full rounded-xl border border-ink/10 bg-white pl-10 pr-4 text-[13.5px] text-ink placeholder:text-charcoal/40 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
          />
        </form>

        {/* Property Type */}
        {panel("type", "Property Type", activeType, (
          <div className="space-y-1">
            {[{ v: "", label: "All types" as const }, ...typeOptions.map((t) => ({ v: t, label: t }))].map((o) => (
              <button key={o.v || "all"} type="button" onClick={() => update("type", o.v)} className={radioRow((params.get("type") ?? "") === o.v, o.label)}>
                <span className={cn("h-3.5 w-3.5 shrink-0 rounded-full border", (params.get("type") ?? "") === o.v ? "border-brand bg-brand ring-2 ring-brand/20" : "border-ink/20")} />{o.label}
              </button>
            ))}
          </div>
        ))}

        {/* Price */}
        {panel("price", "Price", params.get("minPrice") || params.get("maxPrice") ? "Price" : null, (
          <form onSubmit={(e) => { e.preventDefault(); applyPrice(e.currentTarget); }}>
            <div className="grid grid-cols-2 gap-2">
              {labelled("Min price", <input name="pMin" type="number" inputMode="numeric" min={0} placeholder="0" defaultValue={params.get("minPrice") ?? ""} key={`pmin-${params.get("minPrice") ?? ""}`} className={inputCls} aria-label="Minimum price" />)}
              {labelled("Max price", <input name="pMax" type="number" inputMode="numeric" min={0} placeholder="Any" defaultValue={params.get("maxPrice") ?? ""} key={`pmax-${params.get("maxPrice") ?? ""}`} className={inputCls} aria-label="Maximum price" />)}
            </div>
            <p className="mt-2 text-[11.5px] text-mist">Prices in {params.get("currency") ?? "listing currency"}</p>
            <BtnApply />
          </form>
        ))}

        {/* Beds — Provident-style Min / Max dropdowns: Studio → 7 only, plain numbers (no "No min"/"No max") */}
        {panel("beds", "Beds", beds || maxBeds ? "Beds" : null, (
          <form onSubmit={(e) => { e.preventDefault(); applyBeds(e.currentTarget); }}>
            <div className="grid grid-cols-2 gap-2">
              {labelled("Min beds", (
                <select name="bMin" defaultValue={beds} key={`bmin-${beds}`} className={`${inputCls} ${!beds ? "text-charcoal/40" : ""}`} aria-label="Minimum bedrooms">
                  <option value="" disabled hidden>Min</option>
                  {BED_MIN_OPTIONS.map((o) => <option key={`min-${o.value}`} value={o.value}>{o.label}</option>)}
                </select>
              ))}
              {labelled("Max beds", (
                <select name="bMax" defaultValue={maxBeds} key={`bmax-${maxBeds}`} className={`${inputCls} ${!maxBeds ? "text-charcoal/40" : ""}`} aria-label="Maximum bedrooms">
                  <option value="" disabled hidden>Max</option>
                  {BED_MAX_OPTIONS.map((o) => <option key={`max-${o.value}`} value={o.value}>{o.label}</option>)}
                </select>
              ))}
            </div>
            <button type="button" onClick={() => { update("beds", ""); update("maxBeds", ""); setOpen(null); }} className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-charcoal/70 hover:text-brand"><X className="h-3.5 w-3.5" /> Clear beds</button>
            <BtnApply />
          </form>
        ))}

        {/* Size — unit selector only (Sqft / Sqmt / Marla / Kanal), no min/max range */}
        {panel("size", "Size", unit !== "sqft" ? unitLabel : null, (
          <form onSubmit={(e) => { e.preventDefault(); applySize(e.currentTarget); }}>
            {labelled("Unit", (
              <select name="uSel" defaultValue={unit} key={`unit-${unit}`} className={inputCls} aria-label="Area unit">
                {AREA_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            ))}
            <p className="mt-2 text-[11.5px] text-mist">Listings and project areas are shown in the selected unit.</p>
            <BtnApply />
          </form>
        ), "right")}

        {/* Filters — everything else */}
        {panel("more", "Filters", activeCount > 0 ? String(activeCount) : null, (
          <div className="space-y-3">
            {selectRow("Market", market, (v) => updateMany([["market", v], ["city", ""]]), [{ value: "", label: "All markets" }, ...markets.map((m) => ({ value: m.slug, label: m.name }))])}
            {selectRow("City", city, (v) => update("city", v), [{ value: "", label: "All cities" }, ...cityOptions.map((c) => ({ value: c, label: c }))])}
            {isRent && selectRow("Rent period", params.get("period") ?? "", (v) => update("period", v), [{ value: "", label: "Any" }, { value: "month", label: "Monthly" }, { value: "year", label: "Yearly" }])}

            {!isRent && selectRow("Display currency", params.get("currency") ?? "", (v) => update("currency", v), [{ value: "", label: "Listing currency" }, ...(currencies ?? []).map((c) => ({ value: c, label: c }))])}
            {selectRow("Sort listings", sort, (v) => update("sort", v), [
              { value: "", label: "Newest first" },
              { value: "price-asc", label: "Price: low to high" },
              { value: "price-desc", label: "Price: high to low" },
              { value: "area-desc", label: "Largest area first" },
            ])}
            {hasAny && (
              <button type="button" onClick={() => { clearAll(); setOpen(null); }} className="mt-1 inline-flex items-center gap-1.5 text-[12.5px] text-charcoal/70 hover:text-brand"><X className="h-3.5 w-3.5" /> Clear all filters</button>
            )}
          </div>
        ), "right")}

        {/* Search action — MR.HOME brand button (no Save control, not Provident's colours) */}
        <button type="button" onClick={applySearch} aria-label="Search properties" className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-brand px-5 text-[14px] font-semibold text-white shadow-glow transition hover:bg-brand-deep active:scale-[0.98]">
          <Search className="h-4 w-4" /> Search
        </button>
      </div>

      <ActiveFilterChips onClear={clearAll} />
    </div>
  );
}

function BtnApply() {
  return (
    <button type="submit" className="mt-3 h-10 w-full rounded-lg bg-brand text-[13.5px] font-semibold text-white transition hover:bg-brand-deep active:scale-[0.98]">
      Apply
    </button>
  );
}

const SORT_CHIP_LABELS: Record<string, string> = {
  "price-asc": "Price low to high",
  "price-desc": "Price high to low",
  "area-desc": "Largest area",
};

function ActiveFilterChips({ onClear }: { onClear: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, start] = useTransition();
  const chips = CHIP_KEYS.filter((k) => params.get(k)).map((k) => ({ key: k, value: params.get(k) ?? "" }));
  if (chips.length === 0) return null;
  const chipValue = (key: string, value: string) => {
    if (key === "sort") return SORT_CHIP_LABELS[value] ?? value;
    if (key === "beds" || key === "maxBeds") return value === "0" ? "Studio" : value;
    if (key === "amenity") {
      const labels = value.split(",").filter(Boolean);
      return labels.length > 1 ? `${labels[0]} +${labels.length - 1}` : labels[0];
    }
    if (key === "unit") return UNIT_CHIP_LABELS[value] ?? value;
    if (key === "minArea" || key === "maxArea") return `${value} m²`;
    return value;
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {chips.map(({ key, value }) => (
        <span key={key} className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-3 py-1.5 text-[12.5px] text-charcoal">
          {KEY_LABELS[key] ?? key}: {chipValue(key, value)}
          <button type="button" aria-label={`Remove filter ${key}`} onClick={() => {
            const next = new URLSearchParams(params.toString());
            next.delete(key);
            next.delete("page");
            start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
          }} className="text-charcoal/50 hover:text-brand"><X className="h-3 w-3" /></button>
        </span>
      ))}
      <button type="button" onClick={onClear} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] text-charcoal/70 hover:text-brand">
        <X className="h-3.5 w-3.5" /> Clear all
      </button>
    </div>
  );
}
