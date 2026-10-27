import { z } from "zod";

const safeText = (max: number) => z.string().trim().max(max);
const urlOrPath = z
  .string()
  .trim()
  .max(1200)
  .refine((v) => !v || v.startsWith("/") || /^https:\/\//i.test(v), "Use an internal /path or an https:// URL");

export const offerComponentSchema = z.object({
  id: z.string().trim().min(1).max(60),
  label: safeText(90),
  timing: z.enum(["booking", "downPayment", "construction", "installments", "handover", "milestone", "other"]),
  type: z.enum(["percent", "amount"]),
  value: z.coerce.number().finite().positive().max(1_000_000_000),
  count: z.coerce.number().int().min(1).max(600).optional(),
  frequency: z.enum(["monthly", "quarterly", "annual", "one-off"]).optional(),
  startDate: z.string().trim().max(10).nullable().optional(),
  note: safeText(300).optional(),
});

export const offerDiscountSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none"), value: z.coerce.number().finite().optional(), reason: safeText(200).optional() }),
  z.object({ type: z.literal("percent"), value: z.coerce.number().finite().min(0).max(100), reason: safeText(200).optional() }),
  z.object({ type: z.literal("amount"), value: z.coerce.number().finite().min(0).max(1_000_000_000), reason: safeText(200).optional() }),
]);

export const offerFeeSchema = z.object({
  id: z.string().trim().min(1).max(60),
  label: safeText(80),
  type: z.enum(["percent", "amount"]),
  value: z.coerce.number().finite().min(0).max(1_000_000_000),
  basis: z.enum(["listPrice", "contractPrice"]).optional(),
});

export const offerPlanSchema = z.object({
  key: z.string().trim().regex(/^[a-zA-Z0-9_-]{1,40}$/, "Plan identifier is invalid"),
  name: safeText(80),
  badge: safeText(30).optional(),
  highlight: z.boolean().optional(),
  discount: offerDiscountSchema.optional(),
  components: z.array(offerComponentSchema).max(40),
});

export const offerTermsSchema = z.object({
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "Use a 3-letter currency code"),
  unitPrice: z.union([z.coerce.number().finite().min(0), z.literal("")]),
  plans: z.array(offerPlanSchema).max(8),
  vatPct: z.coerce.number().finite().min(0).max(100).nullable().optional(),
  fees: z.array(offerFeeSchema).max(12).optional(),
  rounding: z.enum(["currency", "nearest100", "none"]).optional(),
  paymentStartDate: z.string().trim().max(10).nullable().optional(),
  handoverDate: z.string().trim().max(10).nullable().optional(),
  notes: safeText(2000).optional(),
});

export const offerCustomerSchema = z.object({
  name: safeText(120).optional(),
  email: z.union([z.string().trim().email().max(254), z.literal("")]).optional(),
  phone: safeText(60).optional(),
  country: safeText(80).optional(),
});

export const offerUnitSchema = z.object({
  unitNo: safeText(40).optional(),
  type: safeText(80).optional(),
  bedrooms: safeText(20).optional(),
  area: z.union([z.coerce.number().finite().min(0), z.literal("")]).optional(),
  areaUnit: safeText(12).optional(),
  floor: safeText(30).optional(),
  view: safeText(80).optional(),
  price: z.union([z.coerce.number().finite().min(0), z.literal("")]).optional(),
});

export const offerAssetsSchema = z.object({
  coverImage: urlOrPath.optional(),
  gallery: z.array(urlOrPath).max(12).default([]),
  floorPlans: z.array(z.object({ name: safeText(80), image: urlOrPath })).max(8).default([]),
  planImages: z
    .array(z.object({ planKey: z.string().trim().regex(/^[a-zA-Z0-9_-]{1,40}$/), image: urlOrPath }))
    .max(8)
    .optional(),
  projectLogo: urlOrPath.optional(),
  mrHomeLogo: urlOrPath.optional(),
  includeMrHomeLogo: z.boolean(),
});

