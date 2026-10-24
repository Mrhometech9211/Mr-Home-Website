import Link from "next/link";
import { Suspense } from "react";
import { getCityFacets, getPropertyFacets, getPublishedMarkets, getPublishedMarketCities, getPublishedProjects, type ProjectWithMarket, type PropertyQuery } from "@/lib/content";
import { PageHero } from "@/components/site/PageHero";
import { Button3D } from "@/components/ui/Button3D";
import { ProjectCard } from "@/components/site/ProjectCard";
import { PropertyCard } from "./PropertyCard";
import { PropertyFilters } from "./PropertyFilters";
import { getPublishedProperties } from "@/lib/content";

/**
 * A project's bedrooms field is free text ("1–3", "Studio–2", "5 BR").
 * Return the range it covers so the Beds filter can keep the Buy/Rent project
 * strip accurate too.
 */
function bedroomRange(raw: string | null | undefined): [number, number] | null {
  if (!raw) return null;
  const text = raw.toLowerCase();
  const nums = text.match(/\d+/g)?.map(Number);
  if (!nums || nums.length === 0) return /studio/.test(text) ? [0, 0] : null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return /studio/.test(text) ? [0, max] : [min, max];
}

function matchesBedFilter(project: ProjectWithMarket, min?: number, max?: number): boolean {
  if (min == null && max == null) return true;
  const range = bedroomRange(project.bedrooms);
  if (!range) return true; // unknown range — never hide a project on a guess
  if (min != null && range[1] < min) return false;
  if (max != null && max > 0 && range[0] > max) return false;
  return true;
}

export type MarketplaceSearchParams = Record<string, string | string[] | undefined>;

function first(sp: MarketplaceSearchParams, key: string): string | undefined {
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.length ? s : undefined;
}

/** Maps URL params onto the PropertyQuery filter contract. */
export function parsePropertyQuery(purpose: "sale" | "rent", sp: MarketplaceSearchParams, page: number): PropertyQuery {
  const num = (key: string) => {
    const raw = first(sp, key);
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    purpose,
    q: first(sp, "q"),
    market: first(sp, "market"),
    city: first(sp, "city"),
    type: first(sp, "type"),
    minPrice: num("minPrice"),
    maxPrice: num("maxPrice"),
    bedrooms: num("beds"),
    bathrooms: num("baths"),
    minArea: num("minArea"),
    maxArea: num("maxArea"),
    furnished: first(sp, "furnishing"),
    currency: purpose === "sale" ? first(sp, "currency") : undefined,
    period: purpose === "rent" ? first(sp, "period") : undefined,
    amenities: (first(sp, "amenity") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    ref: first(sp, "ref"),
    maxBedrooms: num("maxBeds"),
    sort: first(sp, "sort"),
    page,
    pageSize: 12,
  };
}

/** Rebuilds the current URL query for pagination links. */
export function buildPageHref(sp: MarketplaceSearchParams, page: number): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (!v) continue;
    params.set(k, Array.isArray(v) ? v[0] : v);
  }
  if (page > 1) params.set("page", String(page));
  else params.delete("page");
  const qs = params.toString();
  return qs ? `?${qs}` : "?";
}

type Props = {
  purpose: "sale" | "rent";
  searchParams: MarketplaceSearchParams;
};

