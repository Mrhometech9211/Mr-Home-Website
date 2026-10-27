import type { Role } from "@/db/schema";

export const PERMISSIONS = [
  // identity
  "users.read", "users.write", "roles.read", "roles.write",
  "settings.read", "settings.write",
  // properties marketplace
  "properties.read", "properties.write", "properties.publish",
  // developments
  "projects.read", "projects.write", "projects.publish",
  // markets
  "markets.read", "markets.write", "markets.publish",
  // news
  "news.read", "news.write", "news.publish",
  // page builder
  "pages.read", "pages.write", "pages.publish", "pages.restore",
  // content
  "content.read", "content.write", "content.publish",
  // media + brochures
  "media.read", "media.write",
  "brochures.read", "brochures.write",
  // crm
  "leads.read", "leads.write", "leads.export",
  // sales offers (Phase 10)
  "offers.read", "offers.write", "offers.approve",
  // legal + seo
  "seo.read", "seo.write",
  "legal.read", "legal.write",
  // audit
  "audit.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Human-facing metadata for the custom-role permissions editor. */
export const PERMISSION_GROUPS: { group: string; items: { key: Permission; label: string }[] }[] = [
  {
    group: "Users & Roles",
    items: [
      { key: "users.read", label: "View users" },
      { key: "users.write", label: "Manage users & roles" },
      { key: "roles.read", label: "View custom roles" },
      { key: "roles.write", label: "Create / edit / delete custom roles" },
    ],
  },
  {
    group: "Settings",
    items: [
      { key: "settings.read", label: "View site settings" },
      { key: "settings.write", label: "Edit site settings, footer & templates" },
    ],
  },
  {
    group: "Properties (Buy / Rent)",
    items: [
      { key: "properties.read", label: "View property listings" },
      { key: "properties.write", label: "Create & edit property listings" },
      { key: "properties.publish", label: "Publish / unpublish / feature listings" },
    ],
  },
  {
    group: "Projects & Markets",
    items: [
      { key: "projects.read", label: "View projects" },
      { key: "projects.write", label: "Create & edit projects" },
      { key: "projects.publish", label: "Publish / unpublish projects" },
      { key: "markets.read", label: "View markets & cities" },
      { key: "markets.write", label: "Create & edit markets & cities" },
      { key: "markets.publish", label: "Publish / unpublish markets & cities" },
    ],
  },
  {
    group: "News",
    items: [
      { key: "news.read", label: "View news articles" },
      { key: "news.write", label: "Create & edit news articles" },
      { key: "news.publish", label: "Publish / unpublish / archive news" },
    ],
  },
  {
    group: "Pages (Page Builder)",
    items: [
      { key: "pages.read", label: "View pages & revisions" },
      { key: "pages.write", label: "Create & edit pages (drafts, sections)" },
      { key: "pages.publish", label: "Publish / unpublish pages" },
      { key: "pages.restore", label: "Restore page revisions" },
    ],
  },
  {
    group: "Content",
    items: [
      { key: "content.read", label: "View content sections, nav, FAQs, testimonials" },
      { key: "content.write", label: "Edit content sections, nav, FAQs, testimonials" },
      { key: "content.publish", label: "Enable/disable, publish content" },
    ],
  },
  {
    group: "Media & Brochures",
    items: [
      { key: "media.read", label: "View media library" },
      { key: "media.write", label: "Upload / edit / delete media" },
      { key: "brochures.read", label: "View project brochures" },
      { key: "brochures.write", label: "Upload / replace / remove brochures" },
    ],
  },
  {
    group: "Leads (CRM)",
    items: [
      { key: "leads.read", label: "View leads & activity" },
      { key: "leads.write", label: "Edit leads, notes, tasks, status" },
      { key: "leads.export", label: "Export leads (CSV)" },
    ],
  },
  {
    group: "Sales Offers",
    items: [
      { key: "offers.read", label: "View sales offers & generated PDFs" },
      { key: "offers.write", label: "Create / edit offers, import units, generate PDFs" },
      { key: "offers.approve", label: "Approve offers for client sharing" },
    ],
  },
  {
    group: "SEO & Legal",
    items: [
      { key: "seo.read", label: "View SEO entries" },
      { key: "seo.write", label: "Edit SEO entries" },
      { key: "legal.read", label: "View legal pages" },
      { key: "legal.write", label: "Edit legal pages" },
    ],
  },
  {
    group: "Audit",
    items: [{ key: "audit.read", label: "View audit history" }],
  },
];

const ALL: Permission[] = [...PERMISSIONS];

function mk(...keys: Permission[]) {
  return keys;
}

/** Built-in roles never change; installed custom roles are additive rows in `custom_roles`. */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: ALL,
  ADMIN: ALL.filter((p) => p !== "users.write" && p !== "roles.write"),
  EDITOR: [
    "projects.read", "projects.write",
    "markets.read", "markets.write",
    "properties.read", "properties.write",
    "news.read", "news.write",
    "pages.read", "pages.write",
    "content.read", "content.write",
    "media.read", "media.write",
    "brochures.read", "brochures.write",
    "leads.read", "leads.write",
    "offers.read", "offers.write",
    "seo.read", "seo.write",
    "legal.read",
    "settings.read",
    "roles.read",
    "audit.read",
  ],
  CUSTOM: [],
};

export const BUILTIN_ROLES: Role[] = ["SUPER_ADMIN", "ADMIN", "EDITOR"];

/** Effective permission check for a *built-in* role (custom roles go through the DB). */
export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role as Exclude<Role, "CUSTOM">]?.includes(permission) ?? false;
}

/**
 * Full effective-permission resolution, custom roles included.
 * `customPermissions` comes from the user's linked custom_roles row (loaded
 * server-side, e.g. in getCurrentUser).
 */
export function effectiveHas(
  role: Role,
  permission: Permission,
  customPermissions?: string[] | null,
): boolean {
  if (role === "CUSTOM") return (customPermissions ?? []).includes(permission);
  return hasPermission(role, permission);
}

/** Permissions an actor was granted for a custom role, validated at write time. */
export function validateCustomPermissions(perms: unknown): Permission[] {
  const list = Array.isArray(perms) ? perms : [];
  const out: Permission[] = [];
  for (const p of list) if (typeof p === "string" && (ALL as string[]).includes(p) && !out.includes(p as Permission)) out.push(p as Permission);
  return out;
}

/** Kept for compatibility with the old ROLES export name. */
export const ROLES: Role[] = BUILTIN_ROLES;