export const offerDesignSchema = z.object({
  theme: z.enum(["premium", "minimal", "bold"]),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #1f8f3a"),
  ink: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #0b1b12"),
  paper: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #ffffff"),
  showPriceBreakdown: z.boolean(),
  showGallery: z.boolean(),
  showFloorPlans: z.boolean(),
  showContact: z.boolean(),
  showDisclaimer: z.boolean(),
  showScheduleSummary: z.boolean(),
  coverStyle: z.enum(["photo", "split", "solid"]).optional(),
  coverOverlay: z.coerce.number().int().min(0).max(90).optional(),
  headline: safeText(120).optional(),
  eyebrow: safeText(80).optional(),
  displayFont: z.enum(["sans", "serif"]).optional(),
  density: z.enum(["comfortable", "compact"]).optional(),
  showUnitStrip: z.boolean().optional(),
  showPlanImages: z.boolean().optional(),
  pageNumbers: z.boolean().optional(),
  watermark: safeText(40).optional(),
  ctaText: safeText(60).optional(),
  ctaNote: safeText(120).optional(),
  disclaimer: safeText(2000).optional(),
  footerNote: safeText(500).optional(),
  preparedBy: safeText(80).optional(),
  contactPhone: safeText(60).optional(),
  contactEmail: z.union([z.string().trim().email().max(254), z.literal("")]).optional(),
  contactSite: safeText(160).optional(),
  tagline: safeText(160).optional(),
});

export const offerOptionsSchema = z.object({
  assets: offerAssetsSchema,
  design: offerDesignSchema,
});

export const offerConversationEntrySchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().trim().max(6000),
  at: z.string().trim().max(40).optional(),
});

export const offerConversationSchema = z.array(offerConversationEntrySchema).max(60);

export const createOfferSchema = z.object({
  title: safeText(200).optional(),
  leadId: z.coerce.number().int().positive().nullable().optional(),
  projectId: z.coerce.number().int().positive().nullable().optional(),
  unitId: z.coerce.number().int().positive().nullable().optional(),
  customer: offerCustomerSchema.optional(),
  unit: offerUnitSchema.optional(),
  terms: offerTermsSchema.optional(),
  options: offerOptionsSchema.optional(),
  conversation: offerConversationSchema.optional(),
});

export const patchOfferSchema = z.object({
  title: safeText(200).optional(),
  leadId: z.coerce.number().int().positive().nullable().optional(),
  projectId: z.coerce.number().int().positive().nullable().optional(),
  unitId: z.coerce.number().int().positive().nullable().optional(),
  customer: offerCustomerSchema.optional(),
  unit: offerUnitSchema.optional(),
  terms: offerTermsSchema.optional(),
  options: offerOptionsSchema.optional(),
  conversation: offerConversationSchema.optional(),
});

export const generateOfferSchema = z.object({
  mode: z.enum(["combined", "separate"]).default("combined"),
  planKeys: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
});

export const approveOfferSchema = z.object({
  batchId: z.string().trim().min(1).max(80).optional(),
});

export const offerActionSchema = z.object({
  action: z.enum(["archive", "restore", "revise"]),
});

export const importParseSchema = z.object({
  mediaId: z.coerce.number().int().positive(),
  projectId: z.coerce.number().int().positive(),
});

export const importCommitSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  mode: z.enum(["skip", "update"]),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/),
  source: safeText(120).optional(),
  rows: z
    .array(
      z.object({
        unitNo: z.string().trim().min(1).max(40),
        unitType: safeText(80).optional(),
        bedrooms: safeText(20).optional(),
        area: z.coerce.number().finite().min(0).nullable().optional(),
        areaUnit: safeText(12).optional(),
        floor: safeText(30).optional(),
        view: safeText(80).optional(),
        price: z.coerce.number().finite().min(0).nullable().optional(),
        status: safeText(30).optional(),
      }),
    )
    .min(1)
    .max(2000),
});

export const projectUnitInputSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  unitNo: z.string().trim().min(1).max(40),
  unitType: safeText(80).optional(),
  bedrooms: safeText(20).optional(),
  area: z.coerce.number().finite().min(0).nullable().optional(),
  areaUnit: safeText(12).optional(),
  floor: safeText(30).optional(),
  view: safeText(80).optional(),
  price: z.coerce.number().finite().min(0).nullable().optional(),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).optional(),
  status: safeText(30).optional(),
  notes: safeText(500).optional(),
});

export const projectUnitUpdateSchema = projectUnitInputSchema.omit({ projectId: true }).partial().extend({
  unitId: z.coerce.number().int().positive(),
});

export const aiPromptSchema = z.object({
  prompt: z.string().trim().min(3).max(4000),
  offerId: z.coerce.number().int().positive().nullable().optional(),
  projectId: z.coerce.number().int().positive().nullable().optional(),
  unitId: z.coerce.number().int().positive().nullable().optional(),
  currentSummary: safeText(4000).optional(),
});

export type CreateOfferBody = z.infer<typeof createOfferSchema>;
export type PatchOfferBody = z.infer<typeof patchOfferSchema>;
