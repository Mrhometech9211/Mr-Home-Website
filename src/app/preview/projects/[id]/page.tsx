import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { getCurrentUser, userCan } from "@/lib/auth";
import { getActiveBrochureForProject } from "@/lib/content";
import { safeSections } from "@/lib/page-builder";
import { PageBuilder } from "@/components/site/PageBuilder";
import { Badge } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/** Draft previews are private: never indexed, never rendered without a session. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Project preview",
};

type Params = Promise<{ id: string }>;

export default async function ProjectSectionsPreview({ params }: { params: Params }) {
  const user = await getCurrentUser();
  if (!userCan(user, "projects.read")) redirect("/admin");
  if (!user) return null;

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) notFound();
  const brochure = await getActiveBrochureForProject(project.id);
  const sections = safeSections(project.builderDraft);

  return (
    <div className="min-h-screen bg-ivory">
      <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 bg-white/95 px-4 py-3 shadow-sm backdrop-blur sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={sections.length ? "green" : "slate"}>{sections.length ? `${sections.length} sections` : "not configured"}</Badge>
          <span className="text-[13.5px] font-semibold text-ink">{project.name}</span>
          <span className="text-[12px] text-charcoal/60">draft preview — not visible to visitors</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/projects/${project.slug}`} target="_blank" className="rounded-lg border border-ink/10 px-3 py-1.5 text-[12.5px] font-medium text-ink hover:bg-slate-50">
            Live project ↗
          </Link>
          <Link href={`/admin/projects/${project.id}/sections`} className="rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-brand-deep">
            Back to editor
          </Link>
        </div>
      </div>
      {sections.length ? (
        <PageBuilder
          sections={sections}
          source={`project-preview:${project.slug}`}
          project={{ slug: project.slug, name: project.name, hasBrochure: Boolean(brochure?.allowDownload) }}
        />
      ) : (
        <div className="mx-auto max-w-[900px] px-6 py-24 text-center">
          <h1 className="text-[20px] font-semibold text-ink">This project still uses its default layout</h1>
          <p className="mt-2 text-[14px] text-charcoal/70">
            Open the editor and choose “Start from the current layout” to add builder sections. The live page stays on the default layout until you publish.
          </p>
        </div>
      )}
    </div>
  );
}
