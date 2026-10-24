import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { brochures, leadActivities, leads, projects } from "@/db/schema";
import { ApiError, getIp, handle, json, readJson } from "@/lib/api";
import { sanitizeText } from "@/lib/utils";
import { signBrochureDownload } from "@/lib/brochure-token";

// Phone validation: any characters are allowed in the string (slashes, dots,
// country-language scripts, punctuation) as long as 7+ real digits are present —
// strict whitelists reject perfectly valid real-world numbers.
const phoneDigitCount = (s: string) => (String(s).replace(/[^0-9]/g, "")).length;

const schema = z.object({
  projectSlug: z.string().trim().min(1).max(120),
  name: z.string().trim().min(2, "Please enter your full name").max(120),
  phone: z
    .string()
    .trim()
    .min(6, "Please enter your phone number")
    .max(40, "Phone number is too long")
    .refine((v) => phoneDigitCount(v) >= 7, "Please include the country code, e.g. +92 300 1234567"),
  city: z.string().trim().min(1, "Please enter your city").max(120),
  country: z.string().trim().min(1, "Please enter your country").max(80),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
  website: z.string().max(0, "Spam detected").optional(), // honeypot
});

export const POST = handle(async (req) => {
  // No attempt cap — brochure enquiries are leads and must always arrive.
  const ip = getIp(req);

  const body = await readJson<Record<string, unknown>>(req);
  if (typeof body.website === "string" && body.website.length > 0) {
    // Honeypot tripped — pretend success without storing or releasing the file.
    return json({ ok: true, message: "Thank you. The brochure has been sent to your device." });
  }
  const data = schema.parse(body);

  const [project] = await db
    .select({ id: projects.id, name: projects.name, marketId: projects.marketId, published: projects.published, archived: projects.archived })
    .from(projects)
    .where(eq(projects.slug, data.projectSlug))
    .limit(1);
  if (!project || !project.published || project.archived) return json({ error: "Project is not available" }, { status: 404 });

  const [brochure] = await db
    .select({ id: brochures.id, allowDownload: brochures.allowDownload })
    .from(brochures)
    .where(eq(brochures.projectId, project.id))
    .orderBy(desc(brochures.createdAt))
    .limit(1);
  if (!brochure) {
    return json(
      { error: "A brochure for this project is not available yet — please request details and an advisor will email it to you." },
      { status: 404 },
    );
  }
  if (!brochure.allowDownload) {
    return json(
      { error: "Brochure downloads are currently disabled — please request details and an advisor will send it to you." },
      { status: 403 },
    );
  }

  // Duplicate protection: same phone + project within 24h reuses the lead.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [recent] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(
      and(
        eq(leads.phone, sanitizeText(data.phone, 40)),
        eq(leads.projectId, project.id),
        gt(leads.createdAt, since),
      ),
    )
    .limit(1);

  let leadId: number;
  if (recent) {
    leadId = recent.id;
    await db.insert(leadActivities).values({
      leadId,
      type: "note",
      description: "Brochure downloaded again via project page",
      metadata: { brochureId: brochure.id, city: sanitizeText(data.city, 120), country: sanitizeText(data.country, 80) },
    });
    await db.update(leads).set({ updatedAt: new Date() }).where(eq(leads.id, leadId));
  } else {
    const [lead] = await db.insert(leads).values({
      name: sanitizeText(data.name, 120),
      email: null, // brochure leads provide phone + city, not email
      phone: sanitizeText(data.phone, 40),
      whatsapp: sanitizeText(data.phone, 40),
      country: sanitizeText(data.country, 80),
      projectId: project.id,
      marketId: project.marketId,
      city: sanitizeText(data.city, 120),
      interest: project.name,
      message: data.message ? sanitizeText(data.message, 2000) : "Requested project brochure",
      source: "brochure-download",
      page: `/projects/${sanitizeText(data.projectSlug, 120)}`,
      status: "NEW",
      ip,
    }).returning({ id: leads.id });
    leadId = lead.id;
    await db.insert(leadActivities).values({
      leadId,
      type: "created",
      description: `Brochure download lead created on project page (${project.name})`,
    });
  }

  // The signature binds the download to THIS lead and THIS brochure file.
  const sig = signBrochureDownload(leadId, brochure.id);
  return json({ ok: true, url: `/api/brochures/${brochure.id}?lead=${leadId}&sig=${encodeURIComponent(sig)}` }, { status: 201 });
});
