import type { Metadata } from "next";
import { Suspense } from "react";
import { getCityFacets, getPropertyTypes, getPublishedMarketCities, getPublishedMarkets, getPublishedProjects, getSections } from "@/lib/content";
import { buildMetadata } from "@/lib/seo";
import { PageHero } from "@/components/site/PageHero";
import { ProjectCard } from "@/components/site/ProjectCard";
import { Reveal } from "@/components/site/Reveal";
import { Button3D } from "@/components/ui/Button3D";
import { ProjectFilters } from "./ProjectFilters";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/projects", { title: "Premium Projects Across The Globe" });
}

type SP = Promise<{ market?: string; city?: string; type?: string; status?: string; q?: string }>;

export default async function ProjectsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const [projects, markets, marketCitiesMap, types, sections, cityFacets] = await Promise.all([getPublishedProjects({ market: sp.market, city: sp.city, type: sp.type, status: sp.status, q: sp.q }), getPublishedMarkets(), getPublishedMarketCities(), getPropertyTypes(), getSections("projects"), getCityFacets()]);
  const hero = sections.find((s) => s.key === "hero");
  const activeMarket = markets.find((m) => m.slug === sp.market);

  return (
    <>
      <PageHero eyebrow={hero?.eyebrow || "Portfolio"} title={activeMarket ? `Projects in ${activeMarket.name}` : hero?.title || "Premium Projects Across The Globe"} body={activeMarket ? activeMarket.tagline : hero?.body} crumbs={[{ name: "Home", href: "/" }, { name: "Projects", href: "/projects" }, ...(activeMarket ? [{ name: activeMarket.name, href: `/projects?market=${activeMarket.slug}` }] : [])]}>
        <Suspense fallback={<div className="skeleton mt-10 h-24 rounded-3xl" />}>
          <ProjectFilters markets={markets.map((m) => ({ id: m.id, slug: m.slug, name: m.name, flag: m.flag, cities: marketCitiesMap[m.id] }))} types={types} cities={cityFacets} />
        </Suspense>
      </PageHero>

      <section className="pb-24" aria-live="polite">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
          <p className="mb-6 text-[13px] text-charcoal/60">{projects.length} {projects.length === 1 ? "project" : "projects"} found</p>
          {projects.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-ink/15 bg-white/60 p-16 text-center">
              <h2 className="text-[20px] font-semibold text-ink">No projects match these filters</h2>
              <p className="mt-2 text-[14px] text-charcoal/70">Try a different market or clear the filters. Our advisors can also source off-market opportunities.</p>
              <div className="mt-6 flex justify-center gap-3"><Button3D href="/projects" variant="secondary">Clear Filters</Button3D><Button3D href="/contact">Contact an Advisor</Button3D></div>
            </div>
          ) : (
            <Reveal stagger="[data-pc]" className="perspective grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {projects.map((p, i) => <div key={p.id} data-pc><ProjectCard project={p} priority={i < 4} /></div>)}
            </Reveal>
          )}
        </div>
      </section>
    </>
  );
}
