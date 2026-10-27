import { z } from "zod";
import { ApiError, getIp, handle, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { blockUsage, deleteBlock, getBlock, updateBlock } from "@/lib/builder-blocks";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().max(60).nullish(),
  description: z.string().trim().max(400).nullish(),
  section: z.unknown().optional(),
});

function idFrom(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Invalid block id");
  return id;
}

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser("content.read");
  const { id } = await params;
  const block = await getBlock(idFrom(id));
  if (!block) throw new ApiError(404, "Reusable block not found.");
  return json({ data: { ...block, usage: await blockUsage(block.id) } });
});

export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("content.write");
  const { id } = await params;
  const blockId = idFrom(id);
  const parsed = patchSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return json({ error: `Invalid ${first?.path?.join(".") ?? "request"}: ${first?.message ?? "validation failed"}` }, { status: 400 });
  }
  const block = await updateBlock(blockId, parsed.data);
  await audit({ user, action: "content.updated", entity: "builder_blocks", entityId: blockId, metadata: { name: block.name }, ip: getIp(req) });
  return json({ data: { ...block, usage: await blockUsage(blockId) } });
});

export const DELETE = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("content.write");
  const { id } = await params;
  const blockId = idFrom(id);
  await deleteBlock(blockId);
  await audit({ user, action: "content.deleted", entity: "builder_blocks", entityId: blockId, ip: getIp(req) });
  return json({ ok: true });
});
