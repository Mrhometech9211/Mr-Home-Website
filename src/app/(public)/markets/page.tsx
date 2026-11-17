import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { getProjectCountsByMarket, getPublishedMarketMetrics, getPublishedMarkets, getSections } from "@/lib/content";
import { buildMetadata, resolvePageSeo } from "@/lib/seo";
import { EarthSection } from "@/components/home/EarthSection";
import { Reveal } from "@/components/site/Reveal";
import { Breadcrumbs, JsonLd } from "@/components/site/Breadcrumbs";
import { webPageJsonLd } from "@/lib/structured-data";
import { MarketMetricsDashboard } from "@/components/markets/MarketMetricsDashboard";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/markets", { title: "Global Presence, Local Expertise" });
}

export default async function MarketsPage() {
  const [markets, counts, sections, metrics] = await Promise.all([getPublishedMarkets(), getProjectCountsByMarket(), getSections("markets"), getPublishedMarketMetrics()]);
  const hero = sections.find((s) => s.key === "hero");
  const section = { ...(hero ?? {}), id: 0, page: "markets", key: "earth", eyebrow: hero?.eyebrow ?? "Markets", title: hero?.title ?? "Global Presence, Local Expertise", body: hero?.body ?? null, ctaLabel: "Talk to an Advisor", ctaHref: "/contact", subtitle: null, secondaryCtaLabel: null, secondaryCtaHref: null, image: null, video: null, background: null, items: [], order: 0, enabled: true, updatedAt: new Date() };
  const seo = await resolvePageSeo("/markets", { title: "Global Presence, Local Expertise", description: hero?.body });
  const pageLd = webPageJsonLd({ path: "/markets", canonical: seo.canonical, type: "CollectionPage", name: seo.title, description: seo.description });

  return (
    <>
      <JsonLd data={pageLd} />
      <div className="bg-space pt-24"><div className="mx-auto max-w-[1400px] px-4 sm:px-6"><Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Markets", href: "/markets" }]} dark /></div></div>
      <EarthSection section={section} markets={markets} projectCounts={counts} standalone />
      <section className="py-20" aria-labelledby="all-markets">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
          <Reveal><p className="eyebrow">All Markets</p><h2 id="all-markets" className="display mt-4 text-[clamp(1.8rem,3.4vw,2.6rem)] text-ink">{markets.length} markets. One trusted advisor.</h2></Reveal>
          <Reveal stagger="[data-m]" className="perspective mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {markets.map((m) => (
              <Link key={m.id} data-m href={`/markets/${m.slug}`} className="card-3d group relative overflow-hidden rounded-[26px] shadow-card transition-transform duration-500 hover:-translate-y-2 hover:[transform:perspective(1000px)_rotateX(3deg)_translateY(-8px)]">
                <div className="relative aspect-[4/5]">
                  {m.coverImage && <Image src={m.coverImage} alt={m.name} fill className="object-cover transition-transform duration-700 group-hover:scale-105" sizes="(min-width:1280px) 20vw, (min-width:640px) 45vw, 90vw" />}
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_35%,rgba(5,8,12,0.85))]" />
                  <span className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white opacity-0 backdrop-blur transition group-hover:opacity-100 group-hover:bg-brand"><ArrowUpRight className="h-4 w-4" /></span>
                  <div className="absolute inset-x-5 bottom-5 text-white">
                    <div className="text-2xl" aria-hidden>{m.flag}</div>
                    <h3 className="mt-1 text-[20px] font-semibold tracking-tight">{m.name}</h3>
                    <p className="mt-1 line-clamp-2 text-[12.5px] text-white/70">{m.tagline}</p>
                    <p className="mt-2 text-[12px] font-medium text-brand-bright">{counts[m.id] ?? 0} projects</p>
                  </div>
                </div>
              </Link>
            ))}
          </Reveal>
        </div>
      </section>
      <MarketMetricsDashboard metrics={metrics} />
    </>
  );
}
