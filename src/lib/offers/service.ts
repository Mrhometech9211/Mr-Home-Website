import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, max } from "drizzle-orm";
import { db } from "@/db";
import { leads, projectUnits, projects, salesOfferVersions, salesOffers, type SalesOffer, type SalesOfferVersion } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import type { SafeUser } from "@/lib/auth";
import type { SiteSettings } from "@/lib/settings-types";
import { calculateOffer } from "./calc";
import { DEFAULT_ASSETS, DEFAULT_DESIGN } from "./defaults";
import { renderOfferPackage, renderOfferPdf } from "./render";
import { expectedPdfFigures, validateRenderedPdf } from "./render";
import type { OfferAssets, OfferCalculation, OfferDesign, OfferSnapshotInput, OfferTermsInput } from "./types";
import { putR2Object, r2IsConfigured } from "@/lib/r2";

export type OfferWithContext = SalesOffer & {
  leadName: string | null;
  projectName: string | null;
  unitNo: string | null;
};

export async function listOffers(opts: { status?: string; q?: string; limit?: number } = {}): Promise<OfferWithContext[]> {
  const limit = Math.min(200, Math.max(1, opts.limit ?? 60));
  const rows = await db
    .select({
      offer: salesOffers,
      leadName: leads.name,
      projectName: projects.name,
      unitNo: projectUnits.unitNo,
    })
    .from(salesOffers)
    .leftJoin(leads, eq(salesOffers.leadId, leads.id))
    .leftJoin(projects, eq(salesOffers.projectId, projects.id))
    .leftJoin(projectUnits, eq(salesOffers.unitId, projectUnits.id))
    .where(opts.status ? eq(salesOffers.status, opts.status as SalesOffer["status"]) : undefined)
    .orderBy(desc(salesOffers.updatedAt))
    .limit(limit);
  const filtered = opts.q
    ? rows.filter((r) => `${r.offer.reference} ${r.offer.title ?? ""} ${r.leadName ?? ""} ${r.projectName ?? ""} ${r.unitNo ?? ""}`.toLowerCase().includes(opts.q!.toLowerCase()))
    : rows;
  return filtered.map((r) => ({ ...r.offer, leadName: r.leadName, projectName: r.projectName, unitNo: r.unitNo }));
}

export async function getOffer(id: number): Promise<SalesOffer | null> {
  const [row] = await db.select().from(salesOffers).where(eq(salesOffers.id, id)).limit(1);
  return row ?? null;
}

export async function getOfferOrThrow(id: number): Promise<SalesOffer> {
  const row = await getOffer(id);
  if (!row) throw new ApiError(404, "Sales offer not found");
  return row;
}

export async function listVersions(offerId: number): Promise<SalesOfferVersion[]> {
  return db.select().from(salesOfferVersions).where(eq(salesOfferVersions.offerId, offerId)).orderBy(desc(salesOfferVersions.version));
}

/** Client-safe version metadata (no storage key, no PDF bytes). */
export function publicVersion(v: SalesOfferVersion) {
  return {
    id: v.id,
    version: v.version,
    batchId: v.batchId,
    status: v.status,
    filename: v.pdfFilename,
    size: v.pdfSize,
    createdAt: v.createdAt,
    storage: v.pdfStorageKey ? ("r2" as const) : ("database" as const),
  };
}

export async function getOfferProjects() {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      city: projects.city,
      country: projects.country,
      developer: projects.developer,
      developerLogo: projects.developerLogo,
      currency: projects.currency,
      price: projects.price,
      coverImage: projects.coverImage,
      gallery: projects.gallery,
      floorPlans: projects.floorPlans,
      amenities: projects.amenities,
      description: projects.description,
      shortDescription: projects.shortDescription,
      status: projects.status,
      published: projects.published,
    })
    .from(projects)
    .orderBy(projects.name);
}

export async function getOfferUnits(projectId?: number) {
  const base = db.select().from(projectUnits);
  const filtered = projectId ? base.where(eq(projectUnits.projectId, projectId)) : base;
  return filtered.orderBy(projectUnits.unitNo).limit(3000);
}

