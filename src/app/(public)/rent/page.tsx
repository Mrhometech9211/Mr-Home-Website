import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { isRentPublic } from "@/lib/content";
import { MarketplacePage, type MarketplaceSearchParams } from "@/components/marketplace/MarketplacePage";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  if (!(await isRentPublic())) return { title: "Rentals", robots: { index: false, follow: false } };
  return buildMetadata("/rent", { title: "Homes for Rent Across The Globe" });
}

export default async function RentPage({ searchParams }: { searchParams: Promise<MarketplaceSearchParams> }) {
  if (!(await isRentPublic())) notFound();
  const sp = await searchParams;
  return <MarketplacePage purpose="rent" searchParams={sp} />;
}
