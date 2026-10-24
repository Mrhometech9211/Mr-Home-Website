import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { getCurrentUser, userCan } from "@/lib/auth";
import { PageBuilder } from "@/components/site/PageBuilder";
import { Badge } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/** Draft previews are private: never indexed, never rendered without an authorized session. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Preview",
};

type Params = Promise<{ id: string }>;

export default async function PagePreview({ params }: { params: Params }) {
  const user = await getCurrentUser();
  if (!userCan(user, "pages.read")) redirect("/admin");
  if (!user) return null;

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [page] = await db.select().from(pages).where(eq(pages.id, id)).limit(1);
  if (!page) notFound();

  const isLive = page.status === "published";
  return (
    <div className="min-h-screen bg-ivory">
      <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 bg-white/95 px-4 py-3 shadow-sm backdrop-blur sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={page.status === "published" ? "green" : page.status === "archived" ? "amber" : "slate"}>{page.status}</Badge>
          <span className="text-[13.5px] font-semibold text-ink">{page.title}</span>
          <span className="text-[12px] text-charcoal/60">draft preview — not visible to visitors</span>
        </div>
        <div className="flex items-center gap-2">
          {isLive && (
            <Link href={`/${page.slug}`} target="_blank" className="rounded-lg border border-ink/10 px-3 py-1.5 text-[12.5px] font-medium text-ink hover:bg-slate-50">
              View live page ↗
            </Link>
          )}
          <Link href={`/admin/pages?edit=${page.id}`} className="rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-brand-deep">
            Back to editor
          </Link>
        </div>
      </div>
      <PageBuilder sections={page.draft} source="page-builder-preview" />
    </div>
  );
}