export async function getOfferLeads(limit = 200) {
  return db
    .select({
      id: leads.id,
      name: leads.name,
      email: leads.email,
      phone: leads.phone,
      country: leads.country,
      projectId: leads.projectId,
      budget: leads.budget,
      message: leads.message,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .where(eq(leads.archived, false))
    .orderBy(desc(leads.createdAt))
    .limit(limit);
}

export async function getOfferBuilderContext(offerId?: number) {
  const [projectsList, units, leadList] = await Promise.all([getOfferProjects(), getOfferUnits(), getOfferLeads()]);
  let offer: (SalesOffer & { versions: ReturnType<typeof publicVersion>[] }) | null = null;
  if (offerId) {
    const row = await getOfferOrThrow(offerId);
    const versions = await listVersions(offerId);
    offer = { ...row, versions: versions.map(publicVersion) };
  }
  return { projects: projectsList, units, leads: leadList, offer };
}

function makeReference(): string {
  const d = new Date();
  const ym = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return `MH-OFR-${ym}-${randomBytes(2).toString("hex").toUpperCase()}`;
}

export async function createOffer(
  input: {
    title?: string;
    leadId?: number | null;
    projectId?: number | null;
    unitId?: number | null;
    customer?: Record<string, unknown>;
    unit?: Record<string, unknown>;
    terms?: OfferTermsInput;
    options?: { assets?: OfferAssets; design?: OfferDesign };
    conversation?: { role: string; content: string; at?: string }[];
  },
  user: SafeUser,
): Promise<SalesOffer> {
  let lead: typeof leads.$inferSelect | null = null;
  if (input.leadId) {
    const [row] = await db.select().from(leads).where(eq(leads.id, input.leadId)).limit(1);
    if (!row) throw new ApiError(400, "The selected lead does not exist");
    lead = row;
  }

  const projectId = input.projectId ?? lead?.projectId ?? null;
  let project: typeof projects.$inferSelect | null = null;
  if (projectId) {
    const [row] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!row) throw new ApiError(400, "The selected project does not exist");
    project = row;
  }

  let unitRow: typeof projectUnits.$inferSelect | null = null;
  if (input.unitId) {
    const [row] = await db.select().from(projectUnits).where(eq(projectUnits.id, input.unitId)).limit(1);
    if (!row) throw new ApiError(400, "The selected unit does not exist");
    if (projectId && row.projectId !== projectId) throw new ApiError(400, "The selected unit belongs to a different project");
    unitRow = row;
  }

  const customer: { name: string; email: string; phone: string; country: string } = {
    name: String(input.customer?.name ?? lead?.name ?? ""),
    email: String(input.customer?.email ?? lead?.email ?? ""),
    phone: String(input.customer?.phone ?? lead?.phone ?? ""),
    country: String(input.customer?.country ?? lead?.country ?? ""),
  };

  const unit: Record<string, unknown> = {
    unitNo: unitRow?.unitNo ?? "",
    type: unitRow?.unitType ?? "",
    bedrooms: unitRow?.bedrooms ?? "",
    area: unitRow?.area ?? "",
    areaUnit: unitRow?.areaUnit ?? "",
    floor: unitRow?.floor ?? "",
    view: unitRow?.view ?? "",
    price: unitRow?.price ?? "",
  };
  for (const [key, value] of Object.entries(input.unit ?? {})) if (value !== undefined) unit[key] = value;

  const currency = (input.terms?.currency || unitRow?.currency || project?.currency || "AED").toUpperCase();
  const unitPrice = input.terms?.unitPrice ?? unitRow?.price ?? project?.price ?? "";
  const terms: OfferTermsInput = input.terms ?? { currency, unitPrice, plans: [] };
  const basePlan = terms.plans ?? [];
  if (!input.terms) terms.currency = currency;

  const options = {
    assets: { ...DEFAULT_ASSETS, ...(input.options?.assets ?? {}) },
    design: { ...DEFAULT_DESIGN, ...(input.options?.design ?? {}) },
  };

  const reference = makeReference();
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const [row] = await db
        .insert(salesOffers)
        .values({
          reference: attempt === 0 ? reference : makeReference(),
          leadId: input.leadId ?? null,
          projectId,
          unitId: unitRow?.id ?? null,
          status: basePlan.length ? "draft" : "needs_info",
          title: input.title?.trim() || (project ? `${project.name}${unit.unitNo ? ` — Unit ${unit.unitNo}` : ""}` : "Sales offer"),
          customer,
          unit,
          terms: terms as unknown as Record<string, unknown>,
          options: options as unknown as Record<string, unknown>,
          conversation: { entries: input.conversation ?? [] },
          createdBy: user.id,
          updatedBy: user.id,
        })
        .returning();
      await audit({ user, action: "sales_offer.created", entity: "sales_offers", entityId: row.id, metadata: { reference: row.reference, leadId: row.leadId, projectId: row.projectId } });
      return row;
    } catch (err) {
      lastError = err;
      if ((err as { code?: string }).code !== "23505") throw err;
    }
  }
  throw lastError;
}