export async function MarketplacePage({ purpose, searchParams }: Props) {
  const pageRaw = Number(first(searchParams, "page") ?? 1);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const query = parsePropertyQuery(purpose, searchParams, page);

  const [{ items, total }, markets, marketCitiesMap, facets, cityFacets, projects] = await Promise.all([
    getPublishedProperties(query),
    getPublishedMarkets(),
    getPublishedMarketCities(),
    getPropertyFacets(purpose),
    getCityFacets(),
    getPublishedProjects({
      purpose,
      market: query.market,
      city: query.city,
      type: query.type,
      q: query.q,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
    }),
  ]);
  // Projects tagged For Sale / For Rent appear on the matching marketplace, and
  // respect the same market/city/type/price/beds filters the visitor selected.
  const matchingProjects = projects.filter((p) => matchesBedFilter(p, query.bedrooms, query.maxBedrooms));

  const totalPages = Math.max(1, Math.ceil(total / (query.pageSize ?? 12)));
  const isRent = purpose === "rent";
  // URL unit values: sqft | sqmt | marla | kanal (sqmt maps to the legacy sqm display).
  const unitRaw = first(searchParams, "unit") ?? "sqft";
  const unit = (unitRaw === "sqmt" ? "sqm" : unitRaw) as "sqm" | "sqft" | "marla" | "kanal";

  return (
    <>
      <PageHero
        eyebrow={isRent ? "Rent" : "Buy"}
        title={isRent ? "Homes for Rent" : "Properties for Sale"}
        body={isRent ? "Quality rentals across our global markets — filter by market, price, rooms and area." : "Curated apartments, villas and townhouses across our global markets."}
        crumbs={[{ name: "Home", href: "/" }, { name: isRent ? "Rent" : "Buy", href: isRent ? "/rent" : "/buy" }]}
      >
        <Suspense fallback={<div className="skeleton mt-10 h-32 rounded-3xl" />}>
          <PropertyFilters
            purpose={purpose}
            markets={markets.map((m) => ({ id: m.id, slug: m.slug, name: m.name, flag: m.flag, cities: marketCitiesMap[m.id] }))}
            types={facets.types}
            currencies={facets.currencies}
            cities={cityFacets}
          />
        </Suspense>
      </PageHero>

      <section className="pb-24" aria-live="polite">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
          {matchingProjects.length > 0 && (
            <div className="mb-14">
              <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="eyebrow">{isRent ? "For Rent" : "For Sale"}</p>
                  <h2 className="display mt-2 text-[clamp(1.5rem,2.8vw,2.1rem)] text-ink">
                    {isRent ? "Projects available to rent" : "Projects for sale"}
                  </h2>
                </div>
                <Link
                  href={`/projects${query.market ? `?market=${query.market}` : ""}`}
                  className="text-[13.5px] font-medium text-brand hover:underline"
                >
                  All projects →
                </Link>
              </div>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid={`project-grid-${purpose}`}>
                {matchingProjects.map((p, i) => (
                  <ProjectCard key={`project-${p.id}`} project={p} priority={i < 4} />
                ))}
              </div>
            </div>
          )}

          <p className="mb-6 text-[13px] text-charcoal/60">
            {total === 1 ? "1 listing" : `${total} listings`} found{totalPages > 1 ? ` · page ${page} of ${totalPages}` : ""}
          </p>
          {items.length === 0 && matchingProjects.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-ink/15 bg-white/60 p-16 text-center">
              <h2 className="text-[20px] font-semibold text-ink">No {isRent ? "rentals" : "listings"} match these filters</h2>
              <p className="mt-2 text-[14px] text-charcoal/70">Try widening the price range or clearing filters. Our advisors can also source off-market options.</p>
              <div className="mt-6 flex justify-center gap-3">
                <Button3D href={isRent ? "/rent" : "/buy"} variant="secondary">Clear Filters</Button3D>
                <Button3D href="/contact">Contact an Advisor</Button3D>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid={`listing-grid-${purpose}`}>
              {items.map((p, i) => (
                <PropertyCard key={p.id} property={p} priority={i < 4} unit={unit} />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-2" data-testid={`listing-pagination-${purpose}`}>
              {page > 1 && (
                <Link href={buildPageHref(searchParams, page - 1)} className="rounded-full border border-ink/10 bg-white px-4 py-2 text-[13px] text-charcoal transition hover:border-brand/40" scroll={false}>
                  Previous
                </Link>
              )}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .map((p, idx, arr) => (
                  <span key={p} className="flex items-center gap-2">
                    {idx > 0 && arr[idx - 1] !== p - 1 && <span className="text-charcoal/40">…</span>}
                    <Link
                      href={buildPageHref(searchParams, p)}
                      aria-current={p === page ? "page" : undefined}
                      className={p === page ? "rounded-full bg-brand px-4 py-2 text-[13px] font-semibold text-white shadow-glow" : "rounded-full border border-ink/10 bg-white px-4 py-2 text-[13px] text-charcoal transition hover:border-brand/40"}
                      scroll={false}
                    >
                      {p}
                    </Link>
                  </span>
                ))}
              {page < totalPages && (
                <Link href={buildPageHref(searchParams, page + 1)} className="rounded-full border border-ink/10 bg-white px-4 py-2 text-[13px] text-charcoal transition hover:border-brand/40" scroll={false}>
                  Next
                </Link>
              )}
            </nav>
          )}
        </div>
      </section>
    </>
  );
}
