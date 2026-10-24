import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, KeyRound, Building2 } from "lucide-react";
import type { PropertyWithMarket } from "@/lib/content";
import { formatPrice } from "@/lib/utils";

type Props = { saleCount: number; rentCount: number; featured: PropertyWithMarket[] };

/**
 * Phase 2: Buy / Rent call-to-action band rendered between the homepage hero
 * and the Why Mr.Home section, using the site's existing card language.
 */
export function MarketCTA({ saleCount, rentCount, featured }: Props) {
  return (
    <section className="relative pb-8 pt-4" aria-label="Buy or rent property with Mr.Home">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/buy"
            className="card-3d group relative overflow-hidden rounded-[28px] border border-ink/8 bg-white shadow-card transition-shadow duration-500 hover:shadow-[0_30px_60px_-24px_rgba(17,20,17,0.35)]"
          >
            <div className="flex items-start justify-between p-7 sm:p-8">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
                  <Building2 className="h-3.5 w-3.5" aria-hidden /> For Sale
                </span>
                <h2 className="mt-3 text-[24px] font-semibold tracking-tight text-ink sm:text-[26px]">Buy a Property</h2>
                <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-charcoal/75">
                  Explore {saleCount === 1 ? "1 curated listing" : `${saleCount} curated listings`} across our global markets — apartments, villas and townhouses.
                </p>
                <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-glow transition-transform duration-300 group-hover:-translate-y-0.5">
                  Browse Properties for Sale <ArrowUpRight className="h-4 w-4" aria-hidden />
                </span>
              </div>
            </div>
            {featured[0]?.coverImage && (
              <div className="relative mx-7 mb-7 h-40 overflow-hidden rounded-2xl sm:mx-8 sm:h-48">
                <Image src={featured[0].coverImage} alt={featured[0].title ? `${featured[0].title} — featured listing` : "Featured property"} fill className="object-cover transition-transform duration-700 group-hover:scale-105" sizes="(min-width:768px) 46vw, 92vw" />
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgba(5,8,12,0.65))]" />
                <div className="absolute inset-x-4 bottom-3 text-white">
                  <span className="text-[12px] text-white/85">{[featured[0].city, featured[0].market?.name].filter(Boolean).join(", ")}</span>
                  <span className="block text-[14px] font-semibold">{featured[0].title} · {formatPrice(featured[0].price, featured[0].currency)}</span>
                </div>
              </div>
            )}
          </Link>

          <Link
            href="/rent"
            className="card-3d group relative overflow-hidden rounded-[28px] border border-ink/8 bg-white shadow-card transition-shadow duration-500 hover:shadow-[0_30px_60px_-24px_rgba(17,20,17,0.35)]"
          >
            <div className="flex items-start justify-between p-7 sm:p-8">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
                  <KeyRound className="h-3.5 w-3.5" aria-hidden /> For Rent
                </span>
                <h2 className="mt-3 text-[24px] font-semibold tracking-tight text-ink sm:text-[26px]">Rent a Property</h2>
                <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-charcoal/75">
                  {rentCount === 1 ? "1 quality rental" : `${rentCount} quality rentals`} — furnished and unfurnished homes, ready to move in.
                </p>
                <span className="mt-5 inline-flex items-center gap-2 rounded-full border border-ink/15 bg-ink px-5 py-2.5 text-[13.5px] font-semibold text-white transition-transform duration-300 group-hover:-translate-y-0.5">
                  Browse Rental Homes <ArrowUpRight className="h-4 w-4" aria-hidden />
                </span>
              </div>
            </div>
            {featured[1]?.coverImage && (
              <div className="relative mx-7 mb-7 h-40 overflow-hidden rounded-2xl sm:mx-8 sm:h-48">
                <Image src={featured[1].coverImage} alt={featured[1].title ? `${featured[1].title} — featured rental` : "Featured rental"} fill className="object-cover transition-transform duration-700 group-hover:scale-105" sizes="(min-width:768px) 46vw, 92vw" />
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgba(5,8,12,0.65))]" />
                <div className="absolute inset-x-4 bottom-3 text-white">
                  <span className="text-[12px] text-white/85">{[featured[1].city, featured[1].market?.name].filter(Boolean).join(", ")}</span>
                  <span className="block text-[14px] font-semibold">{featured[1].title} · {formatPrice(featured[1].price, featured[1].currency)}{featured[1].rentPeriod === "year" ? "/yr" : "/mo"}</span>
                </div>
              </div>
            )}
          </Link>
        </div>
      </div>
    </section>
  );
}