export async function updateOffer(
  id: number,
  input: {
    title?: string;
    leadId?: number | null;
    projectId?: number | null;
    unitId?: number | null;
    customer?: Record<string, unknown>;
    unit?: Record<string, unknown>;
    terms?: OfferTermsInput;
    options?: { assets?: OfferAssets; design?: OfferDesign };
    conversation?: { role: string; content: string; at?: string }[];
  },
  user: SafeUser,
): Promise<SalesOffer> {
  const existing = await getOfferOrThrow(id);
  if (existing.status === "approved") throw new ApiError(409, "Approved offers are immutable. Use Revise to create a new draft — the approved PDF stays untouched.");
  if (existing.status === "archived") throw new ApiError(409, "Archived offers cannot be edited.");

  const projectId = input.projectId !== undefined ? input.projectId : existing.projectId;
  if (projectId) {
    const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!p) throw new ApiError(400, "The selected project does not exist");
  }
  const unitId = input.unitId !== undefined ? input.unitId : existing.unitId;
  if (unitId) {
    const [u] = await db.select().from(projectUnits).where(eq(projectUnits.id, unitId)).limit(1);
    if (!u) throw new ApiError(400, "The selected unit does not exist");
    if (projectId && u.projectId !== projectId) throw new ApiError(400, "The selected unit belongs to a different project");
  }

  const [row] = await db
    .update(salesOffers)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.leadId !== undefined ? { leadId: input.leadId } : {}),
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.unitId !== undefined ? { unitId: input.unitId } : {}),
      ...(input.customer !== undefined ? { customer: input.customer } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.terms !== undefined ? { terms: input.terms as unknown as Record<string, unknown> } : {}),
      ...(input.options !== undefined ? { options: input.options as unknown as Record<string, unknown> } : {}),
      ...(input.conversation !== undefined ? { conversation: { entries: input.conversation } } : {}),
      updatedBy: user.id,
      updatedAt: new Date(),
    })
    .where(eq(salesOffers.id, id))
    .returning();
  await audit({ user, action: "sales_offer.updated", entity: "sales_offers", entityId: id, metadata: { changed: Object.keys(input) } });
  return row;
}

function asTerms(raw: unknown): OfferTermsInput {
  const value = (raw ?? {}) as Partial<OfferTermsInput>;
  return {
    currency: typeof value.currency === "string" ? value.currency : "AED",
    unitPrice: typeof value.unitPrice === "number" || typeof value.unitPrice === "string" ? value.unitPrice : "",
    plans: Array.isArray(value.plans) ? value.plans : [],
    fees: Array.isArray(value.fees) ? value.fees : [],
    vatPct: value.vatPct ?? null,
    rounding: value.rounding,
    paymentStartDate: value.paymentStartDate ?? null,
    handoverDate: value.handoverDate ?? null,
    notes: value.notes,
  };
}

export function asOptions(raw: unknown): { assets: OfferAssets; design: OfferDesign } {
  const value = (raw ?? {}) as { assets?: Partial<OfferAssets>; design?: Partial<OfferDesign> };
  return {
    assets: { ...DEFAULT_ASSETS, ...(value.assets ?? {}) },
    design: { ...DEFAULT_DESIGN, ...(value.design ?? {}) },
  };
}

