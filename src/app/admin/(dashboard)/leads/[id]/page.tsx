import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser, userCan } from "@/lib/auth";
import { getSettings } from "@/lib/content";
import { LeadDetail } from "@/components/admin/LeadDetail";
import { ResourceForm } from "@/components/admin/ResourceForm";

export const dynamic = "force-dynamic";

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!userCan(user, "leads.read")) redirect("/admin");
  if (id === "new") {
    if (!userCan(user, "leads.write")) redirect("/admin/leads");
    return <div className="mx-auto max-w-5xl"><ResourceForm resourceKey="leads" id="new" canWrite /></div>;
  }
  const numeric = parseInt(id, 10);
  if (Number.isNaN(numeric)) notFound();
  const [settings, staff] = await Promise.all([getSettings(), db.select({ id: users.id, name: users.name }).from(users).where(eq(users.active, true))]);
  return <LeadDetail id={numeric} canWrite={userCan(user, "leads.write")} canCreateOffer={userCan(user, "offers.write")} whatsappTemplate={`Hello {{name}}, this is ${settings.brandName}. Thank you for your inquiry — how can we help with your property search?`} users={staff} />;
}
