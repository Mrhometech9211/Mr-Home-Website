import { z } from "zod";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { leadActivities, leads, markets, projects } from "@/db/schema";
import { getIp, handle, json, readJson } from "@/lib/api";
import { sanitizeText } from "@/lib/utils";
import { runNewLeadAutomations } from "@/lib/automations";

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your full name").max(120),
  email: z.string().trim().toLowerCase().email("Please enter a valid email"),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  whatsapp: z.string().trim().max(40).optional().or(z.literal("")),
  country: z.string().trim().max(80).optional().or(z.literal("")),
  marketId: z.union([z.coerce.number().int().positive(), z.literal("")]).optional(),
  projectId: z.union([z.coerce.number().int().positive(), z.literal("")]).optional(),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  budget: z.string().trim().max(80).optional().or(z.literal("")),
  customBudget: z.string().trim().max(80).optional().or(z.literal("")),
  interest: z.string().trim().max(80).optional().or(z.literal("")),
  message: z.string().trim().max(3000).optional().or(z.literal("")),
  source: z.string().trim().max(60).optional(),
  page: z.string().trim().max(200).optional(),
  campaign: z.string().trim().max(120).optional().nullable(),
  website: z.string().max(0, "Spam detected").optional(), // honeypot
});

export const POST = handle(async (req) => {
  // No per-IP submission cap on leads — every enquiry must reach the inbox and
  // trigger the desktop notifier. The honeypot below still filters bots.
  const ip = getIp(req);

  const body = await readJson<Record<string, unknown>>(req);
  if (typeof body.website === "string" && body.website.length > 0) {
    // Honeypot tripped — pretend success without storing.
    return json({ ok: true, message: "Thank you. An advisor will contact you shortly." });
  }
  const data = schema.parse(body);

  const resolvedBudget = data.budget === "__custom__" ? (data.customBudget ? `Custom: ${data.customBudget}` : null) : data.budget || null;

  const marketId = typeof data.marketId === "number" ? data.marketId : null;
  const projectId = typeof data.projectId === "number" ? data.projectId : null;
  if (marketId) {
    const m = await db.select({ id: markets.id }).from(markets).where(eq(markets.id, marketId)).limit(1);
    if (!m.length) return json({ error: "Selected market is invalid" }, { status: 400 });
  }
  if (projectId) {
    const p = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!p.length) return json({ error: "Selected project is invalid" }, { status: 400 });
  }

  // Double-submit guard only: same email + same project within 60s is treated as
  // one accidental double-tap (logged as an activity). Repeat enquiries beyond
  // that always create a fresh, notifiable lead — no 24h suppression.
  const since = new Date(Date.now() - 60 * 1000);
  const dupConds = [eq(leads.email, data.email), gt(leads.createdAt, since)];
  if (projectId) dupConds.push(eq(leads.projectId, projectId));
  const dup = await db.select({ id: leads.id }).from(leads).where(and(...dupConds)).limit(1);
  if (dup[0]) {
    await db.insert(leadActivities).values({ leadId: dup[0].id, type: "duplicate", description: "Repeat inquiry received from website", metadata: { message: sanitizeText(data.message || ""), page: data.page, budget: resolvedBudget, city: data.city, interest: data.interest } });
    await db.update(leads).set({ updatedAt: new Date() }).where(eq(leads.id, dup[0].id));
    return json({ ok: true, duplicate: true, message: "We already have your recent inquiry on file — an advisor will be in touch shortly." });
  }

  const [lead] = await db
    .insert(leads)
    .values({
      name: sanitizeText(data.name, 120),
      email: data.email,
      phone: data.phone ? sanitizeText(data.phone, 40) : null,
      whatsapp: data.whatsapp ? sanitizeText(data.whatsapp, 40) : data.phone ? sanitizeText(data.phone, 40) : null,
      country: data.country ? sanitizeText(data.country, 80) : null,
      marketId,
      projectId,
      city: data.city ? sanitizeText(data.city, 120) : null,
      budget: resolvedBudget,
      interest: data.interest || null,
      message: data.message ? sanitizeText(data.message, 3000) : null,
      source: data.source || "website",
      page: data.page || null,
      campaign: data.campaign || null,
      status: "NEW",
      ip,
    })
    .returning({ id: leads.id });
  await db.insert(leadActivities).values({ leadId: lead.id, type: "created", description: `Lead created from ${data.source || "website"}${data.page ? ` (${data.page})` : ""}` });
  // Admin → Settings → Automation rules (scoring / assignment / follow-up task).
  // Best-effort: a rule failure must never turn a captured lead into an error.
  const automation = await runNewLeadAutomations(lead.id);
  return json({ ok: true, id: lead.id, automation, message: "Thank you. An MR.HOME advisor will contact you within one business day." }, { status: 201 });
});
