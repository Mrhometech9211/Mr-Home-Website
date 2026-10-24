import type { Permission } from "./permissions";

export type FieldType = "text" | "textarea" | "number" | "boolean" | "select" | "slug" | "image" | "json" | "tags" | "email" | "password" | "color" | "relation" | "datetime";
export type JsonShape = "stats" | "items" | "floorplans" | "documents" | "sections" | "raw";

export type FieldDef = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { label: string; value: string }[];
  relation?: "markets" | "users" | "projects" | "cities" | "roles";
  help?: string;
  width?: "full" | "half" | "third";
  jsonShape?: JsonShape;
  readOnly?: boolean;
  max?: number;
  group?: string;
};

export type ResourceDef = {
  key: string;
  label: string;
  singular: string;
  icon: string;
  read: Permission;
  write: Permission;
  fields: FieldDef[];
  listColumns: string[];
  searchFields: string[];
  defaultSort: { column: string; dir: "asc" | "desc" };
  filters?: { name: string; label: string; options: { label: string; value: string }[] }[];
  publishable?: boolean;
  featurable?: boolean;
  archivable?: boolean;
  orderable?: boolean;
  duplicatable?: boolean;
  previewPath?: (row: Record<string, unknown>) => string;
  readOnly?: boolean;
  detailPath?: (row: Record<string, unknown>) => string;
};

const seoFields: FieldDef[] = [
  { name: "seoTitle", label: "SEO Title", type: "text", group: "SEO", help: "Overrides the page <title>." },
  { name: "seoDescription", label: "SEO Description", type: "textarea", group: "SEO", max: 320 },
];

export const PROJECT_STATUSES = [
  { label: "Available", value: "available" },
  { label: "Under Construction", value: "under-construction" },
  { label: "Ready to Move", value: "ready" },
  { label: "Coming Soon", value: "coming-soon" },
  { label: "Sold Out", value: "sold-out" },
];

export const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "CLOSED_DEAL", "LOST", "ARCHIVED"] as const;

/** Admin unit picker options — stored as plain labels ("Sqft", not "ft²"). */
export const AREA_UNITS = [
  { label: "Sqft", value: "sqft" },
  { label: "Sqmt", value: "sqmt" },
  { label: "Marla", value: "marla" },
  { label: "Kanal", value: "kanal" },
];

