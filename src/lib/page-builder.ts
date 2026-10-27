import { z } from "zod";
import { slugify } from "./utils";

/**
 * Visual page builder — section model, validation and reserved-slug rules.
 *
 * The model is deliberately a flat list of sections (Page → Sections), and a
 * section lays its `items` out as columns (Rows → Columns → Elements). That is
 * the shape the public renderer consumes, so the editor, the draft preview and
 * the live site always read the same data.
 *
 * Every field added after the original Phase 7 model is optional, so sections
 * already stored in `pages.draft` / `pages.published` keep parsing unchanged.
 */

export const SECTION_TYPES = [
  // Headers
  { value: "hero", label: "Hero", group: "Headers", hint: "Large headline with optional background photo and buttons" },
  { value: "banner", label: "Image banner", group: "Headers", hint: "Photo banner with a dark scrim and centered call to action" },
  // Basics
  { value: "heading", label: "Heading", group: "Basics", hint: "Standalone section title and eyebrow" },
  { value: "text", label: "Rich text", group: "Basics", hint: "Long-form copy, optional image beside, above or below" },
  { value: "imageText", label: "Image + text", group: "Basics", hint: "Photo paired with copy in two columns" },
  { value: "columns", label: "Row / columns", group: "Basics", hint: "Two to four columns, each with its own image, copy and link" },
  { value: "divider", label: "Divider", group: "Basics", hint: "A rule or empty spacer between sections" },
  // Media
  { value: "video", label: "Video embed", group: "Media", hint: "YouTube or Vimeo player with a caption" },
  { value: "gallery", label: "Gallery", group: "Media", hint: "Responsive image grid with captions" },
  // Content
  { value: "cards", label: "Cards", group: "Content", hint: "Image or text cards in a grid" },
  { value: "highlights", label: "Highlights", group: "Content", hint: "Compact feature cards with an icon or number" },
  { value: "amenities", label: "Amenities", group: "Content", hint: "Icon grid of facilities and services" },
  { value: "specs", label: "Specifications", group: "Content", hint: "Label and value rows, e.g. unit type, area, view" },
  { value: "stats", label: "Statistics", group: "Content", hint: "Big numbers with captions" },
  { value: "steps", label: "Steps", group: "Content", hint: "Numbered process or timeline" },
  { value: "faq", label: "FAQ", group: "Content", hint: "Collapsible question and answer list" },
  { value: "testimonials", label: "Testimonials", group: "Content", hint: "Quotes with author and role" },
  // Project modules
  { value: "floorPlans", label: "Floor plans", group: "Project", hint: "Plan images with unit labels and areas" },
  { value: "pricing", label: "Payment plans", group: "Project", hint: "Plan cards with price, deposit and terms" },
  { value: "brochure", label: "Brochure download", group: "Project", hint: "Panel prompting visitors to download the brochure" },
  { value: "location", label: "Location & map", group: "Project", hint: "Map embed plus nearby landmarks" },
  { value: "related", label: "Related projects", group: "Project", hint: "Cards for other published projects" },
  // Conversion
  { value: "cta", label: "Call to action", group: "Conversion", hint: "Dark panel with headline and buttons" },
  { value: "form", label: "Inquiry form", group: "Conversion", hint: "The site's lead form with all current fields" },
  { value: "contact", label: "Contact details", group: "Conversion", hint: "Phone, email and address rows" },
  { value: "whatsapp", label: "WhatsApp banner", group: "Conversion", hint: "Direct WhatsApp chat call to action" },
] as const;

export type SectionType = (typeof SECTION_TYPES)[number]["value"];

/** Library groupings used by the admin "Add section" picker. */
export const SECTION_GROUPS = ["Headers", "Basics", "Media", "Content", "Project", "Conversion"] as const;

export function sectionLabel(type: SectionType): string {
  return SECTION_TYPES.find((t) => t.value === type)?.label ?? type;
}

/**
 * Where a section's image sits relative to its copy. Missing = the section
 * default (imageText alternates sides; plain text renders no image).
 */
export const IMAGE_LAYOUTS = [
  { value: "right", label: "Beside — image on the right" },
  { value: "left", label: "Beside — image on the left" },
  { value: "above", label: "Above the text" },
  { value: "below", label: "Below the text" },
] as const;
export type ImageLayout = (typeof IMAGE_LAYOUTS)[number]["value"];

export const CONTAINER_WIDTHS = [
  { value: "narrow", label: "Narrow", px: 900 },
  { value: "default", label: "Default", px: 1400 },
  { value: "wide", label: "Wide", px: 1600 },
  { value: "full", label: "Full width", px: 0 },
] as const;
export type ContainerWidth = (typeof CONTAINER_WIDTHS)[number]["value"];

