import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { ApiError, getIp, handle, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { safeSections, sectionsSchema, validateForPublish, type BuilderSection } from "@/lib/page-builder";
import { projectSeedSections } from "@/lib/project-template";

const patchSchema = z.object({ draft: z.array(z.unknown()).max(80) });
const actionSchema = z.object({ action: z.enum(["publish", "seed", "reset"]) });

function idFrom(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Invalid project id");
  return id;
}

async function loadProject(id: number) {
  const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!row) throw new ApiError(404, "Project not found.");
  return row;
}

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser("projects.read");
  const { id } = await params;
  const project = await loadProject(idFrom(id));
  return json({
    data: {
      project: { id: project.id, name: project.name, slug: project.slug, published: project.published, archived: project.archived },
      draft: safeSections(project.builderDraft),
      published: safeSections(project.builderPublished),
    },
  });
});

export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("projects.write");
  const { id } = await params;
  const projectId = idFrom(id);
  await loadProject(projectId);

  const parsed = patchSchema.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "Invalid draft payload." }, { status: 400 });

  const checked = sectionsSchema.safeParse(parsed.data.draft);
  if (!checked.success) {
    const first = checked.error.issues[0];
    return json({ error: `Invalid section ${first?.path?.join(".") ?? ""}: ${first?.message ?? "unknown shape"}` }, { status: 400 });
  }

  await db.update(projects).set({ builderDraft: parsed.data.draft }).where(eq(projects.id, projectId));
  await audit({ user, action: "project.builder_draft_saved", entity: "projects", entityId: projectId, metadata: { sections: parsed.data.draft.length }, ip: getIp(req) });
  return json({ ok: true });
});

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const projectId = idFrom(id);
  const parsed = actionSchema.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "Unknown action." }, { status: 400 });

  if (parsed.data.action === "seed") {
    const user = await requireUser("projects.write");
    const project = await loadProject(projectId);
    const sections: BuilderSection[] = projectSeedSections(project);
    await db.update(projects).set({ builderDraft: sections }).where(eq(projects.id, projectId));
    await audit({ user, action: "project.builder_seeded", entity: "projects", entityId: projectId, metadata: { sections: sections.length }, ip: getIp(req) });
    return json({ data: { draft: sections } });
  }

  if (parsed.data.action === "reset") {
    const user = await requireUser("projects.publish");
    await loadProject(projectId);
    await db.update(projects).set({ builderDraft: [], builderPublished: [] }).where(eq(projects.id, projectId));
    await audit({ user, action: "project.builder_reset", entity: "projects", entityId: projectId, ip: getIp(req) });
    return json({ ok: true });
  }

  const user = await requireUser("projects.publish");
  const project = await loadProject(projectId);
  const draft = safeSections(project.builderDraft);
  if (!draft.length) throw new ApiError(400, "Add at least one section before publishing.");
  try {
    validateForPublish(draft);
  } catch (e) {
    throw new ApiError(400, e instanceof Error ? e.message : "This page is not ready to publish.");
  }
  await db.update(projects).set({ builderPublished: project.builderDraft }).where(eq(projects.id, projectId));
  await audit({ user, action: "project.builder_published", entity: "projects", entityId: projectId, metadata: { sections: draft.length }, ip: getIp(req) });
  return json({ ok: true });
});
