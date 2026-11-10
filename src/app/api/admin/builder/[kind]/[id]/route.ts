import { z } from "zod";
import { ApiError, getIp, handle, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sectionsSchema } from "@/lib/page-builder";
import {
  isContentBuilderKind,
  loadContentBuilder,
  parseTargetId,
  publishContentDraft,
  resetContentBuilder,
  saveContentDraft,
  seedContentDraft,
  targetMeta,
} from "@/lib/builder-content";

/**
 * Builder API for editorial content: /api/admin/builder/market/12 and
 * /api/admin/builder/news/4. Pages and projects keep their own routes; this one
 * shares the exact same section schema and draft/publish contract.
 */

const patchSchema = z.object({ draft: z.array(z.unknown()).max(80) });
const actionSchema = z.object({ action: z.enum(["publish", "seed", "reset"]) });

type Params = { params: Promise<{ kind: string; id: string }> };

async function resolve(params: Params["params"]) {
  const { kind, id } = await params;
  if (!isContentBuilderKind(kind)) throw new ApiError(404, "Unknown builder target.");
  return { kind, id: parseTargetId(id), meta: targetMeta(kind) };
}

export const GET = handle(async (_req: Request, { params }: Params) => {
  const { kind, id, meta } = await resolve(params);
  await requireUser(meta.read);
  const record = await loadContentBuilder(kind, id);
  return json({ data: record });
});

export const PATCH = handle(async (req: Request, { params }: Params) => {
  const { kind, id, meta } = await resolve(params);
  const user = await requireUser(meta.write);
  await loadContentBuilder(kind, id);

  const parsed = patchSchema.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "Invalid draft payload." }, { status: 400 });

  const checked = sectionsSchema.safeParse(parsed.data.draft);
  if (!checked.success) {
    const first = checked.error.issues[0];
    return json({ error: `Invalid section ${first?.path?.join(".") ?? ""}: ${first?.message ?? "unknown shape"}` }, { status: 400 });
  }

  await saveContentDraft(kind, id, checked.data);
  await audit({
    user,
    action: `content.builder_draft_saved`,
    entity: kind === "market" ? "markets" : "news",
    entityId: id,
    metadata: { sections: checked.data.length },
    ip: getIp(req),
  });
  return json({ ok: true });
});

export const POST = handle(async (req: Request, { params }: Params) => {
  const { kind, id, meta } = await resolve(params);
  const parsed = actionSchema.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "Unknown action." }, { status: 400 });

  if (parsed.data.action === "seed") {
    const user = await requireUser(meta.write);
    await loadContentBuilder(kind, id);
    const draft = await seedContentDraft(kind, id);
    await audit({ user, action: `content.builder_seeded`, entity: kind === "market" ? "markets" : "news", entityId: id, metadata: { sections: draft.length }, ip: getIp(req) });
    return json({ data: { draft } });
  }

  if (parsed.data.action === "reset") {
    const user = await requireUser(meta.publish);
    await loadContentBuilder(kind, id);
    await resetContentBuilder(kind, id);
    await audit({ user, action: `content.builder_reset`, entity: kind === "market" ? "markets" : "news", entityId: id, ip: getIp(req) });
    return json({ ok: true });
  }

  const user = await requireUser(meta.publish);
  const published = await publishContentDraft(kind, id);
  await audit({ user, action: `content.builder_published`, entity: kind === "market" ? "markets" : "news", entityId: id, metadata: { sections: published.length }, ip: getIp(req) });
  return json({ ok: true });
});
