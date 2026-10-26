import { z } from "zod";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { leadActivities, leads, markets, siteSettings } from "@/db/schema";
import { getIp, handle, json, readJson } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizeText } from "@/lib/utils";
import { LISTING_LANGUAGES, LISTING_PROPERTY_TYPES, LISTING_PURPOSES } from "@/lib/listing-options";
import { mergeSettings } from "@/lib/settings-types";

/**
 * Phase 3 — Property Listing Leads.
 * Owners submitting a property for listing keep a distinct source
 * ("property-listing") plus structured details, so the CRM can
 * group them separately from buyer inquiries.
 */
const propertyTypeEnum = LISTING_PROPERTY_TYPES as [string, ...string[]];
const purposeEnum = LISTING_PURPOSES.map((p) => p.value) as ["sell" | "rent" | "both", ...("sell" | "rent" | "both")[]];

/**
 * Field-level validation only fires for fields the admin has kept visible —
 * toggled-off fields are simply omitted, not rejected. `propertyAddress` is
 * required only while the admin keeps it on the form (see the post-parse
 * check below); all other structural toggles stay optional.
 */
const optionalEmpty = (s: z.ZodString) => s.optional().or(z.literal(""));
const schema = z.object({
  name: z.string().trim().min(2, "Please enter your full name").max(120),
  email: optionalEmpty(z.string().trim().toLowerCase()).refine((v) => !v || /^\S+@\S+\.\S+$/.test(v), "Please enter a valid email"),
  phone: optionalEmpty(z.string().trim()).refine((v) => !v || (v.length >= 6 && v.length <= 40), "Please enter a phone number")
    .refine((v) => !v || /^\+?[0-9 ()\-]{6,40}$/.test(v), "Phone must contain a country code, e.g. +971 50 123 4567"),
  preferredLanguage: z.string().trim().max(60).optional().or(z.literal("")),
  propertyAddress: optionalEmpty(z.string().trim()),
  propertyType: z.enum(propertyTypeEnum).optional(),
  purpose: z.enum(purposeEnum).optional(),
  bedrooms: z.union([z.coerce.number().int().min(0).max(20), z.literal("")]).optional(),
  message: z.string().trim().max(3000).optional().or(z.literal("")),
  marketId: z.union([z.coerce.number().int().positive(), z.literal("")]).optional(),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  country: z.string().trim().max(80).optional().or(z.literal("")),
  page: z.string().trim().max(200).optional(),
  website: z.string().max(0, "Spam detected").optional(), // honeypot
});

export const POST = handle(async (req) => {
  // No submission cap — every listing enquiry must reach the inbox.
  const ip = getIp(req);

  const body = await readJson<Record<string, unknown>>(req);
  if (typeof body.website === "string" && body.website.length > 0) {
    // Honeypot tripped — pretend success without storing.
    return json({ ok: true, message: "Thank you. Our listings team will contact you shortly." });
  }
  const data = schema.parse(body);

  // Honour the admin's per-field toggles: a field that is switched OFF in
  // Settings → List Your Property must not be required here either. Only the
  // required-when-visible guard needs runtime data (the schema above is static).
  const cfg = await db.select({ data: siteSettings.data }).from(siteSettings).where(eq(siteSettings.id, 1)).limit(1);
  const lypFields = new Set(mergeSettings(cfg[0]?.data).listYourProperty.contactFields);
  const visible = (f: string) => lypFields.has(f);
  const address = typeof data.propertyAddress === "string" ? data.propertyAddress : "";
  if (address.length === 0 && visible("propertyAddress")) {
    return json({ error: "Validation failed", issues: [{ path: "propertyAddress", message: "Please enter the property address" }] }, { status: 400 });
  }
  if (address.length > 0 && address.length < 4) {
    return json({ error: "Validation failed", issues: [{ path: "propertyAddress", message: "Please enter a more complete property address" }] }, { status: 400 });
  }

  const marketId = typeof data.marketId === "number" ? data.marketId : null;
  if (marketId) {
    const m = await db.select({ id: markets.id }).from(markets).where(eq(markets.id, marketId)).limit(1);
    if (!m.length) return json({ error: "Selected market is invalid" }, { status: 400 });
  }

  // Duplicate protection is a 60s double-click guard only; the same owner may
  // legitimately re-submit their property later.
  const since = new Date(Date.now() - 60 * 1000);
  const dup = data.email
    ? await db
        .select({ id: leads.id })
        .from(leads)
        .where(and(eq(leads.email, data.email), gt(leads.createdAt, since)))
        .limit(50)
    : [];
  const dups = await Promise.all(
    dup.map(async (d) => {
      const rows = await db.select({ details: leads.details }).from(leads).where(eq(leads.id, d.id)).limit(1);
      const details = rows[0]?.details as Record<string, unknown> | null | undefined;
      return String(details?.propertyAddress ?? "").toLowerCase() === (data.propertyAddress ?? "").trim().toLowerCase();
    }),
  );
  if (dups.some(Boolean)) {
    return json({ ok: true, duplicate: true, message: "We already have your recent listing submission on file — our team will be in touch shortly." });
  }

  const details = {
    preferredLanguage: sanitizeText(data.preferredLanguage || "", 60) || null,
    propertyAddress: sanitizeText(address || "Not provided", 300),
    propertyType: data.propertyType || "Apartment",
    purpose: data.purpose || "sell",
    bedrooms: data.bedrooms === "" || data.bedrooms == null ? null : data.bedrooms,
  };

  const [lead] = await db
    .insert(leads)
    .values({
      name: sanitizeText(data.name, 120),
      email: data.email || null,
      phone: sanitizeText(data.phone || "", 40) || null,
      whatsapp: sanitizeText(data.phone || "", 40) || null,
      country: data.country ? sanitizeText(data.country, 80) : null,
      marketId,
      city: data.city ? sanitizeText(data.city, 120) : null,
      budget: null,
      interest: "Property Listing",
      message: data.message ? sanitizeText(data.message, 3000) : null,
      source: "property-listing",
      page: data.page || "/list-your-property",
      status: "NEW",
      details,
      ip,
    })
    .returning({ id: leads.id });
  await db.insert(leadActivities).values({ leadId: lead.id, type: "created", description: `Property listing submission (${(data.purpose || "sell") === "rent" ? "for rent" : (data.purpose || "sell") === "both" ? "sale or rent" : "for sale"}) received via list-your-property` });
  return json({ ok: true, id: lead.id, message: "Thank you. Our listings team will contact you within one business day." }, { status: 201 });
});
