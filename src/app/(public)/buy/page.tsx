import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { MarketplacePage, type MarketplaceSearchParams } from "@/components/marketplace/MarketplacePage";
import { getSections } from "@/lib/content";
import { JsonLd } from "@/components/site/Breadcrumbs";
import { webPageJsonLd } from "@/lib/structured-data";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/buy", { title: "Properties for Sale Across The Globe" });
}

export default async function BuyPage({ searchParams }: { searchParams: Promise<MarketplaceSearchParams> }) {
  const sp = await searchParams;
  const hero = (await getSections("buy")).find((s) => s.key === "hero");
  const pageLd = webPageJsonLd({
    path: "/buy",
    type: "CollectionPage",
    name: hero?.title || "Properties for Sale",
    description: hero?.body || "Curated apartments, villas and townhouses across our global markets.",
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
    </>
  );
}
