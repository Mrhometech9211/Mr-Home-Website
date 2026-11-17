import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import HomePage from "@/app/(public)/page";
import WhyPage from "@/app/(public)/why-mr-home/page";
import MarketsPage from "@/app/(public)/markets/page";
import ListYourPropertyPage from "@/app/(public)/list-your-property/page";
import { isPagePreview } from "@/lib/site-pages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Preview",
  robots: { index: false, follow: false },
};

type Params = Promise<{ key: string }>;

const PAGES = {
  home: HomePage,
  "why-mr-home": WhyPage,
  markets: MarketsPage,
  "list-your-property": ListYourPropertyPage,
} as const;

type PreviewKey = keyof typeof PAGES;

export default async function BuiltinPagePreview({ params }: { params: Params }) {
  const { key } = await params;
  if (!(key in PAGES)) notFound();
  // The preview cookie is scoped to this browser and requires content.read.
  if (!(await isPagePreview(key))) redirect(`/admin/login?next=${encodeURIComponent(`/preview/site/${key}`)}`);
  const Page = PAGES[key as PreviewKey];
  return <Page preview />;
}