export const SECTION_SPACING = [
  { value: "none", label: "None", px: 0 },
  { value: "sm", label: "Small", px: 32 },
  { value: "md", label: "Medium", px: 64 },
  { value: "lg", label: "Large", px: 96 },
  { value: "xl", label: "Extra large", px: 128 },
] as const;
export type SectionSpacing = (typeof SECTION_SPACING)[number]["value"];

export const SECTION_ALIGN = ["left", "center", "right"] as const;
export type SectionAlign = (typeof SECTION_ALIGN)[number];

export type SectionVisibility = { desktop?: boolean; tablet?: boolean; mobile?: boolean };

export type SectionStyle = {
  /** Background colour behind the section (hex/rgb/hsl). */
  background?: string | null;
  /** Background photo; rendered with `object-cover`. */
  backgroundImage?: string | null;
  /** 0–90 dark scrim strength over the background photo. */
  overlay?: number | null;
  /** Text colour applied to headings and body inside the section. */
  textColor?: string | null;
  align?: SectionAlign | null;
  width?: ContainerWidth | null;
  padY?: SectionSpacing | null;
  /** Grid columns for item-based sections. */
  columns?: 1 | 2 | 3 | 4 | null;
  radius?: "none" | "md" | "xl" | null;
  /** Minimum rendered height in px (0–2000). */
  minHeight?: number | null;
};

export type BuilderItem = {
  title?: string;
  description?: string;
  value?: string;
  label?: string;
  image?: string;
  icon?: string;
  href?: string;
};

export type BuilderBlockMode = "linked" | "independent";

export type BuilderSection = {
  id: string;
  type: SectionType;
  /** Layer name shown in the editor outline. Falls back to the type label. */
  label?: string | null;
  hidden?: boolean;
  /** Optional `id` attribute so in-page links can target the section. */
  anchorId?: string | null;
  /** Per-device visibility. Missing device = visible. */
  visible?: SectionVisibility | null;
  style?: SectionStyle | null;
  /** Reusable block this section is linked to (linked mode only). */
  blockId?: number | null;
  blockMode?: BuilderBlockMode | null;
  eyebrow?: string | null;
  title?: string | null;
  subtitle?: string | null;
  body?: string | null;
  image?: string | null;
  /** Image placement inside the section — beside/above/below the copy. */
  imageLayout?: ImageLayout | null;
  videoUrl?: string | null;
  /** Address/place searched in the map embed for the location section. */
  mapQuery?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  cta2Label?: string | null;
  cta2Href?: string | null;
  items?: BuilderItem[];
};

/** Client-safe row shape for the admin pages list/editor (dates serialized to ISO strings). */
export type BuilderPage = {
  id: number;
  title: string;
  slug: string;
  navLabel: string | null;
  navOrder: number;
  navVisible: boolean;
  status: "draft" | "published" | "archived";
  draft: BuilderSection[];
  published: BuilderSection[];
  publishedAt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  noIndex: boolean;
  ogImage: string | null;
  createdAt: string;
  updatedAt: string;
};

/** A saved reusable block (Phase 11). */
export type BuilderBlock = {
  id: number;
  name: string;
  category: string | null;
  description: string | null;
  section: BuilderSection;
  createdAt: string;
  updatedAt: string;
  /** Number of pages/projects that currently reference this block. */
  usageCount?: number;
};

/** Suggest a slug from a page title. */
export function slugFromTitle(title: string): string {
  const s = slugify(title);
  return s.slice(0, 140);
}

/* ------------------------------------------------------------------ *
 * Safe value validation
 * ------------------------------------------------------------------ */

const SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|(?:rgb|hsl)a?\(\s*[\d.%\s,/]+\))$/;

/** Media URLs: site-relative paths or absolute https. */
export function isSafeMediaUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.startsWith("/") && !v.startsWith("//")) return true;
  if (/^https:\/\//i.test(v)) return true;
  return false;
}

/** Links additionally allow mailto:, tel: and hash anchors. */
export function isSafeLink(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.startsWith("#")) return true;
  if (/^(mailto:|tel:)/i.test(v)) return true;
  return isSafeMediaUrl(v);
}

const colorField = z
  .string()
  .trim()
  .max(60)
  .refine((v) => v === "" || SAFE_COLOR.test(v), "Use a hex, rgb() or hsl() colour")
  .nullish()
  .transform((v) => (v && v.length ? v : null));

const mediaField = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => v === "" || isSafeMediaUrl(v), "Use a site path or an https:// URL")
  .nullish()
  .transform((v) => (v && v.length ? v : null));