export async function snapshotFor(offer: SalesOffer, settings: SiteSettings): Promise<OfferSnapshotInput> {
  let project: typeof projects.$inferSelect | null = null;
  if (offer.projectId) {
    const [row] = await db.select().from(projects).where(eq(projects.id, offer.projectId)).limit(1);
    project = row ?? null;
  }
  let unitRow: typeof projectUnits.$inferSelect | null = null;
  if (offer.unitId) {
    const [row] = await db.select().from(projectUnits).where(eq(projectUnits.id, offer.unitId)).limit(1);
    unitRow = row ?? null;
  }
  const terms = asTerms(offer.terms);
  const options = asOptions(offer.options);
  const storedUnit = (offer.unit ?? {}) as Record<string, unknown>;
  const customer = (offer.customer ?? {}) as Record<string, unknown>;
  const currency = (terms.currency || unitRow?.currency || project?.currency || "AED").toUpperCase();

  return {
    reference: offer.reference,
    title: offer.title ?? undefined,
    date: new Date().toISOString().slice(0, 10),
    customer: {
      name: typeof customer.name === "string" ? customer.name : undefined,
      email: typeof customer.email === "string" ? customer.email : undefined,
      phone: typeof customer.phone === "string" ? customer.phone : undefined,
      country: typeof customer.country === "string" ? customer.country : undefined,
    },
    project: project
      ? {
          name: project.name,
          city: project.city ?? undefined,
          country: project.country ?? undefined,
          developer: project.developer ?? undefined,
          description: project.description ?? undefined,
          amenities: project.amenities ?? [],
        }
      : undefined,
    unit: {
      unitNo: String(storedUnit.unitNo || unitRow?.unitNo || ""),
      type: String(storedUnit.type || unitRow?.unitType || ""),
      bedrooms: String(storedUnit.bedrooms || unitRow?.bedrooms || ""),
      area: (storedUnit.area as number | string) ?? unitRow?.area ?? "",
      areaUnit: String(storedUnit.areaUnit || unitRow?.areaUnit || "sqft"),
      floor: String(storedUnit.floor || unitRow?.floor || ""),
      view: String(storedUnit.view || unitRow?.view || ""),
      price: (storedUnit.price as number | string) ?? unitRow?.price ?? "",
    },
    terms: { ...terms, currency },
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
}

export function offerCalculation(offer: SalesOffer): OfferCalculation {
  return calculateOffer({ terms: asTerms(offer.terms), unit: (offer.unit ?? {}) as import("./types").OfferUnitInput });
}

function safeSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "plan";
}

async function savePdf(offer: SalesOffer, batchId: string, version: number, filename: string, bytes: Uint8Array, user: SafeUser, snapshot: OfferSnapshotInput, calc: OfferCalculation) {
  const key = `offers/${offer.id}/v${version}-${batchId}-${safeSlug(filename.replace(/\.pdf$/i, ""))}.pdf`;
  let storageKey: string | null = null;
  let data: Buffer | null = null;
  if (r2IsConfigured()) {
    try {
      await putR2Object(key, bytes, "application/pdf");
      storageKey = key;
    } catch {
      storageKey = null;
    }
  }
  if (!storageKey) data = Buffer.from(bytes);
  const [row] = await db
    .insert(salesOfferVersions)
    .values({
      offerId: offer.id,
      version,
      batchId,
      status: "ready_for_review",
      snapshot: {
        ...snapshot,
        title: snapshot.title,
        checksum: calc.checksum,
      } as unknown as Record<string, unknown>,
      calculations: {
        checksum: calc.checksum,
        currency: calc.currency,
        unitPriceMinor: calc.unitPriceMinor,
        plans: calc.plans.map((p) => ({
          key: p.key,
          name: p.name,
          contractPriceMinor: p.contractPriceMinor,
          initialPaymentMinor: p.initialPaymentMinor,
          handoverPaymentMinor: p.handoverPaymentMinor,
          totalPayableMinor: p.totalPayableMinor,
          checksum: p.checksum,
        })),
        totals: calc.totals,
      } as unknown as Record<string, unknown>,
      validation: { readyForApproval: calc.readyForApproval, issues: calc.issues } as unknown as Record<string, unknown>,
      pdfStorageKey: storageKey,
      pdfFilename: filename,
      pdfMime: "application/pdf",
      pdfSize: bytes.byteLength,
      pdfData: data,
      createdBy: user.id,
    })
    .returning();
  return row;
}

export type GenerateResult = {
  batchId: string;
  versions: ReturnType<typeof publicVersion>[];
  validation: { ok: boolean; pages: number; missing: string[] }[];
  mode: "combined" | "separate";
};

