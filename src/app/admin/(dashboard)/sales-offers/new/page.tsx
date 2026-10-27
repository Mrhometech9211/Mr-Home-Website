import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { getCurrentUser, userCan } from "@/lib/auth";
import { getSettings } from "@/lib/content";
import { getOfferBuilderContext } from "@/lib/offers/service";
import { DEFAULT_ASSETS, DEFAULT_DESIGN } from "@/lib/offers/defaults";
import { SalesOfferBuilder } from "@/components/admin/SalesOfferBuilder";

export const dynamic = "force-dynamic";

export default async function NewSalesOfferPage({ searchParams }: { searchParams: Promise<{ leadId?: string }> }) {
  const user = await getCurrentUser();
  if (!userCan(user, "offers.read")) redirect("/admin");
  if (!userCan(user, "offers.write")) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-ink/8 bg-white p-6 text-center shadow-sm">
        <h1 className="text-[18px] font-semibold">Sales offers are read-only for your role</h1>
        <p className="mt-1 text-[13px] text-mist">You need the “Create / edit offers” permission to build an offer.</p>
        <Link href="/admin/sales-offers" className="mt-4 inline-flex h-9 items-center rounded-lg bg-brand px-4 text-[13px] text-white">Back to Sales Offers</Link>
      </div>
    );
  }

  const { leadId } = await searchParams;
  const numericLead = leadId ? parseInt(leadId, 10) : NaN;
  const [context, settings, leadRow] = await Promise.all([
    getOfferBuilderContext(),
    getSettings(),
    Number.isNaN(numericLead) ? Promise.resolve([]) : db.select().from(leads).where(eq(leads.id, numericLead)).limit(1),
  ]);

  const lead = leadRow[0]
    ? { id: leadRow[0].id, name: leadRow[0].name, email: leadRow[0].email, phone: leadRow[0].phone, country: leadRow[0].country, projectId: leadRow[0].projectId, budget: leadRow[0].budget, message: leadRow[0].message, createdAt: leadRow[0].createdAt.toISOString() }
    : null;

  return (
    <SalesOfferBuilder
      offer={null}
      initialLead={lead}
      projects={context.projects}
      units={context.units}
      leads={context.leads.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() }))}
      canWrite={userCan(user, "offers.write")}
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
  );
}