const linkField = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => v === "" || isSafeLink(v), "Use a site path, https://, mailto:, tel: or #anchor")
  .nullish()
  .transform((v) => (v && v.length ? v : null));

const itemSchema = z.object({
  title: z.string().max(300).optional(),
  description: z.string().max(2000).optional(),
  value: z.string().max(160).optional(),
  label: z.string().max(200).optional(),
  image: z
    .string()
    .max(2000)
    .refine((v) => v === "" || isSafeMediaUrl(v), "Use a site path or an https:// URL")
    .optional(),
  icon: z.string().max(60).optional(),
  href: z
    .string()
    .max(1000)
    .refine((v) => v === "" || isSafeLink(v), "Use a site path, https://, mailto:, tel: or #anchor")
    .optional(),
});

const visibilitySchema = z
  .object({
    desktop: z.boolean().optional(),
    tablet: z.boolean().optional(),
    mobile: z.boolean().optional(),
  })
  .nullish();

const styleSchema = z
  .object({
    background: colorField,
    backgroundImage: mediaField,
    overlay: z.number().int().min(0).max(90).nullish(),
    textColor: colorField,
    align: z.enum(SECTION_ALIGN).nullish(),
    width: z.enum(["narrow", "default", "wide", "full"]).nullish(),
    padY: z.enum(["none", "sm", "md", "lg", "xl"]).nullish(),
    columns: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullish(),
    radius: z.enum(["none", "md", "xl"]).nullish(),
    minHeight: z.number().int().min(0).max(2000).nullish(),
  })
  .nullish();

const sectionSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(SECTION_TYPES.map((t) => t.value) as [SectionType, ...SectionType[]]),
  label: z.string().max(80).nullish(),
  hidden: z.boolean().optional(),
  anchorId: z
    .string()
    .max(60)
    .refine((v) => v === "" || /^[A-Za-z][A-Za-z0-9_-]*$/.test(v), "Anchors start with a letter and use letters, numbers, - or _")
    .nullish()
    .transform((v) => (v && v.length ? v : null)),
  visible: visibilitySchema,
  style: styleSchema,
  blockId: z.number().int().positive().nullish(),
  blockMode: z.enum(["linked", "independent"]).nullish(),
  eyebrow: z.string().max(160).nullish(),
  title: z.string().max(300).nullish(),
  subtitle: z.string().max(300).nullish(),
  body: z.string().max(20000).nullish(),
  image: mediaField,
  imageLayout: z.enum(["left", "right", "above", "below"]).nullish(),
  videoUrl: z.string().max(500).nullish(),
  mapQuery: z.string().max(200).nullish(),
  ctaLabel: z.string().max(100).nullish(),
  // Buttons render as `href` in the public page, so they must go through the
  // same allow-list as item links (site path, https, mailto, tel, #anchor).
  ctaHref: linkField,
  cta2Label: z.string().max(100).nullish(),
  cta2Href: linkField,
  items: z.array(itemSchema).max(60).optional(),
});

export const sectionsSchema = z.array(sectionSchema).max(80);

/** Validate an arbitrary payload and return typed sections (throws on invalid). */
export function parseSectionsStrict(raw: unknown): BuilderSection[] {
  return sectionsSchema.parse(raw) as BuilderSection[];
}

/** Non-throwing variant used by the renderer: malformed input yields []. */
export function safeSections(raw: unknown): BuilderSection[] {
  const parsed = sectionsSchema.safeParse(raw);
  return parsed.success ? (parsed.data as BuilderSection[]) : [];
}

/**
 * Grid column count for an item-based section: explicit style wins, otherwise
 * a per-type sensible default.
 */
export function sectionColumns(section: BuilderSection): number {
  if (section.style?.columns) return section.style.columns;
  switch (section.type) {
    case "stats":
      return 4;
    case "amenities":
    case "highlights":
      return 3;
    case "gallery":
    case "floorPlans":
    case "pricing":
    case "related":
    case "columns":
      return 3;
    case "specs":
      return 1;
    default:
      return 3;
  }
}

/** True when at least one device shows the section. */
export function sectionIsVisible(section: BuilderSection): boolean {
  if (section.hidden) return false;
  const v = section.visible;
  if (!v) return true;
  return v.desktop !== false || v.tablet !== false || v.mobile !== false;
}

/**
 * Tailwind classes implementing the per-device visibility matrix. Breakpoints:
 * mobile < 768px, tablet 768–1023px, desktop ≥ 1024px.
 */
