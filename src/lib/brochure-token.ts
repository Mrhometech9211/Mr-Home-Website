import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/db";
import { brochures, projects } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

/**
 * Signed brochure download tokens with project-scoped existence checks.
 * Brochure downloads require a valid lead-gate submission. The lead-gate POST
 * returns a URL carrying a lead id plus an HMAC signature that binds that
 * signature to the specific brochure id. The download route recomputes the
 * signature and verifies the requested brochure still exists and belongs to
 * an active published project before releasing the file.
 */
const SECRET = process.env.MRH_BROCHURE_SECRET ?? process.env.AUTH_SECRET ?? "mrh-brochure-hmac-v1-local";

function rawSign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export function signBrochureDownload(leadId: number, brochureId: number): string {
  return rawSign(`${leadId}:${brochureId}`);
}

export function verifyBrochureDownload(leadId: number, brochureId: number, sig: string): boolean {
  try {
    const expected = rawSign(`${leadId}:${brochureId}`);
    const actual = sig || "";
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
  } catch {
    return false;
  }
}

export async function brochureExistsForProject(brochureId: number, projectSlug: string): Promise<{ ok: boolean; brochureId?: number; projectId?: number }> {
  const [project] = await db
    .select({ id: projects.id, slug: projects.slug, published: projects.published, archived: projects.archived })
    .from(projects)
    .where(eq(projects.slug, projectSlug))
    .limit(1);

  if (!project || !project.published || project.archived) {
    return { ok: false };
  }

  const [brochure] = await db
    .select({ id: brochures.id, projectId: brochures.projectId })
    .from(brochures)
    .where(eq(brochures.id, brochureId))
    .orderBy(desc(brochures.createdAt))
    .limit(1);

  if (!brochure || brochure.projectId !== project.id) {
    return { ok: false };
  }

  return { ok: true, brochureId: brochure.id, projectId: project.id };
}
