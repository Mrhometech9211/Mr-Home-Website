import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import { getIp, handle, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { DEFAULT_SETTINGS, mergeSettings } from "@/lib/settings-types";
import { isSafeHref } from "@/lib/url";

const str = (max = 500) => z.string().trim().max(max);
const schema = z.object({
  brandName: str(80), tagline: str(160), logo: str(), logoDark: str(), favicon: str(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #1f8f3a"), accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #3ec24a"),
  phone: str(40), whatsapp: str(40), email: z.string().trim().email().max(254), address: str(300), workingHours: str(120),
  mapUrl: str(1000).refine((v) => !v || isSafeHref(v), "Map URL must be a https:// or internal link"),
  offices: z.array(z.object({ name: str(80), address: str(300), phone: str(40).optional(), mapUrl: str(1000).optional(), hours: str(120).optional() })).max(20),
  socialLinks: z.array(z.object({ platform: str(40), url: str(1000).refine(isSafeHref, "Social link URL must start with https:// (or be an internal /path)"), icon: str(1000).refine((v) => !v || isSafeHref(v), "Social icon must be a https:// URL or an internal /api/media path").optional() })).max(20),
  footerDescription: str(400), copyrightText: str(160),
  footerLinks: z.array(z.object({ label: str(80), href: str(500).refine(isSafeHref, "Footer link href must be an internal path or a https:// URL") })).max(20),
  seoDefaultTitle: str(160), seoDefaultDescription: str(400), seoOgImage: str(1000), siteUrl: str(300), gaId: str(60), metaPixelId: str(60),
  whatsappDefaultMessage: str(1000), whatsappProjectMessage: str(1000), whatsappMarketMessage: str(1000),
  newsletterEnabled: z.boolean(), newsletterTitle: str(80), newsletterDescription: str(300),
  introVideoUrl: str(1000), introVideoPoster: str(1000), introVideoEnabled: z.boolean(),
  announcement: str(300), announcementEnabled: z.boolean(), cookieConsentEnabled: z.boolean(), whatsappFloatEnabled: z.boolean(), cookieConsentText: str(600), disclaimer: str(1500),
  contactFields: z.array(z.string().max(30)).max(20), budgetOptions: z.array(str(60)).max(30), interestOptions: z.array(str(60)).max(30),
  notifications: z.object({
    leadsEnabled: z.boolean(),
    pollSeconds: z.number().int().min(5).max(300),
    volume: z.number().int().min(0).max(100),
    sound: z.enum(["chime", "ding", "custom"]),
    soundUrl: str(1000).refine((v) => !v || isSafeHref(v), "Sound URL must be a https:// URL or an internal /api/media path"),
    titleTemplate: str(120),
    notifyRoles: z.array(str(60)).max(20),
  }),
  automations: z.object({
    autoAssign: z.boolean(),
    autoFollowUp: z.boolean(),
    followUpHours: z.number().int().min(1).max(720),
    autoScore: z.boolean(),
    staleArchive: z.boolean(),
    staleArchiveDays: z.number().int().min(3).max(365),
  }),
  listYourProperty: z.object({
    eyebrow: str(80), title: str(160), heroBody: str(600),
    heroImage: str(1000),
    formTitle: str(160), formIntro: str(600),
    formCtaLabel: str(80),
    formCtaHref: str(300).refine((v) => !v || isSafeHref(v), "CTA link must be an internal path or a https:// URL"),
    benefits: z.array(z.object({ title: str(120).optional(), body: str(600).optional() })).max(8),
    steps: z.array(z.object({ title: str(120).optional(), body: str(600).optional() })).max(10),
    // Per-field toggles for the public List My Property form. This key was
    // previously absent, so Zod silently stripped the admin's toggles on save
    // and the public form never changed — the "field changes don't appear" bug.
    contactFields: z
      .array(
        z.enum([
          "email",
          "phone",
          "preferredLanguage",
          "propertyAddress",
          "propertyType",
          "purpose",
          "bedrooms",
          "market",
          "message",
        ]),
      )
      .max(9),
  }),
}).partial();

export const GET = handle(async () => {
  await requireUser("settings.read");
  const rows = await db.select().from(siteSettings).where(eq(siteSettings.id, 1)).limit(1);
  return json({ data: mergeSettings(rows[0]?.data), defaults: DEFAULT_SETTINGS });
});

export const PUT = handle(async (req) => {
  const me = await requireUser("settings.write");
  const patch = schema.parse(await readJson(req));
  const rows = await db.select().from(siteSettings).where(eq(siteSettings.id, 1)).limit(1);
  const current = mergeSettings(rows[0]?.data);
  const next = { ...current, ...patch };
  if (rows[0]) await db.update(siteSettings).set({ data: next as unknown as Record<string, unknown>, updatedAt: new Date() }).where(eq(siteSettings.id, 1));
  else await db.insert(siteSettings).values({ id: 1, data: next as unknown as Record<string, unknown> });
  const cur = current as unknown as Record<string, unknown>;
  const changed = Object.keys(patch).filter((k) => JSON.stringify(cur[k]) !== JSON.stringify((patch as Record<string, unknown>)[k]));
  await audit({ user: me, action: "settings.updated", entity: "settings", entityId: 1, metadata: { changed }, ip: getIp(req) });
  return json({ data: next });
});
