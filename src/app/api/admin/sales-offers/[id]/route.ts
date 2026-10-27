import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leads, projects } from "@/db/schema";
import { ApiError, handle, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { deriveQuestions } from "@/lib/offers/calc";
import { offerCalculation, listVersions, publicVersion, getOfferOrThrow, updateOffer, deleteOffer } from "@/lib/offers/service";
import { patchOfferSchema } from "@/lib/offers/schema";

type Ctx = { params: Promise<{ id: string }> };

function idOf(raw: string) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) throw new ApiError(400, "Invalid offer id");
  return n;
}

export const GET = handle<Ctx>(async (_req, ctx) => {
  await requireUser("offers.read");
  const { id } = await ctx.params;
  const offer = await getOfferOrThrow(idOf(id));
  const [versions, project, lead] = await Promise.all([
    listVersions(offer.id),
    offer.projectId ? db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.id, offer.projectId)).limit(1) : Promise.resolve([]),
    offer.leadId ? db.select({ id: leads.id, name: leads.name, email: leads.email, phone: leads.phone }).from(leads).where(eq(leads.id, offer.leadId)).limit(1) : Promise.resolve([]),
  ]);
  const calc = offerCalculation(offer);
  const customer = (offer.customer ?? {}) as { name?: string };
  return json({
    data: {
      ...offer,
      projectName: project[0]?.name ?? null,
      leadName: lead[0]?.name ?? null,
      calculation: calc,
      questions: deriveQuestions(calc, { paymentStartDate: (offer.terms as { paymentStartDate?: string } | null)?.paymentStartDate, handoverDate: (offer.terms as { handoverDate?: string } | null)?.handoverDate, customer }),
      versions: versions.map(publicVersion),
      latestBatchId: versions[0]?.batchId ?? null,
    },
  });
});

export const PATCH = handle<Ctx>(async (req, ctx) => {
  const me = await requireUser("offers.write");
  const { id } = await ctx.params;
  const body = patchOfferSchema.parse(await readJson(req));
  const row = await updateOffer(
    idOf(id),
    {
      ...body,
      options: body.options ? { assets: body.options.assets, design: body.options.design } : undefined,
    },
    me,
  );
  return json({ data: row });
});

export const DELETE = handle<Ctx>(async (_req, ctx) => {
  const me = await requireUser("offers.write");
  const { id } = await ctx.params;
  const offer = await getOfferOrThrow(idOf(id));
  await deleteOffer(offer, me);
  return json({ ok: true });
});