export const RESOURCES: Record<string, ResourceDef> = {
  news: {
    key: "news", label: "News", singular: "Article", icon: "news", read: "news.read", write: "news.write",
    publishable: true, featurable: true, archivable: true, duplicatable: true,
    previewPath: (r) => `/news/${r.slug}`,
    listColumns: ["title", "category", "marketId", "publishedAt", "featured", "published", "archived"],
    searchFields: ["title", "excerpt", "slug"],
    defaultSort: { column: "createdAt", dir: "desc" },
    filters: [
      { name: "published", label: "Status", options: [{ label: "Published", value: "true" }, { label: "Draft", value: "false" }] },
      { name: "archived", label: "Archive", options: [{ label: "Active", value: "false" }, { label: "Archived", value: "true" }] },
    ],
    fields: [
      { name: "title", label: "Title", type: "text", required: true, group: "Basics" },
      { name: "slug", label: "Slug", type: "slug", required: true, group: "Basics", width: "half", help: "URL: /news/[slug]" },
      { name: "category", label: "Category", type: "text", width: "half", help: "e.g. Market Report, Guides, Announcements" },
      { name: "marketId", label: "Market / Country", type: "relation", relation: "markets", width: "half" },
      { name: "country", label: "Country (free text)", type: "text", width: "half" },
      { name: "excerpt", label: "Excerpt", type: "textarea", max: 400, group: "Content", help: "Shown on cards and in search results." },
      { name: "body", label: "Body (Markdown)", type: "textarea", required: true, max: 40000, group: "Content", help: "Markdown: #, ##, ###, bold **text**, bullet lists." },
      { name: "coverImage", label: "Cover Image", type: "image", group: "Media" },
      { name: "coverImageAlt", label: "Cover Image Alt Text", type: "text", group: "Media", width: "half" },
      { name: "videoUrl", label: "Video URL", type: "text", group: "Media", width: "half", help: "Embed URL for the article video." },
      { name: "author", label: "Author", type: "text", group: "Basics", width: "half" },
      { name: "authorRole", label: "Author Role", type: "text", group: "Basics", width: "half" },
      { name: "featured", label: "Featured", type: "boolean", group: "Status", width: "third" },
      { name: "published", label: "Published", type: "boolean", group: "Status", width: "third", help: "Unpublished articles are drafts — never visible publicly." },
      { name: "archived", label: "Archived", type: "boolean", group: "Status", width: "third" },
      ...seoFields,
      { name: "seoKeywords", label: "SEO Keywords", type: "text", group: "SEO", help: "Comma-separated keywords for structured data." },
    ],
  },
  projects: {
    key: "projects", label: "Projects", singular: "Project", icon: "building", read: "projects.read", write: "projects.write",
    publishable: true, featurable: true, archivable: true, orderable: true, duplicatable: true,
    previewPath: (r) => `/projects/${r.slug}`,
    listColumns: ["name", "purpose", "marketId", "city", "status", "areaValue", "price", "featured", "published", "updatedAt"],
    searchFields: ["name", "city", "developer", "slug"],
    defaultSort: { column: "order", dir: "asc" },
    filters: [
      { name: "purpose", label: "Listing purpose", options: [{ label: "For Sale (Buy page)", value: "sale" }, { label: "For Rent (Rent page)", value: "rent" }] },
      { name: "status", label: "Status", options: PROJECT_STATUSES },
      { name: "published", label: "Visibility", options: [{ label: "Published", value: "true" }, { label: "Draft", value: "false" }] },
      { name: "archived", label: "Archive", options: [{ label: "Active", value: "false" }, { label: "Archived", value: "true" }] },
    ],
    fields: [
      { name: "name", label: "Project Name", type: "text", required: true, group: "Basics" },
      { name: "slug", label: "Slug", type: "slug", required: true, group: "Basics", help: "URL: /projects/[slug]" },
      { name: "marketId", label: "Market", type: "relation", relation: "markets", group: "Basics", width: "half" },
      { name: "country", label: "Country", type: "text", group: "Basics", width: "half" },
      { name: "city", label: "City", type: "text", group: "Basics", width: "half" },
      { name: "address", label: "Address", type: "text", group: "Basics", width: "half" },
      { name: "latitude", label: "Latitude", type: "number", group: "Basics", width: "half" },
      { name: "longitude", label: "Longitude", type: "number", group: "Basics", width: "half" },
      { name: "developer", label: "Developer", type: "text", group: "Basics" },
      { name: "purpose", label: "Listing purpose", type: "select", required: true, options: [{ label: "For Sale — shows on the Buy page", value: "sale" }, { label: "For Rent — shows on the Rent page", value: "rent" }], group: "Basics", width: "half", help: "Tag the project so it appears in Buy or Rent. Only published projects are listed publicly." },
      { name: "shortDescription", label: "Short Description", type: "textarea", group: "Content", max: 300 },
      { name: "description", label: "Description", type: "textarea", group: "Content", max: 8000 },
      { name: "price", label: "Starting Price", type: "number", group: "Details", width: "half" },
      { name: "currency", label: "Currency", type: "text", group: "Details", width: "half", help: "e.g. AED, USD, GBP" },
      { name: "roi", label: "Est. ROI", type: "text", group: "Details", width: "third" },
      { name: "propertyType", label: "Property Type", type: "text", group: "Details", width: "third" },
      { name: "handover", label: "Handover", type: "text", group: "Details", width: "third" },
      { name: "bedrooms", label: "Bedrooms", type: "text", group: "Details", width: "third" },
      { name: "bathrooms", label: "Bathrooms", type: "text", group: "Details", width: "third" },
      { name: "areaValue", label: "Area", type: "number", group: "Details", width: "third", help: "Numeric value only — pick the unit next to it." },
      { name: "areaUnit", label: "Area unit", type: "select", options: AREA_UNITS, group: "Details", width: "third" },
      { name: "status", label: "Status", type: "select", options: PROJECT_STATUSES, group: "Details", width: "third" },
      { name: "order", label: "Sort Order", type: "number", group: "Details", width: "third" },
      { name: "featured", label: "Featured", type: "boolean", group: "Details", width: "third" },
      { name: "published", label: "Published", type: "boolean", group: "Details", width: "third" },
      { name: "archived", label: "Archived", type: "boolean", group: "Details", width: "third" },
      { name: "coverImage", label: "Cover Image", type: "image", group: "Media" },
      { name: "gallery", label: "Gallery", type: "tags", group: "Media", help: "Image URLs — pick from the Media Library." },
      { name: "video", label: "Video URL", type: "text", group: "Media", help: "YouTube/Vimeo link or MP4 URL" },
      { name: "floorPlans", label: "Floor Plans", type: "json", jsonShape: "floorplans", group: "Media" },
      { name: "amenities", label: "Amenities", type: "tags", group: "Specs" },
      { name: "specifications", label: "Specifications", type: "json", jsonShape: "stats", group: "Specs" },
      { name: "documents", label: "Documents", type: "json", jsonShape: "documents", group: "Specs" },
      ...seoFields,
    ],
  },
  markets: {
    key: "markets", label: "Markets", singular: "Market", icon: "globe", read: "markets.read", write: "markets.write",
    publishable: true, featurable: true, orderable: true, duplicatable: true,
    previewPath: (r) => `/markets/${r.slug}`,
    listColumns: ["flag", "name", "countryCode", "latitude", "longitude", "featured", "published", "order"],
    searchFields: ["name", "slug", "countryCode"],
    defaultSort: { column: "order", dir: "asc" },
    fields: [
      { name: "name", label: "Market Name", type: "text", required: true, group: "Basics", width: "half" },
      { name: "slug", label: "Slug", type: "slug", required: true, group: "Basics", width: "half" },
      { name: "countryCode", label: "Country Code", type: "text", required: true, group: "Basics", width: "third", help: "ISO 2-letter e.g. AE" },
      { name: "flag", label: "Flag Emoji", type: "text", group: "Basics", width: "third" },
      { name: "order", label: "Sort Order", type: "number", group: "Basics", width: "third" },
      { name: "latitude", label: "Latitude (Earth marker)", type: "number", required: true, group: "Basics", width: "half" },
      { name: "longitude", label: "Longitude (Earth marker)", type: "number", required: true, group: "Basics", width: "half" },
      { name: "tagline", label: "Tagline", type: "text", group: "Content" },
      { name: "description", label: "Description", type: "textarea", group: "Content", max: 4000 },
      { name: "investmentOverview", label: "Investment Overview", type: "textarea", group: "Content", max: 4000 },
      { name: "stats", label: "Statistics", type: "json", jsonShape: "stats", group: "Content" },
      { name: "cities", label: "Major Cities", type: "tags", group: "Content" },
      { name: "coverImage", label: "Cover Image", type: "image", group: "Media" },
      { name: "featured", label: "Featured", type: "boolean", group: "Media", width: "half" },
      { name: "published", label: "Published", type: "boolean", group: "Media", width: "half" },
      ...seoFields,
    ],
  },
  cities: {
    key: "cities", label: "Cities", singular: "City", icon: "map-pin", read: "markets.read", write: "markets.write",
    publishable: true, featurable: true, orderable: true, duplicatable: true,
    listColumns: ["name", "marketId", "tagline", "featured", "published", "order"],
    searchFields: ["name", "slug", "tagline"],
    defaultSort: { column: "order", dir: "asc" },
    filters: [{ name: "published", label: "Visibility", options: [{ label: "Published", value: "true" }, { label: "Draft", value: "false" }] }],
    fields: [
      { name: "name", label: "City Name", type: "text", required: true, group: "Basics", width: "half" },
      { name: "slug", label: "Slug", type: "slug", required: true, group: "Basics", width: "half", help: "URL: /markets/[market]/[city]" },
      { name: "marketId", label: "Country / Market", type: "relation", relation: "markets", required: true, group: "Basics", width: "half" },
      { name: "latitude", label: "Latitude (Earth marker)", type: "number", group: "Basics", width: "half" },
      { name: "longitude", label: "Longitude (Earth marker)", type: "number", group: "Basics", width: "half" },
      { name: "tagline", label: "Tagline", type: "text", group: "Content" },
      { name: "description", label: "Description", type: "textarea", group: "Content", max: 4000 },
      { name: "stats", label: "Statistics", type: "json", jsonShape: "stats", group: "Content" },
      { name: "coverImage", label: "Cover Image", type: "image", group: "Media" },
      { name: "featured", label: "Featured", type: "boolean", group: "Media", width: "third" },
      { name: "published", label: "Published", type: "boolean", group: "Media", width: "third" },
      { name: "order", label: "Sort Order", type: "number", group: "Media", width: "third" },
      ...seoFields,
    ],
  },
  sections: {
    key: "sections", label: "Content Sections", singular: "Section", icon: "layout", read: "content.read", write: "content.write",
    orderable: true, duplicatable: true,
    listColumns: ["page", "key", "title", "order", "enabled", "updatedAt"],
    searchFields: ["page", "key", "title"],
    defaultSort: { column: "order", dir: "asc" },
    filters: [{ name: "page", label: "Page", options: [{ label: "Home", value: "home" }, { label: "Why Mr.Home", value: "why-mr-home" }, { label: "Projects", value: "projects" }, { label: "Markets", value: "markets" }, { label: "Contact", value: "contact" }, { label: "List Your Property", value: "list-your-property" }] }],
    fields: [
      { name: "page", label: "Page", type: "select", required: true, options: [{ label: "Home", value: "home" }, { label: "Why Mr.Home", value: "why-mr-home" }, { label: "Projects", value: "projects" }, { label: "Markets", value: "markets" }, { label: "Contact", value: "contact" }, { label: "List Your Property", value: "list-your-property" }], width: "third" },
      { name: "key", label: "Section Key", type: "text", required: true, width: "third", help: "home: hero, stats, why, earth, projects, journey, inquiry" },
      { name: "order", label: "Order", type: "number", width: "third" },
      { name: "enabled", label: "Enabled", type: "boolean", width: "third" },
      { name: "eyebrow", label: "Eyebrow", type: "text", group: "Copy" },
      { name: "title", label: "Title", type: "text", group: "Copy" },
      { name: "subtitle", label: "Subtitle", type: "text", group: "Copy" },
      { name: "body", label: "Body", type: "textarea", group: "Copy", max: 4000 },
      { name: "ctaLabel", label: "Primary CTA Label", type: "text", group: "Actions", width: "half" },
      { name: "ctaHref", label: "Primary CTA Link", type: "text", group: "Actions", width: "half" },
      { name: "secondaryCtaLabel", label: "Secondary CTA Label", type: "text", group: "Actions", width: "half" },
      { name: "secondaryCtaHref", label: "Secondary CTA Link", type: "text", group: "Actions", width: "half" },
      { name: "image", label: "Image", type: "image", group: "Media", help: "For a picture beside the text (left/right or above/below), use Pages → edit the page → Add block → Image + Text." },
      { name: "video", label: "Video URL", type: "text", group: "Media" },
      { name: "background", label: "Background", type: "text", group: "Media", help: "CSS colour/gradient or image URL" },
      { name: "items", label: "Items (cards / stats / steps)", type: "json", jsonShape: "items", group: "Items" },
    ],
  },
  navigation: {
    key: "navigation", label: "Navigation", singular: "Menu Item", icon: "menu", read: "content.read", write: "content.write", orderable: true,
    listColumns: ["location", "label", "href", "order", "visible", "parentId"],
    searchFields: ["label", "href"],
    defaultSort: { column: "order", dir: "asc" },
    filters: [{ name: "location", label: "Location", options: [{ label: "Header", value: "header" }, { label: "Footer", value: "footer" }] }],
    fields: [
      { name: "location", label: "Location", type: "select", required: true, options: [{ label: "Header", value: "header" }, { label: "Footer", value: "footer" }], width: "half" },
      { name: "order", label: "Order", type: "number", width: "half" },
      { name: "label", label: "Label", type: "text", required: true, width: "half" },
      { name: "href", label: "URL", type: "text", required: true, width: "half" },
      { name: "parentId", label: "Parent (for dropdown)", type: "number", width: "half", help: "ID of a top-level header item to nest under." },
      { name: "visible", label: "Visible", type: "boolean", width: "third" },
      { name: "openInNewTab", label: "Open in new tab", type: "boolean", width: "third" },
    ],
  },
  legal: {
    key: "legal", label: "Legal Pages", singular: "Legal Page", icon: "scale", read: "legal.read", write: "legal.write", publishable: true,
    previewPath: (r) => `/${r.slug}`,
    listColumns: ["title", "slug", "published", "updatedAt"],
    searchFields: ["title", "slug"],
    defaultSort: { column: "title", dir: "asc" },
    fields: [
      { name: "title", label: "Title", type: "text", required: true, width: "half" },
      { name: "slug", label: "Slug", type: "slug", required: true, width: "half" },
      { name: "content", label: "Content (Markdown)", type: "textarea", required: true, max: 60000 },
      { name: "published", label: "Published", type: "boolean" },
      ...seoFields,
    ],
  },
  faqs: {
    key: "faqs", label: "FAQs", singular: "FAQ", icon: "help", read: "content.read", write: "content.write", publishable: true, orderable: true,
    listColumns: ["question", "order", "published"], searchFields: ["question", "answer"], defaultSort: { column: "order", dir: "asc" },
    fields: [{ name: "question", label: "Question", type: "text", required: true }, { name: "answer", label: "Answer", type: "textarea", required: true }, { name: "order", label: "Order", type: "number", width: "half" }, { name: "published", label: "Published", type: "boolean", width: "half" }],
  },
  testimonials: {
    key: "testimonials", label: "Testimonials", singular: "Testimonial", icon: "quote", read: "content.read", write: "content.write", publishable: true, orderable: true,
    listColumns: ["name", "role", "order", "published"], searchFields: ["name", "quote"], defaultSort: { column: "order", dir: "asc" },
    fields: [{ name: "name", label: "Name", type: "text", required: true, width: "half" }, { name: "role", label: "Role / Location", type: "text", width: "half" }, { name: "quote", label: "Quote", type: "textarea", required: true }, { name: "image", label: "Photo", type: "image" }, { name: "order", label: "Order", type: "number", width: "half" }, { name: "published", label: "Published", type: "boolean", width: "half" }],
  },
  whatsapp: {
    key: "whatsapp", label: "WhatsApp Templates", singular: "Template", icon: "message", read: "settings.read", write: "settings.write",
    listColumns: ["key", "name", "template"], searchFields: ["key", "name", "template"], defaultSort: { column: "key", dir: "asc" },
    fields: [{ name: "key", label: "Key", type: "text", required: true, width: "half" }, { name: "name", label: "Name", type: "text", required: true, width: "half" }, { name: "template", label: "Message Template", type: "textarea", required: true, help: "Variables: {{project}}, {{market}}" }],
  },
  seo: {
    key: "seo", label: "SEO", singular: "SEO Entry", icon: "search", read: "seo.read", write: "seo.write",
    listColumns: ["path", "title", "noIndex"], searchFields: ["path", "title"], defaultSort: { column: "path", dir: "asc" },
    fields: [{ name: "path", label: "Path", type: "text", required: true, help: "e.g. / or /projects" }, { name: "title", label: "Title", type: "text" }, { name: "description", label: "Description", type: "textarea", max: 320 }, { name: "ogImage", label: "OG Image", type: "image" }, { name: "noIndex", label: "No-index", type: "boolean" }],
  },
  users: {
    key: "users", label: "Users", singular: "User", icon: "users", read: "users.read", write: "users.write",
    listColumns: ["name", "email", "role", "customRoleId", "active", "lastLoginAt", "createdAt"], searchFields: ["name", "email"], defaultSort: { column: "createdAt", dir: "desc" },
    filters: [{ name: "role", label: "Role", options: [{ label: "Super Admin", value: "SUPER_ADMIN" }, { label: "Admin", value: "ADMIN" }, { label: "Editor", value: "EDITOR" }] }],
    fields: [
      { name: "name", label: "Name", type: "text", required: true, width: "half" },
      { name: "email", label: "Email", type: "email", required: true, width: "half" },
      { name: "role", label: "Role", type: "select", required: true, options: [{ label: "Super Admin", value: "SUPER_ADMIN" }, { label: "Admin", value: "ADMIN" }, { label: "Editor", value: "EDITOR" }, { label: "Custom (permission set)", value: "CUSTOM" }], width: "half" },
      { name: "customRoleId", label: "Assigned custom role", type: "relation", relation: "roles", width: "half", group: "Access", help: "Which permission set this user gets when role = Custom. Manage the sets under Roles — assign or lock exactly what they may edit." },
      { name: "customRoleName", label: "Custom role name", type: "text", width: "half", group: "Access", max: 80, help: "Type a role title (e.g. Property Editor). A matching role is created automatically and assigned." },
      { name: "active", label: "Active", type: "boolean", width: "half" },
      { name: "password", label: "Password", type: "password", help: "Required when creating. Leave blank to keep unchanged when editing. Min 10 characters." },
    ],
  },
  newsletter: {
    key: "newsletter", label: "Newsletter", singular: "Subscriber", icon: "mail", read: "leads.read", write: "leads.write",
    listColumns: ["email", "source", "createdAt", "unsubscribedAt"], searchFields: ["email"], defaultSort: { column: "createdAt", dir: "desc" },
    fields: [{ name: "email", label: "Email", type: "email", required: true }, { name: "source", label: "Source", type: "text" }],
  },
  audit: {
    key: "audit", label: "Audit Logs", singular: "Log", icon: "history", read: "audit.read", write: "audit.read", readOnly: true,
    listColumns: ["createdAt", "userEmail", "action", "entity", "entityId", "ip"], searchFields: ["userEmail", "action", "entity", "entityId"], defaultSort: { column: "createdAt", dir: "desc" },
    fields: [],
  },
  leads: {
    key: "leads", label: "Leads", singular: "Lead", icon: "inbox", read: "leads.read", write: "leads.write", archivable: true,
    detailPath: (r) => `/admin/leads/${r.id}`,
    listColumns: ["name", "email", "phone", "score", "marketId", "projectId", "status", "source", "assignedTo", "ip", "createdAt"],
    searchFields: ["name", "email", "phone", "message", "country"],
    defaultSort: { column: "createdAt", dir: "desc" },
    filters: [
      { name: "status", label: "Status", options: LEAD_STATUSES.map((s) => ({ label: s, value: s })) },
      { name: "archived", label: "Archive", options: [{ label: "Active", value: "false" }, { label: "Archived", value: "true" }] },
    ],
    fields: [
      { name: "name", label: "Name", type: "text", required: true, width: "half" },
      { name: "email", label: "Email", type: "email", required: true, width: "half" },
      { name: "phone", label: "Phone", type: "text", width: "half" },
      { name: "whatsapp", label: "WhatsApp", type: "text", width: "half" },
      { name: "country", label: "Country", type: "text", width: "half" },
      { name: "status", label: "Status", type: "select", options: LEAD_STATUSES.map((s) => ({ label: s, value: s })), width: "half" },
      { name: "score", label: "Score", type: "number", readOnly: true, group: "Qualification", width: "half" },
      { name: "marketId", label: "Market", type: "relation", relation: "markets", width: "half" },
      { name: "projectId", label: "Project", type: "relation", relation: "projects", width: "half" },
      { name: "assignedTo", label: "Assigned To", type: "relation", relation: "users", width: "half" },
      { name: "budget", label: "Budget", type: "text", width: "half" },
      { name: "interest", label: "Interest", type: "text", width: "half" },
      { name: "source", label: "Source", type: "text", width: "half" },
      { name: "campaign", label: "Campaign", type: "text", width: "half" },
      { name: "page", label: "Page", type: "text", width: "half" },
      { name: "message", label: "Message", type: "textarea" },
      { name: "archived", label: "Archived", type: "boolean" },
    ],
  },
};

