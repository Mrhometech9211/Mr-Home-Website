import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, userCan } from "@/lib/auth";
import { getSettings } from "@/lib/content";
import { getOfferBuilderContext } from "@/lib/offers/service";
import { DEFAULT_ASSETS, DEFAULT_DESIGN } from "@/lib/offers/defaults";
import { SalesOfferBuilder, type SerializedOffer } from "@/components/admin/SalesOfferBuilder";
import type { OfferStatus } from "@/lib/offers/types";

export const dynamic = "force-dynamic";

export default async function SalesOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!userCan(user, "offers.read")) redirect("/admin");
  const { id } = await params;
  const offerId = parseInt(id, 10);
  if (Number.isNaN(offerId)) notFound();

  const [context, settings] = await Promise.all([getOfferBuilderContext(offerId), getSettings()]);
  if (!context.offer) notFound();

  const offer: SerializedOffer = {
    id: context.offer.id,
    reference: context.offer.reference,
    title: context.offer.title,
    leadId: context.offer.leadId,
    projectId: context.offer.projectId,
    unitId: context.offer.unitId,
    status: context.offer.status as OfferStatus,
    customer: context.offer.customer,
    unit: context.offer.unit,
    terms: context.offer.terms,
    options: context.offer.options,
    conversation: context.offer.conversation as SerializedOffer["conversation"],
    currentVersion: context.offer.currentVersion,
    approvedAt: context.offer.approvedAt ? context.offer.approvedAt.toISOString() : null,
    updatedAt: context.offer.updatedAt.toISOString(),
    versions: context.offer.versions.map((v) => ({ ...v, createdAt: typeof v.createdAt === "string" ? v.createdAt : v.createdAt.toISOString() })),
  };

  const canWrite = userCan(user, "offers.write");
  return (
    <div>
      {!canWrite && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900 ring-1 ring-amber-200">
          <span>Read-only: your role can view offers and download approved PDFs but cannot edit them.</span>
          <Link href="/admin/sales-offers" className="shrink-0 underline">Back to list</Link>
        </div>
      )}
      <SalesOfferBuilder
        offer={offer}
        projects={context.projects}
        units={context.units}
        leads={context.leads.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() }))}
        canWrite={canWrite}
        canApprove={userCan(user, "offers.approve")}
        canImport={userCan(user, "projects.write")}
        defaults={{
          design: {
            ...DEFAULT_DESIGN,
            contactPhone: settings.phone,
            contactEmail: settings.email,
            contactSite: settings.siteUrl || "www.mrhomerealestate.com",
            disclaimer: settings.disclaimer,
          },
          assets: { ...DEFAULT_ASSETS, mrHomeLogo: settings.logoDark || settings.logo },
        }}
      />
    </div>
  );
}
