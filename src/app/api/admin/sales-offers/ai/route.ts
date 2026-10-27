import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { handle, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { aiStatus, deterministicFacts, interpretOfferPrompt, type AiContext } from "@/lib/offers/ai";
import { deriveQuestions } from "@/lib/offers/calc";
import { aiPromptSchema } from "@/lib/offers/schema";
import { getOfferOrThrow, getOfferUnits, offerCalculation } from "@/lib/offers/service";

export const maxDuration = 30;

export const POST = handle(async (req) => {
  const me = await requireUser("offers.write");
  const body = aiPromptSchema.parse(await readJson(req));

  let offer = null;
  if (body.offerId) offer = await getOfferOrThrow(body.offerId);
  const projectId = body.projectId ?? offer?.projectId ?? null;

  let project: AiContext["project"] | undefined;
  if (projectId) {
    const [row] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (row) project = { id: row.id, name: row.name, city: row.city, country: row.country, developer: row.developer, currency: row.currency };
  }

  const unitRows = projectId ? await getOfferUnits(projectId) : [];
  const units = unitRows.slice(0, 80).map((u) => ({ unitNo: u.unitNo, type: u.unitType, bedrooms: u.bedrooms, area: u.area ? `${u.area} ${u.areaUnit ?? ""}`.trim() : null, price: u.price, status: u.status }));

  const terms = (offer?.terms ?? {}) as { plans?: { name?: string }[]; paymentStartDate?: string; handoverDate?: string };
  const planNames = Array.isArray(terms.plans) ? terms.plans.map((p) => String(p.name ?? "")).filter(Boolean) : [];
  const customer = (offer?.customer ?? {}) as { name?: string };

  const context: AiContext = {
    offerReference: offer?.reference,
    project,
    units,
    planNames,
    existingTitle: offer?.title ?? undefined,
    includeMrHomeLogo: (offer?.options as { assets?: { includeMrHomeLogo?: boolean } } | null)?.assets?.includeMrHomeLogo,
  };

  const ai = await interpretOfferPrompt({ prompt: body.prompt, context, userKey: `user-${me.id}` });
  const calc = offer ? offerCalculation(offer) : null;
  const questions = calc
    ? deriveQuestions(calc, { paymentStartDate: terms.paymentStartDate, handoverDate: terms.handoverDate, customer })
    : [];

  return json({
    data: {
      ai,
      status: aiStatus(),
      facts: ai.ok ? ai.data.facts : deterministicFacts(context),
      questions: ai.ok ? [...new Set([...questions, ...ai.data.questions])] : questions,
      disclosure: {
        dataShared: ai.ok,
        provider: ai.provider,
        note: "Only project/unit records and your prompt are sent to the AI provider. Customer name, email and phone are never included.",
      },
    },
  });
});
