import { z } from "zod";
import { slugify } from "./utils";

/** Phase 7 — Custom Page Builder: section model, validation and reserved-slug rules. */

export const SECTION_TYPES = [
  { value: "hero", label: "Hero" },
  { value: "text", label: "Rich Text" },
  { value: "imageText", label: "Image + Text" },
  { value: "video", label: "Video" },
  { value: "cta", label: "Call to Action" },
  { value: "cards", label: "Cards" },
  { value: "stats", label: "Statistics" },
  { value: "steps", label: "Steps" },
  { value: "faq", label: "FAQ" },
  { value: "testimonials", label: "Testimonials" },
  { value: "form", label: "Inquiry Form" },
] as const;

export type SectionType = (typeof SECTION_TYPES)[number]["value"];

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

export type BuilderItem = {
  title?: string;
  description?: string;
  value?: string;
  label?: string;
  image?: string;
  icon?: string;
};

export type BuilderSection = {
  id: string;
  type: SectionType;
  hidden?: boolean;
  eyebrow?: string | null;
  title?: string | null;
  subtitle?: string | null;
  body?: string | null;
  image?: string | null;
  /** Image placement inside the section — beside/above/below the copy. */
  imageLayout?: ImageLayout | null;
  videoUrl?: string | null;
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

/** Suggest a slug from a page title. */
export function slugFromTitle(title: string): string {
  const s = slugify(title);
  return s.slice(0, 140);
}

const itemSchema = z.object({
  title: z.string().max(300).optional(),
  description: z.string().max(2000).optional(),
  value: z.string().max(120).optional(),
  label: z.string().max(200).optional(),
  image: z.string().max(2000).optional(),
  icon: z.string().max(60).optional(),
});

const sectionSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(SECTION_TYPES.map((t) => t.value) as [SectionType, ...SectionType[]]),
  hidden: z.boolean().optional(),
  eyebrow: z.string().max(160).nullish(),
  title: z.string().max(300).nullish(),
  subtitle: z.string().max(300).nullish(),
  body: z.string().max(20000).nullish(),
  image: z.string().max(2000).nullish(),
  imageLayout: z.enum(["left", "right", "above", "below"]).nullish(),
  videoUrl: z.string().max(500).nullish(),
  ctaLabel: z.string().max(100).nullish(),
  ctaHref: z.string().max(500).nullish(),
  cta2Label: z.string().max(100).nullish(),
  cta2Href: z.string().max(500).nullish(),
  items: z.array(itemSchema).max(40).optional(),
});

export const sectionsSchema = z.array(sectionSchema).max(50);

/** Lightweight publish-time sanity: a page needs at least one visible section with a headline. */
export function validateForPublish(sections: BuilderSection[]): void {
  const visible = sections.filter((s) => !s.hidden);
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
