import type { Metadata } from "next";
import { getProjectCountsByMarket, getPublishedMarketCities, getPublishedMarkets, getPublishedProjectCount, getPublishedProjects, getSections, getSettings } from "@/lib/content";
import { buildMetadata, resolvePageSeo } from "@/lib/seo";
import { HomeStage } from "@/components/home/HomeStage";
import { StatsBar } from "@/components/home/StatsBar";
import { WhySection } from "@/components/home/WhySection";
import { EarthSection } from "@/components/home/EarthSection";
import { ProjectsShowcase } from "@/components/home/ProjectsShowcase";
import { JourneySection } from "@/components/home/JourneySection";
import { InquirySection } from "@/components/home/InquirySection";
import { JsonLd } from "@/components/site/Breadcrumbs";
import { webPageJsonLd } from "@/lib/structured-data";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return buildMetadata("/", { title: s.seoDefaultTitle, description: s.seoDefaultDescription });
}

export default async function HomePage() {
  const [settings, sections, markets, projects, counts, marketCitiesMap, publishedProjectCount] = await Promise.all([
    getSettings(),
    getSections("home"),
    getPublishedMarkets(),
    getPublishedProjects({ limit: 12 }),
    getProjectCountsByMarket(),
    getPublishedMarketCities(),
    getPublishedProjectCount(),
  ]);
  const byKey = Object.fromEntries(sections.map((s) => [s.key, s]));
  const stats = byKey.stats?.items ?? [];
  const featured = projects.filter((p) => p.featured);
  const showcase = (featured.length >= 4 ? featured : projects).slice(0, 8);
  const formMarkets = markets.map((m) => ({ id: m.id, name: m.name, slug: m.slug, flag: m.flag, cities: marketCitiesMap[m.id] }));
  const formProjects = projects.map((p) => ({ id: p.id, name: p.name, marketId: p.marketId }));
  const seo = await resolvePageSeo("/", { title: settings.seoDefaultTitle, description: settings.seoDefaultDescription });
  const pageLd = webPageJsonLd({
    path: "/",
    canonical: seo.canonical,
    name: seo.title,
    description: seo.description,
  });

  return (
    <>
      <JsonLd data={pageLd} />
      {sections.map((sec) => {
        switch (sec.key) {
          case "hero":
            return (
              <HomeStage
                key={sec.id}
                introEnabled={settings.introVideoEnabled}
                videoSrc={settings.introVideoUrl}
                videoPoster={settings.introVideoPoster}
                logo={settings.logo}
                brandName={settings.brandName}
                eyebrow={sec.eyebrow}
                title={sec.title || settings.tagline}
                body={sec.body}
                ctaLabel={sec.ctaLabel}
                ctaHref={sec.ctaHref}
                secondaryCtaLabel={sec.secondaryCtaLabel}
                secondaryCtaHref={sec.secondaryCtaHref}
                image={sec.image || "/images/hero-villa.jpg"}
                marketCount={markets.length}
                publishedProjectCount={publishedProjectCount}
              />
            );
          case "stats":
            return <StatsBar key={sec.id} items={sec.items ?? []} />;
          case "why":
            return <WhySection key={sec.id} section={sec} />;
          case "earth":
            return <EarthSection key={sec.id} section={sec} markets={markets} projectCounts={counts} />;
          case "projects":
            return <ProjectsShowcase key={sec.id} section={sec} projects={showcase} />;
          case "journey":
            return <JourneySection key={sec.id} section={sec} stats={stats} />;
          case "inquiry":
            return <InquirySection key={sec.id} section={sec} settings={settings} markets={formMarkets} projects={formProjects} />;
          default:
            return null;
        }
      })}
    </>
  );
}
