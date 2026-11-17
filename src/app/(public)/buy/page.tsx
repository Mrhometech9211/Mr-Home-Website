import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata, resolvePageSeo } from "@/lib/seo";
import { MarketplacePage, type MarketplaceSearchParams } from "@/components/marketplace/MarketplacePage";
import { getPublishedProjectLocations, getSections } from "@/lib/content";
import { JsonLd } from "@/components/site/Breadcrumbs";
import { webPageJsonLd } from "@/lib/structured-data";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/buy", { title: "Properties for Sale Across The Globe" });
}

export default async function BuyPage({ searchParams }: { searchParams: Promise<MarketplaceSearchParams> }) {
  const sp = await searchParams;
  const [sections, locations] = await Promise.all([getSections("buy", true), getPublishedProjectLocations()]);
  const hero = sections.find((s) => s.key === "hero");
  const seo = await resolvePageSeo("/buy", {
    title: "Properties for Sale Across The Globe",
    description: hero?.body || "Curated apartments, villas and townhouses across our global markets.",
  }, { preview: true });
  const pageLd = webPageJsonLd({
    path: "/buy",
    canonical: seo.canonical,
    type: "CollectionPage",
    name: seo.title,
    description: seo.description,
  });
  return (
    <>
      <JsonLd data={pageLd} />
      <MarketplacePage
      purpose="sale"
      searchParams={sp}
      hero={
        hero
          ? {
              eyebrow: hero.eyebrow,
              title: hero.title,
              subtitle: hero.subtitle,
              body: hero.body,
              ctaLabel: hero.ctaLabel,
              ctaHref: hero.ctaHref,
              secondaryCtaLabel: hero.secondaryCtaLabel,
              secondaryCtaHref: hero.secondaryCtaHref,
            }
          : undefined
      }
      />

      {locations.length > 0 && (
        <section className="border-t border-ink/8 bg-ivory-deep/50 py-16" aria-labelledby="buy-by-city">
          <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
            <h2 id="buy-by-city" className="display text-[clamp(1.6rem,3vw,2.2rem)] text-ink">Browse properties for sale by city</h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-charcoal/70">
              These are the cities with live MR.HOME project inventory. Open a city to see the listings currently available there, or browse the wider market.
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {locations.map((l) => (
                <Link key={`${l.marketSlug}-${l.city}`} href={l.citySlug ? `/markets/${l.marketSlug}/${l.citySlug}` : `/buy?market=${l.marketSlug}&city=${encodeURIComponent(l.city)}`} className="group flex items-center justify-between rounded-2xl border border-ink/10 bg-white px-5 py-4 shadow-soft transition hover:border-brand hover:shadow-card">
                  <span>
                    <span className="block text-[15px] font-semibold text-ink">{l.city}</span>
                    <span className="mt-0.5 block text-[12.5px] text-charcoal/65">{l.marketName}</span>
                  </span>
                  <span className="text-[12.5px] font-medium text-brand">{l.count} {l.count === 1 ? "project" : "projects"} →</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
