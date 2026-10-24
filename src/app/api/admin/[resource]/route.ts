import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { customRoles, leadActivities, markets, projects, users } from "@/db/schema";
import { ApiError, getIp, handle, json, parseIntParam, readJson } from "@/lib/api";
import { hashPassword, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { assertPublishFlags, buildSchema, columnsOf, getResource, resolveCustomRoleName, toRow } from "@/lib/resources-server";

type Ctx = { params: Promise<{ resource: string }> };

async function relationLabels(keys: string[]) {
  const out: Record<string, Record<number, string>> = {};
  if (keys.includes("roles")) out.roles = Object.fromEntries((await db.select({ id: customRoles.id, name: customRoles.name }).from(customRoles)).map((m) => [m.id, m.name]));
  if (keys.includes("markets")) out.markets = Object.fromEntries((await db.select({ id: markets.id, name: markets.name }).from(markets)).map((m) => [m.id, m.name]));
  if (keys.includes("projects")) out.projects = Object.fromEntries((await db.select({ id: projects.id, name: projects.name }).from(projects)).map((m) => [m.id, m.name]));
  if (keys.includes("users")) out.users = Object.fromEntries((await db.select({ id: users.id, name: users.name }).from(users)).map((m) => [m.id, m.name]));
  return out;
}

export const GET = handle<Ctx>(async (req, ctx) => {
  const { resource } = await ctx.params;
  const res = getResource(resource);
  if (!res) throw new ApiError(404, "Unknown resource");
  await requireUser(res.def.read);
  const cols = columnsOf(res.table);
  const url = new URL(req.url);
  const page = parseIntParam(url.searchParams.get("page") ?? undefined, 1, 100000);
  const pageSize = parseIntParam(url.searchParams.get("pageSize") ?? undefined, 20, 200);
  const q = url.searchParams.get("q")?.trim();
  const sortCol = url.searchParams.get("sort") && cols[url.searchParams.get("sort")!] ? url.searchParams.get("sort")! : res.def.defaultSort.column;
  const dir = (url.searchParams.get("dir") ?? res.def.defaultSort.dir) === "desc" ? desc : asc;

  const conds: SQL[] = [];
  if (q) {
    const parts = res.def.searchFields.filter((f) => cols[f]).map((f) => ilike(cols[f], `%${q}%`));
    if (parts.length) conds.push(or(...parts)!);
  }
  for (const [k, v] of url.searchParams.entries()) {
    if (["page", "pageSize", "q", "sort", "dir", "all"].includes(k) || !cols[k] || v === "") continue;
    const col = cols[k];
    if (col.dataType === "boolean") conds.push(eq(col, v === "true"));
    else if (col.dataType === "number") conds.push(eq(col, Number(v)));
    else conds.push(eq(col, v));
  }
  const where = conds.length ? and(...conds) : undefined;
  const all = url.searchParams.get("all") === "1";
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(res.table).where(where);
  const base = db.select().from(res.table).where(where).orderBy(dir(cols[sortCol]), asc(cols.id));
  const rows = all ? await base : await base.limit(pageSize).offset((page - 1) * pageSize);
  const relKeys = res.def.fields.filter((f) => f.type === "relation" && f.relation).map((f) => f.relation!) as string[];
  const labels = relKeys.length ? await relationLabels(relKeys) : {};
  const data = (rows as Record<string, unknown>[]).map((r) => {
    const out: Record<string, unknown> = { ...r };
    delete out.passwordHash;
    delete out.data;
    for (const f of res.def.fields) if (f.type === "relation" && f.relation && r[f.name] != null) out[`${f.name}Label`] = labels[f.relation]?.[r[f.name] as number] ?? null;
    return out;
  });
  return json({ data, total: count, page, pageSize });
});

export const POST = handle<Ctx>(async (req, ctx) => {
  const { resource } = await ctx.params;
  const res = getResource(resource);
  if (!res || res.def.readOnly) throw new ApiError(404, "Unknown resource");
  const me = await requireUser(res.def.write);
  const body = await readJson<Record<string, unknown>>(req);
  const data = buildSchema(res.def).parse(body) as Record<string, unknown>;
  assertPublishFlags(resource, me, data);

  if (resource === "users") {
    if (!data.password) throw new ApiError(400, "Password is required for new users");
    if (data.role === "SUPER_ADMIN" && me.role !== "SUPER_ADMIN") throw new ApiError(403, "Only a Super Admin can create Super Admins");
    // Assigning the flexible CUSTOM role requires managing roles; the permission
    // set is attached via customRoleId and enforced at request time.
    if (data.role === "CUSTOM" || data.customRoleId != null || data.customRoleName) {
      const { userCan } = await import("@/lib/auth");
      if (!userCan(me, "roles.write")) throw new ApiError(403, "Only users who manage roles can assign custom roles");
    }
    await resolveCustomRoleName(me, data);
    data.passwordHash = await hashPassword(data.password as string);
    delete data.password;
  }
  if (resource === "leads") data.source = data.source || "manual";
  // News: an article created straight in the published state gets its publish timestamp.
  if (resource === "news" && data.published === true && data.publishedAt === undefined) {
    data.publishedAt = new Date();
  }

  const [row] = await db.insert(res.table).values(toRow(res.table, data) as never).returning();
  const created = row as Record<string, unknown>;
  delete created.passwordHash;
  if (resource === "leads") await db.insert(leadActivities).values({ leadId: created.id as number, userId: me.id, userName: me.name, type: "created", description: "Lead created manually" });
  await audit({ user: me, action: `${res.def.singular.toLowerCase()}.created`, entity: resource, entityId: created.id as number, metadata: { name: created.name ?? created.title ?? created.label ?? created.key }, ip: getIp(req) });
  return json({ data: created }, { status: 201 });
});