export function visibilityClass(section: BuilderSection): string {
  const v = section.visible ?? {};
  const mobile = v.mobile !== false;
  const tablet = v.tablet !== false;
  const desktop = v.desktop !== false;
  if (mobile && tablet && desktop) return "";
  if (!mobile && tablet && desktop) return "hidden md:block";
  if (mobile && !tablet && desktop) return "md:hidden lg:block";
  if (mobile && tablet && !desktop) return "lg:hidden";
  if (!mobile && !tablet && desktop) return "hidden lg:block";
  if (mobile && !tablet && !desktop) return "md:hidden";
  if (!mobile && tablet && !desktop) return "hidden md:block lg:hidden";
  return "hidden"; // hidden on every device
}

/** Lightweight publish-time sanity: a page needs at least one visible section with a headline. */
export function validateForPublish(sections: BuilderSection[]): void {
  const visible = sections.filter((s) => sectionIsVisible(s));
  if (!visible.length) throw new Error("Add at least one visible section before publishing");
  const hasHeadline = visible.some((s) => s.type !== "form" && (s.title || s.eyebrow));
  if (!hasHeadline) throw new Error("At least one visible section needs a title or eyebrow");
}

/**
 * Static routes that a custom page slug must never shadow. Kept literal on
 * purpose so new reserved routes are an explicit decision, not an accident.
 */
export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "preview",
  "buy",
  "rent",
  "projects",
  "properties",
  "markets",
  "news",
  "contact",
  "why-mr-home",
  "list-your-property",
  "privacy-policy",
  "terms",
  "cookie-policy",
  "robots.txt",
  "sitemap.xml",
  "manifest.webmanifest",
  "_next",
  "images",
  "favicon.ico",
]);

export function isReservedSlug(slug: string): boolean {
  const s = slug.toLowerCase();
  if (RESERVED_SLUGS.has(s)) return true;
  // First path segment guards reserved namespaces like `admin/anything`.
  const first = s.split("/")[0];
  return RESERVED_SLUGS.has(first);
}

export const pageMetaSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(140),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .max(140)
    .transform((s) => slugify(s))
    .refine((s) => s.length > 0, "Slug is required"),
  navLabel: z.string().trim().max(60).nullish().transform((v) => (v && v.length ? v : null)),
  navOrder: z.coerce.number().int().min(0).max(99).nullish(),
  navVisible: z.boolean().nullish(),
  parentId: z.coerce.number().int().positive().nullish().transform((v) => (v ?? null)),
  seoTitle: z.string().trim().max(170).nullish().transform((v) => (v && v.length ? v : null)),
  seoDescription: z.string().trim().max(320).nullish().transform((v) => (v && v.length ? v : null)),
  noIndex: z.boolean().nullish(),
  ogImage: z.string().max(2000).nullish().transform((v) => (v && v.length ? v : null)),
});

export type PageMeta = z.infer<typeof pageMetaSchema>;

/**
 * Payload for creating a custom page. `slug` may be blank — the "New page" form
 * leaves it empty and the API derives it from the title. Non-empty slugs are
 * still checked here so unsafe shapes fail before reaching the database.
 */
export const pageCreateSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(140),
  slug: z
    .string()
    .trim()
    .max(140)
    .refine((v) => v === "" || /^[a-zA-Z0-9][a-zA-Z0-9 -/]*$/.test(v), "Invalid slug")
    .optional(),
  navLabel: z.string().trim().max(60).nullish(),
  navOrder: z.coerce.number().int().min(0).max(99).nullish(),
  navVisible: z.boolean().nullish(),
  seoTitle: z.string().trim().max(170).nullish(),
  seoDescription: z.string().trim().max(320).nullish(),
  noIndex: z.boolean().nullish(),
  ogImage: z.string().trim().max(2000).nullish(),
});

/** Convert a watch/share video URL into an embeddable one when possible. */
export function toEmbedUrl(raw: string): string | null {
  const url = (raw || "").trim();
  if (!url) return null;
  if (!/^https:\/\//i.test(url)) return null; // only https embeds
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube-nocookie.com/embed/${id}`;
      if (u.pathname.startsWith("/embed/")) return `https://www.youtube-nocookie.com${u.pathname}`;
      if (u.pathname.startsWith("/shorts/")) return `https://www.youtube-nocookie.com/embed/${u.pathname.split("/")[2]}`;
      return null;
    }
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
    }
    return null; // unknown host — rejected rather than arbitrary iframe embeds
  } catch {
    return null;
  }
}

/**
 * Google Maps embed for a free-text place. Uses the keyless `output=embed`
 * endpoint so no API key is required; the query is URL-encoded and the host is
 * fixed, so nothing user-supplied can change the embed origin.
 */
export function mapEmbedUrl(query: string): string | null {
  const q = (query || "").trim().slice(0, 200);
  if (!q) return null;
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed`;
}
