import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getPublishedMarkets, getNewsCategories, getPublishedNews, getSections } from "@/lib/content";
import { buildMetadata } from "@/lib/seo";
import { PageHero } from "@/components/site/PageHero";
import { Reveal } from "@/components/site/Reveal";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/news", {
    title: "News & Market Insights",
    description: "Market reports, investment guides and updates from MR.HOME across 10 global real estate markets.",
  });
}

type SP = Promise<{ market?: string; category?: string }>;

export default async function NewsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const [articles, markets, categories, sections] = await Promise.all([
    getPublishedNews({ market: sp.market, category: sp.category }),
    getPublishedMarkets(),
    getNewsCategories(),
    getSections("news"),
  ]);
  const hero = sections.find((s) => s.key === "hero");

  return (
    <>
      <PageHero
        eyebrow={hero?.eyebrow ?? "News"}
        title={hero?.title ?? "News & Market Insights"}
        body={hero?.body ?? "Market reports, investment guides and updates from our advisors worldwide."}
        crumbs={[{ name: "Home", href: "/" }, { name: "News", href: "/news" }]}
      >
        <div className="mt-8 flex flex-wrap gap-2" role="navigation" aria-label="News filters">
          <Filters markets={markets.map((m) => ({ slug: m.slug, name: m.name, flag: m.flag }))} categories={categories} activeMarket={sp.market} activeCategory={sp.category} />
        </div>
      </PageHero>

      <section className="pb-24" aria-live="polite">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
          <p className="mb-6 text-[13px] text-charcoal/60">
            {articles.length} {articles.length === 1 ? "article" : "articles"}
            {(sp.market || sp.category) && (
              <>
                {" "}— <Link href="/news" className="text-brand underline underline-offset-2">clear filters</Link>
              </>
            )}
          </p>
          {articles.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-ink/15 bg-white/60 p-16 text-center">
              <h2 className="text-[20px] font-semibold text-ink">No articles yet</h2>
              <p className="mt-2 text-[14px] text-charcoal/70">Our advisors publish market reports and guides here — check back soon.</p>
            </div>
          ) : (
            <Reveal stagger="[data-nc]" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {articles.map((a) => (
                <Link
                  key={a.id}
                  data-nc
                  href={`/news/${a.slug}`}
                  className="group flex flex-col overflow-hidden rounded-3xl border border-ink/8 bg-white shadow-card transition-transform duration-300 hover:-translate-y-1"
                >
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-ivory-deep">
                    {a.coverImage ? (
                      <Image src={a.coverImage} alt={a.coverImageAlt || a.title} fill className="object-cover transition-transform duration-500 group-hover:scale-105" sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw" />
                    ) : null}
                    {a.category && (
                      <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-ink backdrop-blur">
                        {a.category}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <p className="text-[12px] text-charcoal/60">
                      {a.marketFlag} {a.marketName || a.country} · {formatDateTime(a.publishedAt || a.createdAt)}
                    </p>
                    <h2 className="mt-2 text-[18px] font-semibold leading-snug text-ink group-hover:text-brand">{a.title}</h2>
                    {a.excerpt && <p className="mt-3 line-clamp-3 text-[14px] leading-relaxed text-charcoal/75">{a.excerpt}</p>}
                    <span className="mt-auto pt-4 text-[13px] font-medium text-brand">Read article →</span>
                  </div>
                </Link>
              ))}
            </Reveal>
          )}
        </div>
      </section>
    </>
  );
}

function Filters({
  markets,
  categories,
  activeMarket,
  activeCategory,
}: {
  markets: { slug: string; name: string; flag: string }[];
  categories: string[];
  activeMarket?: string;
  activeCategory?: string;
}) {
  const qs = (p: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `/news?${s}` : "/news";
  };
  return (
    <>
      <FilterChip href={qs({})} active={!activeMarket && !activeCategory}>All</FilterChip>
      {categories.map((c) => (
        <FilterChip key={c} href={qs({ category: c, market: activeMarket })} active={activeCategory === c}>{c}</FilterChip>
      ))}
      {markets.map((m) => (
        <FilterChip key={m.slug} href={qs({ market: m.slug, category: activeCategory })} active={activeMarket === m.slug}>
          {m.flag} {m.name}
        </FilterChip>
      ))}
    </>
  );
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-4 py-2 text-[13px] transition-colors ${active ? "border-brand bg-brand text-white" : "border-ink/15 bg-white/70 text-ink hover:border-brand/50"}`}
    >
      {children}
    </Link>
  );
}
