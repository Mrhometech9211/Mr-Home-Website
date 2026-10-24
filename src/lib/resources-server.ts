import "server-only";
import { z, type ZodTypeAny } from "zod";
import { getTableColumns, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { auditLogs, cities, customRoles, faqs, leads, legalPages, markets, navigationItems, newsArticles, newsletterSubscribers, pageSections, projects, seoEntries, testimonials, users, whatsappTemplates } from "@/db/schema";
import { RESOURCES, type FieldDef, type ResourceDef } from "./resources";
import { slugify } from "./utils";import { effectiveHas, type Permission } from "./permissions";import { ApiError } from "./api";

export const RESOURCE_TABLES: Record<string, PgTable> = {
  projects,
  markets,
  cities,
  sections: pageSections,
  navigation: navigationItems,
  legal: legalPages,
  news: newsArticles,
  faqs,
  testimonials,
  whatsapp: whatsappTemplates,
  seo: seoEntries,
  users,
  newsletter: newsletterSubscribers,
  audit: auditLogs,
  leads,
};

export function getResource(key: string): { def: ResourceDef; table: PgTable } | null {
  const def = RESOURCES[key];
  const table = RESOURCE_TABLES[key];
  if (!def || !table) return null;
  return { def, table };
}

export function columnsOf(table: PgTable) {
  return getTableColumns(table) as Record<string, import("drizzle-orm").Column>;
}

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

function fieldSchema(f: FieldDef): ZodTypeAny {
  const max = f.max ?? (f.type === "textarea" ? 20000 : 500);
  switch (f.type) {
    case "text":
    case "textarea":
    case "image":
    case "color":
      return f.required ? z.string().trim().min(1, `${f.label} is required`).max(max) : z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());
    case "slug":
      return z.string().trim().min(1, `${f.label} is required`).max(120).transform((s) => slugify(s));
    case "email":
      return z.string().trim().toLowerCase().email("Invalid email").max(254);
    case "password":
      return z.preprocess(emptyToNull, z.string().min(10, "Password must be at least 10 characters").max(200).nullable().optional());
    case "number":
      return z.preprocess(emptyToNull, z.coerce.number().nullable().optional()).transform((v) => (v == null ? null : v));
    case "relation":
      return z.preprocess(emptyToNull, z.coerce.number().int().nullable().optional()).transform((v) => (v == null ? null : v));
    case "boolean":
      return z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean().optional());
    case "select": {
      // Restrict to the field's declared options (e.g. lead/project statuses) —
      // free-form selects previously persisted arbitrary strings, dropping
      // Kanban cards into phantom columns.
      const allowed = (f.options ?? [])
        .map((o) => (o != null && typeof o === "object" ? String((o as { value: string }).value) : String(o)))
        .filter((v) => v.length);
      const pick = allowed.length ? z.enum(allowed as [string, ...string[]]) : z.string().max(max);
      return f.required
        ? pick
        : z.preprocess(emptyToNull, pick.nullable().optional());
    }
    case "tags":
      return z.preprocess((v) => (typeof v === "string" ? v.split("\n").map((s) => s.trim()).filter(Boolean) : v ?? []), z.array(z.string().max(1000)).max(200));
    case "json":
      return z.preprocess((v) => { if (typeof v === "string") { try { return JSON.parse(v); } catch { return v; } } return v ?? []; }, z.array(z.record(z.string(), z.any())).max(200));
    case "datetime":
      return z.preprocess(emptyToNull, z.coerce.date().nullable().optional());
    default:
      return z.any();
  }
}

export function buildSchema(def: ResourceDef, partial = false) {  const shape: Record<string, ZodTypeAny> = {};
  for (const f of def.fields) {
    if (f.readOnly) continue;
    shape[f.name] = partial ? fieldSchema(f).optional() : fieldSchema(f);
  }
  return z.object(shape).strip();
}

/** Coerce validated values into column-compatible values (e.g. numeric columns expect strings). */
export function toRow(table: PgTable, data: Record<string, unknown>) {
  const cols = columnsOf(table);
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    const col = cols[k];
    if (!col) continue;
    // Omit null values for NOT NULL columns that have a database default
    // (e.g. "order") so PostgreSQL applies the default instead of erroring.
    if (v == null && col.notNull && col.hasDefault) continue;
    if (col.dataType === "string" && typeof v === "number") row[k] = String(v);
    else if (col.dataType === "number" && typeof v === "string") row[k] = v === "" ? null : Number(v);
    else row[k] = v;
  }
  if (cols.updatedAt) row.updatedAt = new Date();
  return row;
}

/**
 * Users: turn a free-text "custom role name" into a real custom_roles row.
 * Admins write e.g. "Property Editor" on the user; we find-or-create the role
 * (empty permission set — grants are managed under Admin → Roles) and link it.
 */
export async function resolveCustomRoleName(
  me: { id: number; name: string; role: string; email?: string | null; effectivePermissions?: string[] | null },
  data: Record<string, unknown>,
): Promise<void> {
  const rawName = typeof data.customRoleName === "string" ? data.customRoleName.trim() : "";
  delete data.customRoleName;
  if (!rawName) return;
  const { effectiveHas } = await import("./permissions");
  if (!effectiveHas(me.role as never, "roles.write", me.effectivePermissions ?? null)) {
    throw new ApiError(403, "Only users who manage roles can assign a custom role name");
  }
  // An explicit role selection wins over a free-text name.
  if (data.customRoleId == null) {
    const name = rawName.slice(0, 80);
    const key = slugify(name) || `role-${Date.now()}`;
    const existing = await db.select({ id: customRoles.id }).from(customRoles).where(sql`lower(${customRoles.name}) = ${name.toLowerCase()}`).limit(1);
    let roleId: number;
    if (existing[0]) roleId = existing[0].id;
    else {
      const [created] = await db.insert(customRoles).values({ key, name, description: "Created from the Users form", permissions: [] }).returning({ id: customRoles.id });
      roleId = created.id;
    }
    data.customRoleId = roleId;
    if (!data.role || data.role === "EDITOR") data.role = "CUSTOM";
  }
}

/**
 * Publish-flag permission map for resources with publish/feature toggles.
 * Values are the permission a user needs server-side to flip published/featured/archived.
 */
export const PUBLISHABLE_RESOURCES: Record<string, Permission> = {
  projects: "projects.publish",
  markets: "markets.publish",
  news: "news.publish",
  cities: "content.publish",
  legal: "content.publish",
  faqs: "content.publish",
  testimonials: "content.publish",
};

const PUBLISH_FLAG_KEYS = ["published", "featured", "archived"] as const;

/**
 * Server-side enforcement: block writes that touch publish/feature/archive flags
 * unless the user holds the resource's publish permission.
 */
export function assertPublishFlags(
  resource: string,
  me: { role: string; effectivePermissions?: string[] | null },
  data: Record<string, unknown> | undefined | null,
): void {
  if (!data) return;
  const touched = PUBLISH_FLAG_KEYS.filter((f) => data[f] !== undefined);
  if (!touched.length) return; // doesn't touch publish flags — normal write permission applies
  const perm = PUBLISHABLE_RESOURCES[resource];
  if (!perm) return; // non-publishable resource: flag columns fall back to its write permission
  if (!effectiveHas(me.role as never, perm, me.effectivePermissions ?? null)) {
    throw new ApiError(403, `You do not have permission to publish this content (requires ${perm})`);
  }
}
