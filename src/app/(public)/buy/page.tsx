import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { MarketplacePage, type MarketplaceSearchParams } from "@/components/marketplace/MarketplacePage";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/buy", { title: "Properties for Sale Across The Globe" });
}

export default async function BuyPage({ searchParams }: { searchParams: Promise<MarketplaceSearchParams> }) {
  const sp = await searchParams;
  return <MarketplacePage purpose="sale" searchParams={sp} />;
}
