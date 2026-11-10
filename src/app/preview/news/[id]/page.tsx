import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { newsArticles } from "@/db/schema";
import { getCurrentUser, userCan } from "@/lib/auth";
import { safeSections } from "@/lib/page-builder";
import { PageBuilder } from "@/components/site/PageBuilder";
import { Badge } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/** Draft previews are private: never indexed, never rendered without a session. */
export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Article preview" };

type Params = Promise<{ id: string }>;

export default async function NewsSectionsPreview({ params }: { params: Params }) {
  const user = await getCurrentUser();
  if (!userCan(user, "news.read")) redirect("/admin");
  if (!user) return null;

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [article] = await db.select().from(newsArticles).where(eq(newsArticles.id, id)).limit(1);
  if (!article) notFound();
  const sections = safeSections(article.builderDraft);

  return (
    <div className="min-h-screen bg-ivory">
      <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 bg-white/95 px-4 py-3 shadow-sm backdrop-blur sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={sections.length ? "green" : "slate"}>{sections.length ? `${sections.length} sections` : "not configured"}</Badge>
          <span className="line-clamp-1 max-w-[420px] text-[13.5px] font-semibold text-ink">{article.title}</span>
          <span className="text-[12px] text-charcoal/60">draft preview — not visible to visitors</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/news/${article.slug}`} target="_blank" className="rounded-lg border border-ink/10 px-3 py-1.5 text-[12.5px] font-medium text-ink hover:bg-slate-50">
            Live article ↗
          </Link>
          <Link href={`/admin/news/${article.id}/sections`} className="rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-brand-deep">
            Back to editor
          </Link>
        </div>
      </div>
      {sections.length ? (
        <PageBuilder sections={sections} source={`news-preview:${article.slug}`} />
      ) : (
        <div className="mx-auto max-w-[900px] px-6 py-24 text-center">
          <h1 className="text-[20px] font-semibold text-ink">This article still uses its default layout</h1>
          <p className="mt-2 text-[14px] text-charcoal/70">
            Open the editor and choose “Start from the current content” to add builder sections. The live article stays on the Markdown body until you publish.
          </p>
        </div>
      )}
    </div>
  );
}
