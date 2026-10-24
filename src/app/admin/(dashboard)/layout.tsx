import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { getCurrentUser, hasAnyUsers } from "@/lib/auth";
import { ROLE_PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/content";
import { AdminShell } from "@/components/admin/AdminShell";
import { LeadNotifier } from "@/components/admin/LeadNotifier";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    if (!(await hasAnyUsers())) redirect("/admin/setup");
    redirect("/admin/login");
  }
  const [settings, [{ count }]] = await Promise.all([
    getSettings(),
    db.select({ count: sql<number>`count(*)::int` }).from(leads).where(and(eq(leads.status, "NEW"), eq(leads.archived, false))),
  ]);
  return (
    <AdminShell user={{ id: user.id, name: user.name, email: user.email, role: user.role }} permissions={user.role === "CUSTOM" ? user.effectivePermissions ?? [] : ROLE_PERMISSIONS[user.role] as unknown as string[]} brandName={settings.brandName} logo={settings.logo} newLeads={count}>
      <LeadNotifier />
      {children}
    </AdminShell>
  );
}
