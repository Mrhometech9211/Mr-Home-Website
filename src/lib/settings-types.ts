export type SocialLink = { platform: string; url: string; icon?: string };
/** Admin → Settings → Notifications: desktop lead notifications. */
export type LeadNotifications = {
  leadsEnabled: boolean;
  pollSeconds: number;
  volume: number;
  sound: "chime" | "ding" | "custom";
  soundUrl: string;
  titleTemplate: string;
  /** Role names allowed to receive notifications; empty = users with leads.read. */
  notifyRoles: string[];
};
/**
 * Admin → Settings → Automation: no-code rules that run on every new lead.
 * Everything here is safe to leave off — the inbox behaves exactly as before.
 */
export type Automations = {
  /** Assign a lead owner automatically (least-loaded built-in team member). */
  autoAssign: boolean;
  /** Create a first-follow-up task on the new lead. */
  autoFollowUp: boolean;
  followUpHours: number;
  /** Auto-score new leads so the inbox is sorted by intent. */
  autoScore: boolean;
  /** Archive untouched NEW / CONTACTED leads after N days. */
  staleArchive: boolean;
  staleArchiveDays: number;
};
export type OfficeLocation = { name: string; address: string; phone?: string; mapUrl?: string; hours?: string };
export type FooterLink = { label: string; href: string };
export type LypItem = { title?: string; body?: string };
/** All fields the List Your Property form can show — admin-toggled per field. */
export const LYP_FIELDS = ["name", "email", "phone", "preferredLanguage", "propertyAddress", "propertyType", "purpose", "bedrooms", "market", "message"] as const;
/** List Your Property page content — editable from Admin → Settings → List Your Property. */
export type ListYourPropertyContent = {
  eyebrow: string;
  title: string;
  heroBody: string;
  heroImage?: string;
  formTitle: string;
  formIntro: string;
  formCtaLabel?: string;
  formCtaHref?: string;
  benefits: LypItem[];
  steps: LypItem[];
  /** Which form fields appear on the public List Your Property form. */
  contactFields: string[];
};
const LYP_ALL_FIELDS = [...LYP_FIELDS];

export interface SiteSettings {
  brandName: string;
  tagline: string;
  logo: string;
  logoDark: string;
  favicon: string;
  primaryColor: string;
  accentColor: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  workingHours: string;
  mapUrl: string;
  offices: OfficeLocation[];
  socialLinks: SocialLink[];
  footerDescription: string;
  copyrightText: string;
  footerLinks: FooterLink[];
  seoDefaultTitle: string;
  seoDefaultDescription: string;
  seoOgImage: string;
  siteUrl: string;
  gaId: string;
  metaPixelId: string;
  whatsappDefaultMessage: string;
  whatsappProjectMessage: string;
  whatsappMarketMessage: string;
  newsletterEnabled: boolean;
  newsletterTitle: string;
  newsletterDescription: string;
  introVideoUrl: string;
  introVideoPoster: string;
  introVideoEnabled: boolean;
  announcement: string;
  announcementEnabled: boolean;
  cookieConsentEnabled: boolean;
  whatsappFloatEnabled: boolean;
  cookieConsentText: string;
  disclaimer: string;
  contactFields: string[];
  budgetOptions: string[];
  interestOptions: string[];
  cityFieldEnabled: boolean;
  customBudgetEnabled: boolean;
  notifications: LeadNotifications;
  automations: Automations;
  /** Email contact card on the List Your Property page (below the phone card). */
  showEmailCard: boolean;
  listYourProperty: ListYourPropertyContent;
}

