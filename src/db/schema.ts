import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  doublePrecision,
  numeric,
  index,
  customType,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
});

export type Role = "SUPER_ADMIN" | "ADMIN" | "EDITOR" | "CUSTOM";
export type LeadStatus = "NEW" | "CONTACTED" | "QUALIFIED" | "CONVERTED" | "LOST" | "ARCHIVED";
export type PropertyPurpose = "sale" | "rent";
export type NewsStatus = "draft" | "published" | "archived";

/**
 * Custom roles (Phase 6). `permissions` is an array of permission strings
 * (subset of src/lib/permissions.ts PERMISSIONS). System roles stay hardcoded;
 * installed/custom rows are additive and never replace SUPER_ADMIN/ADMIN/EDITOR.
 */
export const customRoles = pgTable("custom_roles", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  builtin: boolean("builtin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<Role>().notNull().default("EDITOR"),
  customRoleId: integer("custom_role_id").references(() => customRoles.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastRotatedAt: timestamp("last_rotated_at", { withTimezone: true }).notNull().defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id"),
    userEmail: text("user_email"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt), index("audit_entity_idx").on(t.entity)],
);

export const siteSettings = pgTable("site_settings", {
  id: integer("id").primaryKey(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const navigationItems = pgTable("navigation_items", {
  id: serial("id").primaryKey(),
  location: text("location").notNull().default("header"), // header | footer
  label: text("label").notNull(),
  href: text("href").notNull(),
  order: integer("order").notNull().default(0),
  visible: boolean("visible").notNull().default(true),
  parentId: integer("parent_id"),
  openInNewTab: boolean("open_in_new_tab").notNull().default(false),
});

export type SectionItem = { title?: string; description?: string; icon?: string; value?: string; label?: string; image?: string };

export const pageSections = pgTable(
  "page_sections",
  {
    id: serial("id").primaryKey(),
    page: text("page").notNull().default("home"),
    key: text("key").notNull(),
    eyebrow: text("eyebrow"),
    title: text("title"),
    subtitle: text("subtitle"),
    body: text("body"),
    ctaLabel: text("cta_label"),
    ctaHref: text("cta_href"),
    secondaryCtaLabel: text("secondary_cta_label"),
    secondaryCtaHref: text("secondary_cta_href"),
    image: text("image"),
    video: text("video"),
    background: text("background"),
    items: jsonb("items").$type<SectionItem[]>().default([]),
    order: integer("order").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sections_page_idx").on(t.page)],
);

export const markets = pgTable(
  "markets",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    countryCode: text("country_code").notNull(),
    flag: text("flag").notNull().default(""),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    tagline: text("tagline"),
    description: text("description"),
    investmentOverview: text("investment_overview"),
    stats: jsonb("stats").$type<{ label: string; value: string }[]>().default([]),
    cities: jsonb("cities").$type<string[]>().default([]),
    coverImage: text("cover_image"),
    featured: boolean("featured").notNull().default(false),
    published: boolean("published").notNull().default(true),
    order: integer("order").notNull().default(0),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("markets_published_idx").on(t.published)],
);

export const cities = pgTable(
  "cities",
  {
    id: serial("id").primaryKey(),
    marketId: integer("market_id").references(() => markets.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    tagline: text("tagline"),
    description: text("description"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    stats: jsonb("stats").$type<{ label: string; value: string }[]>().default([]),
    coverImage: text("cover_image"),
    featured: boolean("featured").notNull().default(false),
    published: boolean("published").notNull().default(true),
    order: integer("order").notNull().default(0),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("cities_market_idx").on(t.marketId), index("cities_published_idx").on(t.published)],
);

export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    marketId: integer("market_id").references(() => markets.id, { onDelete: "set null" }),
    country: text("country"),
    city: text("city"),
    address: text("address"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    developer: text("developer"),
    shortDescription: text("short_description"),
    description: text("description"),
    price: numeric("price"),
    currency: text("currency").default("USD"),
    /** sale = shown on /buy, rent = shown on /rent (admin "Listing purpose" tag). */
    purpose: text("purpose").$type<PropertyPurpose>().notNull().default("sale"),
    roi: text("roi"),
    propertyType: text("property_type"),
    bedrooms: text("bedrooms"),
    bathrooms: text("bathrooms"),
    /** Legacy free-text area kept for rows created before the unit picker. */
    area: text("area"),
    /** Area entered in the admin unit picker (value + sqft | sqmt | marla | kanal). */
    areaValue: numeric("area_value"),
    areaUnit: text("area_unit"),
    handover: text("handover"),
    status: text("status").notNull().default("available"),
    featured: boolean("featured").notNull().default(false),
    published: boolean("published").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    order: integer("order").notNull().default(0),
    coverImage: text("cover_image"),
    gallery: jsonb("gallery").$type<string[]>().default([]),
    video: text("video"),
    floorPlans: jsonb("floor_plans").$type<{ name: string; image?: string; area?: string }[]>().default([]),
    amenities: jsonb("amenities").$type<string[]>().default([]),
    specifications: jsonb("specifications").$type<{ label: string; value: string }[]>().default([]),
    documents: jsonb("documents").$type<{ name: string; url: string }[]>().default([]),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("projects_market_idx").on(t.marketId),
    index("projects_published_idx").on(t.published),
    index("projects_featured_idx").on(t.featured),
    index("projects_purpose_idx").on(t.purpose),
  ],
);

export const media = pgTable(
  "media",
  {
    id: serial("id").primaryKey(),
    filename: text("filename").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    kind: text("kind").notNull().default("image"), // image | video | document | logo
    size: integer("size").notNull(),
    width: integer("width"),
    height: integer("height"),
    alt: text("alt"),
    caption: text("caption"),
    data: bytea("data"),
    /** Where the binary lives: "db" (legacy bytea) or "r2" (object store). */
    storage: text("storage").notNull().default("db"),
    /** R2 object key when storage = "r2"; media delivery resolves through it. */
    storageKey: text("storage_key"),
    /** pending = presigned upload started; ready = key verified in R2. */
    status: text("status").notNull().default("ready"),
    uploadedBy: integer("uploaded_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("media_kind_idx").on(t.kind), index("media_status_idx").on(t.status)],
);

export const leads = pgTable(
  "leads",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    // Nullable since Phase 4: brochure-download leads supply phone instead.
    email: text("email"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    country: text("country"),
    marketId: integer("market_id").references(() => markets.id, { onDelete: "set null" }),
    projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
    city: text("city"),
    budget: text("budget"),
    interest: text("interest"),
    message: text("message"),
    source: text("source").default("website"),
    /** Structured submission extras (e.g. Property Listing Lead details). */
    details: jsonb("details").$type<Record<string, unknown>>(),
    page: text("page"),
    campaign: text("campaign"),
    status: text("status").$type<LeadStatus>().notNull().default("NEW"),
    score: integer("score").notNull().default(0),
    assignedTo: integer("assigned_to").references(() => users.id, { onDelete: "set null" }),
    archived: boolean("archived").notNull().default(false),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("leads_status_idx").on(t.status),
    index("leads_created_idx").on(t.createdAt),
    index("leads_email_idx").on(t.email),
    index("leads_market_idx").on(t.marketId),
  ],
);

export const leadNotes = pgTable("lead_notes", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  userId: integer("user_id"),
  userName: text("user_name"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leadTasks = pgTable("lead_tasks", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  done: boolean("done").notNull().default(false),
  assignedTo: integer("assigned_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leadActivities = pgTable(
  "lead_activities",
  {
    id: serial("id").primaryKey(),
    leadId: integer("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    userId: integer("user_id"),
    userName: text("user_name"),
    type: text("type").notNull(), // created | status | assigned | note | task | email | whatsapp | archived | restored
    description: text("description").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lead_activities_lead_idx").on(t.leadId)],
);

export const legalPages = pgTable("legal_pages", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  published: boolean("published").notNull().default(true),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** ------------------------------------------------------------------
 *  Phase 2 — Buy / Rent marketplace listings.
 *  Separate from `projects` (developments) on purpose: a project is a
 *  whole development; a property is an individual unit/knockdown/spare.
 *  ------------------------------------------------------------------ */
export const properties = pgTable(
  "properties",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    purpose: text("purpose").$type<PropertyPurpose>().notNull().default("sale"), // sale | rent
    marketId: integer("market_id").references(() => markets.id, { onDelete: "set null" }),
    country: text("country"),
    city: text("city"),
    address: text("address"),
    propertyType: text("property_type"), // Apartment | Villa | Townhouse | ... (free text, filters built from distinct values)
    price: numeric("price"),
    currency: text("currency").notNull().default("USD"),
    rentPeriod: text("rent_period"), // month | year (rent only)
    bedrooms: integer("bedrooms"),
    bathrooms: integer("bathrooms"),
    areaSqm: numeric("area_sqm"),
    furnished: text("furnished"), // unfurnished | semi | furnished
    completion: text("completion"), // ready | offplan (Ready/Off-Plan filter)
    availability: text("availability"), // free text e.g. "Available now","Jan 2027"
    shortDescription: text("short_description"),
    description: text("description"),
    amenities: jsonb("amenities").$type<string[]>().default([]),
    featured: boolean("featured").notNull().default(false),
    published: boolean("published").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    order: integer("order").notNull().default(0),
    coverImage: text("cover_image"),
    gallery: jsonb("gallery").$type<string[]>().default([]),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("properties_purpose_idx").on(t.purpose),
    index("properties_published_idx").on(t.published),
    index("properties_market_idx").on(t.marketId),
  ],
);

/** Phase 5 — News CMS. */
export const newsArticles = pgTable(
  "news_articles",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    body: text("body").notNull().default(""),
    category: text("category"),
    marketId: integer("market_id").references(() => markets.id, { onDelete: "set null" }),
    country: text("country"),
    author: text("author"),
    authorRole: text("author_role"),
    coverImage: text("cover_image"),
    coverImageAlt: text("cover_image_alt"),
    videoUrl: text("video_url"),
    featured: boolean("featured").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    published: boolean("published").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    seoKeywords: text("seo_keywords"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("news_published_idx").on(t.published), index("news_market_idx").on(t.marketId)],
);

/** Phase 7 — Page builder pages (draft + published snapshots kept separate). */
export const pages = pgTable("pages", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  navLabel: text("nav_label"),
  navOrder: integer("nav_order").notNull().default(0),
  navVisible: boolean("nav_visible").notNull().default(true),
  parentId: integer("parent_id").references((): AnyPgColumn => pages.id, { onDelete: "set null" }),
  status: text("status").$type<"draft" | "published" | "archived">().notNull().default("draft"),
  draft: jsonb("draft").$type<unknown[]>().notNull().default([]),
  published: jsonb("published").$type<unknown[]>().notNull().default([]),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  noIndex: boolean("no_index").notNull().default(false),
  ogImage: text("og_image"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pageRevisions = pgTable(
  "page_revisions",
  {
    id: serial("id").primaryKey(),
    pageId: integer("page_id").notNull().references(() => pages.id, { onDelete: "cascade" }),
    userId: integer("user_id"),
    userName: text("user_name"),
    headline: text("headline").notNull(),
    data: jsonb("data").$type<unknown[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("page_revisions_page_idx").on(t.pageId)],
);

/** Phase 4 — Project brochures (PDF stored in DB like media). */
export const brochures = pgTable(
  "brochures",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull().default("application/pdf"),
    size: integer("size").notNull(),
    data: bytea("data"),
    /** "db" (legacy bytea) or "r2" (object-store binary via storage_key). */
    storage: text("storage").notNull().default("db"),
    storageKey: text("storage_key"),
    /** pending = presigned upload started; ready = object verified in R2. */
    status: text("status").notNull().default("ready"),
    allowDownload: boolean("allow_download").notNull().default(true),
    downloads: integer("downloads").notNull().default(0),
    uploadedBy: integer("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("brochures_project_idx").on(t.projectId), index("brochures_status_idx").on(t.status)],
);

export const faqs = pgTable("faqs", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  order: integer("order").notNull().default(0),
  published: boolean("published").notNull().default(true),
});

export const testimonials = pgTable("testimonials", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role"),
  quote: text("quote").notNull(),
  image: text("image"),
  order: integer("order").notNull().default(0),
  published: boolean("published").notNull().default(true),
});

export const newsletterSubscribers = pgTable("newsletter_subscribers", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
});

export const whatsappTemplates = pgTable("whatsapp_templates", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  template: text("template").notNull(),
});

export const seoEntries = pgTable("seo_entries", {
  id: serial("id").primaryKey(),
  path: text("path").notNull().unique(),
  title: text("title"),
  description: text("description"),
  ogImage: text("og_image"),
  noIndex: boolean("no_index").notNull().default(false),
});

export type User = typeof users.$inferSelect;
export type Market = typeof markets.$inferSelect;
export type City = typeof cities.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type PageSection = typeof pageSections.$inferSelect;
export type NavigationItem = typeof navigationItems.$inferSelect;
export type MediaItem = typeof media.$inferSelect;
export type LegalPage = typeof legalPages.$inferSelect;
export type Property = typeof properties.$inferSelect;
export type NewsArticle = typeof newsArticles.$inferSelect;
export type BuilderPage = typeof pages.$inferSelect;
export type CustomRole = typeof customRoles.$inferSelect;
export type Brochure = typeof brochures.$inferSelect;
