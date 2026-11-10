import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { projectUnits, projects } from "@/db/schema";
import { ApiError, handle, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/content";
import { calculateOffer } from "@/lib/offers/calc";
import { DEFAULT_ASSETS, DEFAULT_DESIGN } from "@/lib/offers/defaults";
import { renderOfferPdf } from "@/lib/offers/render";
import { createOfferSchema } from "@/lib/offers/schema";
import type { OfferSnapshotInput, OfferTermsInput, OfferUnitInput } from "@/lib/offers/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const previewSchema = createOfferSchema.extend({
  planKeys: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
});

export const POST = handle(async (req) => {
  await requireUser("offers.write");
  const input = previewSchema.parse(await readJson(req));
  const [project] = input.projectId
    ? await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1)
    : [];
  if (input.projectId && !project) throw new ApiError(400, "The selected project does not exist");

  const [unitRow] = input.unitId
    ? await db.select().from(projectUnits).where(eq(projectUnits.id, input.unitId)).limit(1)
    : [];
  if (input.unitId && !unitRow) throw new ApiError(400, "The selected unit does not exist");
  if (unitRow && input.projectId && unitRow.projectId !== input.projectId) {
    throw new ApiError(400, "The selected unit belongs to a different project");
  }

  const terms: OfferTermsInput = input.terms ?? {
    currency: (unitRow?.currency || project?.currency || "AED").toUpperCase(),
    unitPrice: unitRow?.price ?? project?.price ?? "",
    plans: [],
  };
  const unit: OfferUnitInput = {
    unitNo: unitRow?.unitNo ?? "",
    type: unitRow?.unitType ?? "",
    bedrooms: unitRow?.bedrooms ?? "",
    area: unitRow?.area ?? "",
    areaUnit: unitRow?.areaUnit ?? "sqft",
    floor: unitRow?.floor ?? "",
    view: unitRow?.view ?? "",
    price: unitRow?.price ?? "",
    ...(input.unit ?? {}),
  };
  const calc = calculateOffer({ terms, unit });
  const errors = calc.issues.filter((issue) => issue.severity === "error");
  if (errors.length) throw new ApiError(400, errors[0].message);

  const selected = input.planKeys?.length
    ? calc.plans.filter((plan) => input.planKeys!.includes(plan.key))
    : calc.plans;
  if (!selected.length) throw new ApiError(400, "Select at least one payment plan for the preview");
  if (input.planKeys && selected.length !== input.planKeys.length) throw new ApiError(400, "One or more selected payment plans are unavailable");

  const settings = await getSettings();
  const options = {
    assets: { ...DEFAULT_ASSETS, ...(input.options?.assets ?? {}) },
    design: { ...DEFAULT_DESIGN, ...(input.options?.design ?? {}) },
  };
  const snapshot: OfferSnapshotInput = {
    reference: "LIVE-PREVIEW",
    title: input.title,
    date: new Date().toISOString().slice(0, 10),
    customer: input.customer,
    project: project ? {
      name: project.name,
      city: project.city ?? undefined,
      country: project.country ?? undefined,
      developer: project.developer ?? undefined,
      description: project.description ?? undefined,
      amenities: project.amenities ?? [],
    } : undefined,
    unit,
    terms: { ...terms, currency: terms.currency.toUpperCase() },
    assets: {
      ...options.assets,
      projectLogo: options.assets.projectLogo || project?.developerLogo || undefined,
      mrHomeLogo: options.assets.mrHomeLogo || settings.logoDark || settings.logo,
    },
    design: {
      ...options.design,
      contactPhone: options.design.contactPhone || settings.phone,
      contactEmail: options.design.contactEmail || settings.email,
      contactSite: options.design.contactSite || settings.siteUrl || "www.mrhomerealestate.com",
      disclaimer: options.design.disclaimer || settings.disclaimer,
    },
  };
  const bytes = await renderOfferPdf(snapshot, { ...calc, plans: selected }, { origin: new URL(req.url).origin });
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(new Blob([buffer], { type: "application/pdf" }), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="sales-offer-live-preview.pdf"',
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
});
