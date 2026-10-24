import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { MarketplacePage, type MarketplaceSearchParams } from "@/components/marketplace/MarketplacePage";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/rent", { title: "Homes for Rent Across The Globe" });
}

export default async function RentPage({ searchParams }: { searchParams: Promise<MarketplaceSearchParams> }) {
  const sp = await searchParams;
  return <MarketplacePage purpose="rent" searchParams={sp} />;
}