export const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard", icon: "dashboard", permission: null },
  { href: "/admin/leads", label: "Leads / CRM", icon: "inbox", permission: "leads.read" },
  { href: "/admin/leads/pipeline", label: "Pipeline", icon: "kanban", permission: "leads.read" },
  { href: "/admin/projects", label: "Projects", icon: "building", permission: "projects.read" },
  { href: "/admin/brochures", label: "Brochures", icon: "brochure", permission: "brochures.read" },
  { href: "/admin/news", label: "News", icon: "news", permission: "news.read" },
  { href: "/admin/pages", label: "Pages", icon: "layout", permission: "pages.read" },
  { href: "/admin/markets", label: "Markets", icon: "globe", permission: "markets.read" },
  { href: "/admin/cities", label: "Cities", icon: "map-pin", permission: "markets.read" },
  { href: "/admin/sections", label: "Content", icon: "layout", permission: "content.read" },
  { href: "/admin/navigation", label: "Navigation", icon: "menu", permission: "content.read" },
  { href: "/admin/media", label: "Media", icon: "image", permission: "media.read" },
  { href: "/admin/faqs", label: "FAQs", icon: "help", permission: "content.read" },
  { href: "/admin/testimonials", label: "Testimonials", icon: "quote", permission: "content.read" },
  { href: "/admin/newsletter", label: "Newsletter", icon: "mail", permission: "leads.read" },
  { href: "/admin/seo", label: "SEO", icon: "search", permission: "seo.read" },
  { href: "/admin/legal", label: "Legal", icon: "scale", permission: "legal.read" },
  { href: "/admin/whatsapp", label: "WhatsApp", icon: "message", permission: "settings.read" },
  { href: "/admin/settings", label: "Settings", icon: "settings", permission: "settings.read" },
  { href: "/admin/users", label: "Users", icon: "users", permission: "users.read" },
  { href: "/admin/roles", label: "Roles", icon: "shield", permission: "roles.read" },
  { href: "/admin/audit", label: "Audit Logs", icon: "history", permission: "audit.read" },
] as const;