export async function generateOffer(
  offer: SalesOffer,
  opts: { mode: "combined" | "separate"; planKeys?: string[]; origin: string; settings: SiteSettings },
  user: SafeUser,
): Promise<GenerateResult> {
  if (offer.status === "approved") throw new ApiError(409, "This offer is approved. Revise it to create a new draft instead of replacing an approved document.");
  if (offer.status === "archived") throw new ApiError(409, "Archived offers cannot generate new documents.");

  const snapshot = await snapshotFor(offer, opts.settings);
  const calc = calculateOffer({ terms: snapshot.terms, unit: snapshot.unit });
  const errors = calc.issues.filter((i) => i.severity === "error");
  if (errors.length) {
    const err = new ApiError(400, "Resolve the outstanding offer details before generating a PDF.");
    (err as ApiError & { issues?: unknown }).issues = errors;
    throw err;
  }
  if (!calc.readyForApproval) throw new ApiError(400, "The offer does not pass financial validation yet.");

  const selected = opts.planKeys?.length ? calc.plans.filter((p) => opts.planKeys!.includes(p.key)) : calc.plans;
  if (selected.length === 0) throw new ApiError(400, "Select at least one payment plan to render.");
  if (opts.mode === "separate" && selected.length > 1 && opts.planKeys && opts.planKeys.length !== selected.length) {
    throw new ApiError(400, "Select the plans to render separately.");
  }

  const batchId = `${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
  const [[{ maxVersion }]] = await Promise.all([db.select({ maxVersion: max(salesOfferVersions.version) }).from(salesOfferVersions).where(eq(salesOfferVersions.offerId, offer.id))]);
  let nextVersion = Number(maxVersion ?? 0) + 1;
  const results: { version: SalesOfferVersion; validation: { ok: boolean; pages: number; missing: string[] } }[] = [];

  if (opts.mode === "combined") {
    const bytes = await renderOfferPdf(snapshot, { ...calc, plans: selected }, { origin: opts.origin });
    const validation = await validateRenderedPdf(bytes, expectedPdfFigures(snapshot, { ...calc, plans: selected }));
    if (!validation.ok) {
      throw new ApiError(500, `Generated PDF failed figure verification (${validation.missing.slice(0, 3).join(", ")}). Nothing was saved.`);
    }
    const filename = `${offer.reference}-${safeSlug(snapshot.project?.name || "offer")}.pdf`;
    const version = await savePdf(offer, batchId, nextVersion, filename, bytes, user, snapshot, { ...calc, plans: selected });
    results.push({ version, validation });
    nextVersion += 1;
  } else {
    const files = await renderOfferPackage(snapshot, { ...calc, plans: selected }, { origin: opts.origin });
    for (const file of files) {
      const plan = selected.find((p) => p.key === file.key)!;
      const planCalc: OfferCalculation = { ...calc, plans: [plan] };
      const validation = await validateRenderedPdf(file.bytes, expectedPdfFigures(snapshot, planCalc));
      if (!validation.ok) {
        throw new ApiError(500, `Generated PDF for ${plan.name} failed figure verification. Nothing was saved.`);
      }
      const filename = `${offer.reference}-${safeSlug(plan.name)}.pdf`;
      const version = await savePdf(offer, batchId, nextVersion, filename, file.bytes, user, snapshot, planCalc);
      results.push({ version, validation });
      nextVersion += 1;
    }
  }

  const latest = results[results.length - 1]?.version;
  if (!latest) throw new ApiError(500, "No PDF was produced — nothing was saved.");
  await db
    .update(salesOffers)
    .set({ status: "ready_for_review", currentVersion: latest.version, updatedBy: user.id, updatedAt: new Date() })
    .where(eq(salesOffers.id, offer.id));

  await audit({
    user,
    action: "sales_offer.generated",
    entity: "sales_offers",
    entityId: offer.id,
    metadata: { batchId, mode: opts.mode, versions: results.map((r) => r.version.version), currency: calc.currency, totalPayable: calc.totals.totalPayableMinor },
  });

  return {
    batchId,
    versions: results.map((r) => publicVersion(r.version)),
    validation: results.map((r) => r.validation),
    mode: opts.mode,
  };
}

export async function approveOffer(offer: SalesOffer, batchId: string | undefined, user: SafeUser): Promise<{ batchId: string; approved: number }> {
  if (offer.status === "archived") throw new ApiError(409, "Restore this offer before approving it.");
  if (offer.status === "approved" && !batchId) throw new ApiError(409, "This offer is already approved.");
  const versions = await listVersions(offer.id);
  const newestBatch = versions[0]?.batchId ?? null;
  if (batchId && newestBatch && batchId !== newestBatch) {
    throw new ApiError(409, "A newer PDF batch exists. Approve the latest generated document so the client never receives a stale offer.");
  }
  const latestBatch = newestBatch;
  if (!latestBatch) throw new ApiError(400, "Generate a PDF before approving this offer.");
  const batch = versions.filter((v) => v.batchId === latestBatch);
  if (batch.length === 0) throw new ApiError(404, "That generated document batch was not found.");
  if (batch.some((v) => v.status !== "ready_for_review")) {
    throw new ApiError(409, "This batch is already approved or archived. Generate a new PDF to approve a change.");
  }

  const calc = offerCalculation(offer);
  if (!calc.readyForApproval) {
    const err = new ApiError(400, "The current offer no longer passes financial validation. Regenerate before approving.");
    (err as ApiError & { issues?: unknown }).issues = calc.issues.filter((i) => i.severity === "error");
    throw err;
  }
  for (const version of batch) {
    const storedChecksum = (version.calculations as { checksum?: string } | null)?.checksum;
    if (storedChecksum !== calc.checksum) {
      throw new ApiError(409, "The offer changed after these PDFs were generated. Regenerate, review, then approve — the old document stays untouched.");
    }
  }

  await db.update(salesOfferVersions).set({ status: "approved" }).where(and(eq(salesOfferVersions.offerId, offer.id), eq(salesOfferVersions.batchId, latestBatch)));
  const [updated] = await db
    .update(salesOffers)
    .set({ status: "approved", approvedBy: user.id, approvedAt: new Date(), updatedBy: user.id, updatedAt: new Date() })
    .where(eq(salesOffers.id, offer.id))
    .returning();
  await audit({ user, action: "sales_offer.approved", entity: "sales_offers", entityId: offer.id, metadata: { batchId: latestBatch, versions: batch.map((v) => v.version), totalPayable: calc.totals.totalPayableMinor } });
  void updated;
  return { batchId: latestBatch, approved: batch.length };
}

export async function reviseOffer(offer: SalesOffer, user: SafeUser): Promise<SalesOffer> {
  const [row] = await db
    .insert(salesOffers)
    .values({
      reference: `${offer.reference}-R${Date.now().toString(36).slice(-3).toUpperCase()}`,
      leadId: offer.leadId,
      projectId: offer.projectId,
      unitId: offer.unitId,
      revisedFrom: offer.id,
      status: "draft",
      title: offer.title,
      customer: offer.customer,
      unit: offer.unit,
      terms: offer.terms,
      options: offer.options,
      conversation: offer.conversation,
      createdBy: user.id,
      updatedBy: user.id,
    })
    .returning();
  await audit({ user, action: "sales_offer.revised", entity: "sales_offers", entityId: row.id, metadata: { from: offer.id, reference: row.reference } });
  return row;
}

export async function setOfferArchived(offer: SalesOffer, archived: boolean, user: SafeUser): Promise<SalesOffer> {
  const [row] = await db
    .update(salesOffers)
    .set({ status: archived ? "archived" : offer.approvedAt ? "approved" : "draft", updatedBy: user.id, updatedAt: new Date() })
    .where(eq(salesOffers.id, offer.id))
    .returning();
  await audit({ user, action: archived ? "sales_offer.archived" : "sales_offer.restored", entity: "sales_offers", entityId: offer.id });
  return row;
}

export async function deleteOffer(offer: SalesOffer, user: SafeUser): Promise<void> {
  if (offer.status === "approved") throw new ApiError(409, "Approved offers cannot be deleted — archive them instead to preserve the audit trail.");
  await db.delete(salesOffers).where(eq(salesOffers.id, offer.id));
  await audit({ user, action: "sales_offer.deleted", entity: "sales_offers", entityId: offer.id, metadata: { reference: offer.reference } });
}

export async function getVersionFile(offerId: number, versionId?: number): Promise<SalesOfferVersion | null> {
  if (versionId) {
    const [row] = await db.select().from(salesOfferVersions).where(and(eq(salesOfferVersions.offerId, offerId), eq(salesOfferVersions.id, versionId))).limit(1);
    return row ?? null;
  }
  const rows = await db.select().from(salesOfferVersions).where(eq(salesOfferVersions.offerId, offerId)).orderBy(desc(salesOfferVersions.version)).limit(1);
  return rows[0] ?? null;
}

export async function latestBatchFor(offerId: number): Promise<string | null> {
  const rows = await db.select({ batchId: salesOfferVersions.batchId }).from(salesOfferVersions).where(eq(salesOfferVersions.offerId, offerId)).orderBy(desc(salesOfferVersions.createdAt)).limit(1);
  return rows[0]?.batchId ?? null;
}

export async function versionsByIds(offerId: number, ids: number[]) {
  if (!ids.length) return [];
  return db.select().from(salesOfferVersions).where(and(eq(salesOfferVersions.offerId, offerId), inArray(salesOfferVersions.id, ids)));
}