export const DEFAULT_SETTINGS: SiteSettings = {
  // NOTE: DB seeds persist the values below at seed time; existing databases are
  // migrated forward by MRH-2026-09 settings patch (see src/lib/settings-types.ts mergeSettings).
  brandName: "MR.HOME",
  tagline: "Invest Wise. Live Better.",
  logo: "/brand/logo.svg",
  logoDark: "/brand/logo-dark.svg",
  favicon: "/brand/favicon.svg",
  primaryColor: "#1f8f3a",
  accentColor: "#3ec24a",
  phone: "+92 300 1363636",
  whatsapp: "+923001363636",
  email: "info@mrhome.ae",
  address: "Office 3402, Business Bay, Dubai, UAE",
  workingHours: "Mon – Sat: 9AM – 6PM",
  mapUrl: "https://maps.google.com/?q=Business+Bay+Dubai",
  offices: [
    { name: "Dubai HQ", address: "Office 3402, Business Bay, Dubai, UAE", phone: "+971 50 123 4567", hours: "Mon – Sat: 9AM – 6PM", mapUrl: "https://maps.google.com/?q=Business+Bay+Dubai" },
    { name: "Islamabad", address: "Blue Area, Islamabad, Pakistan", phone: "+92 51 000 0000", hours: "Mon – Sat: 10AM – 7PM", mapUrl: "https://maps.google.com/?q=Blue+Area+Islamabad" },
  ],
  socialLinks: [
    { platform: "facebook", url: "https://facebook.com/mrhome" },
    { platform: "instagram", url: "https://instagram.com/mrhome" },
    { platform: "linkedin", url: "https://linkedin.com/company/mrhome" },
    { platform: "youtube", url: "https://youtube.com/@mrhome" },
  ],
  footerDescription: "Your global real estate partner for a better tomorrow.",
  copyrightText: "MR.HOME. All Rights Reserved.",
  footerLinks: [
    { label: "Privacy Policy", href: "/privacy-policy" },
    { label: "Terms & Conditions", href: "/terms" },
    { label: "Cookie Policy", href: "/cookie-policy" },
  ],
  seoDefaultTitle: "MR.HOME — Invest Wise. Live Better.",
  seoDefaultDescription: "Curated luxury properties across 10 global markets. Your trusted partner in international real estate investment.",
  seoOgImage: "/images/hero-villa.jpg",
  siteUrl: "",
  gaId: "",
  metaPixelId: "",
  whatsappDefaultMessage: "Hello MR.HOME, I would like to learn more about your property opportunities.",
  whatsappProjectMessage: "Hello MR.HOME, I'm interested in {{project}} in {{market}}. Please share more details.",
  whatsappMarketMessage: "Hello MR.HOME, I'm interested in investment opportunities in {{market}}.",
  newsletterEnabled: true,
  newsletterTitle: "Newsletter",
  newsletterDescription: "Stay updated with our latest projects and insights.",
  introVideoUrl: "https://res.cloudinary.com/j6kdg6uv/video/upload/ac_none/v1788578370/upscaled-video.mp4",
  introVideoPoster: "https://res.cloudinary.com/j6kdg6uv/video/upload/so_0/v1788578370/upscaled-video.jpg",
  introVideoEnabled: true,
  announcement: "",
  announcementEnabled: false,
  cookieConsentEnabled: true,
  whatsappFloatEnabled: true,
  cookieConsentText: "We use cookies to enhance your experience and analyse traffic. You can accept or decline analytics cookies.",
  disclaimer: "All prices, ROI figures and handover dates are indicative and subject to change by the developer. MR.HOME acts as a marketing partner and does not guarantee investment returns.",
  contactFields: ["name", "email", "phone", "country", "market", "project", "budget", "interest", "message"],
  budgetOptions: ["Under $250K", "$250K – $500K", "$500K – $1M", "$1M – $3M", "$3M+"],
  interestOptions: ["Apartment", "Villa", "Penthouse", "Townhouse", "Commercial", "Land / Plot"],
  cityFieldEnabled: true,
  customBudgetEnabled: true,
  notifications: {
    leadsEnabled: true,
    pollSeconds: 20,
    volume: 70,
    sound: "chime",
    soundUrl: "",
    titleTemplate: "New lead — {{source}}",
    notifyRoles: [],
  },
  automations: {
    autoAssign: false,
    autoFollowUp: false,
    followUpHours: 24,
    autoScore: true,
    staleArchive: false,
    staleArchiveDays: 45,
  },
  listYourProperty: {
    eyebrow: "For Owners",
    title: "List Your Property with Mr.Home",
    heroBody: "Sell or rent faster with a dedicated advisor, a free market valuation and access to our global buyer network.",
    formTitle: "Tell us about your property",
    formIntro: "Submit the details and a listings advisor will contact you within one business day with a free valuation and a proposed plan — no obligation.",
    heroImage: "",
    formCtaLabel: "",
    formCtaHref: "",
    benefits: [
      { title: "Reach genuine buyers and tenants", body: "Your property is presented to our global buyer base and marketed across our channels — not listed and forgotten." },
      { title: "Right price, backed by data", body: "Every listing starts with a free market assessment so your asking price reflects real transaction evidence." },
      { title: "One end-to-end partner", body: "Photography, viewings, negotiation and paperwork are handled by one dedicated advisor." },
      { title: "Vetted enquiries only", body: "We pre-qualify every enquiry before it reaches you, so viewings are productive and private." },
    ],
    steps: [
      { title: "1. Submit your property", body: "Share the basics below — address, type and whether you want to sell or rent. It takes two minutes." },
      { title: "2. Get a free valuation", body: "Your advisor confirms the market value, rental potential and the best channel for your property." },
      { title: "3. Professional presentation", body: "We organise photography, floor plans and a listing description that sells the property." },
      { title: "4. Viewings & offers", body: "We coordinate viewings and negotiate offers on your behalf — you approve everything." },
      { title: "5. Paperwork to handover", body: "Contracts, deposits and key handover are managed to completion, wherever you are." },
    ],
    contactFields: [...LYP_ALL_FIELDS],
  },
  showEmailCard: true,
};

export function mergeSettings(data: Record<string, unknown> | null | undefined): SiteSettings {
  const merged = { ...DEFAULT_SETTINGS, ...((data ?? {}) as Partial<SiteSettings>) };
  // One-time forward-fix: early seeds stored remote stock image URLs; the shipped
  // project now self-hosts those exact assets locally. Only rewrites the legacy values.
  if (typeof merged.seoOgImage === "string" && merged.seoOgImage.includes("images.pexels.com")) merged.seoOgImage = "/images/hero-villa.jpg";
  // Older databases predate the List Your Property content block — deep-merge it.
  merged.listYourProperty = { ...DEFAULT_SETTINGS.listYourProperty, ...((data?.listYourProperty as ListYourPropertyContent) ?? {}) };
  // Older databases predate the per-field toggle — default every field on.
  if (!Array.isArray(merged.listYourProperty.contactFields)) merged.listYourProperty.contactFields = [...LYP_ALL_FIELDS];
  // Older databases predate the email-card toggle — default on.
  if (typeof merged.showEmailCard !== "boolean") merged.showEmailCard = true;
  // Older databases predate the notifications block — deep-merge it.
  merged.notifications = { ...DEFAULT_SETTINGS.notifications, ...((data?.notifications ?? {}) as Partial<LeadNotifications>) };
  // Older databases predate the automations block — deep-merge it.
  merged.automations = { ...DEFAULT_SETTINGS.automations, ...((data?.automations ?? {}) as Partial<Automations>) };
  return merged;
}
