import { z } from "zod";
import { getIp, handle, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { createBlock, listBlocks } from "@/lib/builder-blocks";

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the block a name").max(120),
  category: z.string().trim().max(60).nullish(),
  description: z.string().trim().max(400).nullish(),
  section: z.unknown(),
});

export const GET = handle(async () => {
  await requireUser("content.read");
  return json({ data: await listBlocks() });
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser("content.write");
  const parsed = createSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return json({ error: `Invalid ${first?.path?.join(".") ?? "request"}: ${first?.message ?? "validation failed"}` }, { status: 400 });
  }
  const block = await createBlock(parsed.data, user.id);
  await audit({
    user,
    action: "content.created",
    entity: "builder_blocks",
    entityId: block.id,
    metadata: { name: block.name, category: block.category },
    ip: getIp(req),
  });
  return json({ data: block }, { status: 201 });
});
