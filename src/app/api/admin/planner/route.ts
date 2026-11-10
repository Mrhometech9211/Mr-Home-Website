import { and, asc, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { plannerItems } from "@/db/schema";
import { ApiError, getIp, handle, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { plannerInputSchema } from "@/lib/planner";

export const dynamic = "force-dynamic";
const idSchema = z.coerce.number().int().positive();

export const GET = handle(async (req) => {
  const me = await requireUser("planner.read");
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const filters = [eq(plannerItems.ownerId, me.id)];
  if (from && !Number.isNaN(Date.parse(from))) filters.push(gte(plannerItems.startsAt, new Date(from)));
  if (to && !Number.isNaN(Date.parse(to))) filters.push(lt(plannerItems.startsAt, new Date(to)));
  const data = await db.select().from(plannerItems).where(and(...filters)).orderBy(asc(plannerItems.startsAt)).limit(500);
  return json({ data });
});

export const POST = handle(async (req) => {
  const me = await requireUser("planner.write");
  const limit = rateLimit(`planner:${me.id}`, 60, 60_000);
  if (!limit.ok) throw new ApiError(429, "Too many planner changes. Try again shortly.");
  const body = plannerInputSchema.parse(await readJson(req));
  const [row] = await db.insert(plannerItems).values({
    ownerId: me.id,
    title: body.title,
    kind: body.kind,
    notes: body.notes,
    startsAt: new Date(body.startsAt),
    endsAt: body.endsAt ? new Date(body.endsAt) : null,
    reminderAt: body.reminderAt ? new Date(body.reminderAt) : null,
    alarmEnabled: body.alarmEnabled,
    sound: body.sound,
    done: body.done,
  }).returning();
  await audit({ user: me, action: "planner.created", entity: "planner_items", entityId: row.id, metadata: { kind: row.kind }, ip: getIp(req) });
  return json({ data: row }, { status: 201 });
});

export const PATCH = handle(async (req) => {
  const me = await requireUser("planner.write");
  const limit = rateLimit(`planner:${me.id}`, 60, 60_000);
  if (!limit.ok) throw new ApiError(429, "Too many planner changes. Try again shortly.");
  const payload = z.object({ id: idSchema, item: plannerInputSchema }).parse(await readJson(req));
  const [row] = await db.update(plannerItems).set({
    title: payload.item.title,
    kind: payload.item.kind,
    notes: payload.item.notes,
    startsAt: new Date(payload.item.startsAt),
    endsAt: payload.item.endsAt ? new Date(payload.item.endsAt) : null,
    reminderAt: payload.item.reminderAt ? new Date(payload.item.reminderAt) : null,
    alarmEnabled: payload.item.alarmEnabled,
    sound: payload.item.sound,
    done: payload.item.done,
    updatedAt: new Date(),
  }).where(and(eq(plannerItems.id, payload.id), eq(plannerItems.ownerId, me.id))).returning();
  if (!row) throw new ApiError(404, "Planner item not found");
  await audit({ user: me, action: "planner.updated", entity: "planner_items", entityId: row.id, ip: getIp(req) });
  return json({ data: row });
});

export const DELETE = handle(async (req) => {
  const me = await requireUser("planner.write");
  const limit = rateLimit(`planner:${me.id}`, 60, 60_000);
  if (!limit.ok) throw new ApiError(429, "Too many planner changes. Try again shortly.");
  const { id } = z.object({ id: idSchema }).parse(await readJson(req));
  const [row] = await db.delete(plannerItems).where(and(eq(plannerItems.id, id), eq(plannerItems.ownerId, me.id))).returning({ id: plannerItems.id });
  if (!row) throw new ApiError(404, "Planner item not found");
  await audit({ user: me, action: "planner.deleted", entity: "planner_items", entityId: row.id, ip: getIp(req) });
  return json({ ok: true });
});
