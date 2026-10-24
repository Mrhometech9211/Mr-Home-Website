import { redirect } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, initDb } from "@/db";
import { leads, markets, projects } from "@/db/schema";
import { getCurrentUser, userCan } from "@/lib/auth";
import { computeLeadScore } from "@/lib/lead-score";
import { KanbanBoard } from "@/components/admin/KanbanBoard";

export const dynamic = "force-dynamic";

export default async function LeadsPipelinePage() {
  const user = await getCurrentUser();
  if (!userCan(user, "leads.read")) redirect("/admin");
  if (!user) return null;

  await initDb();
  const rows = await db
    .select({
      id: leads.id,
      name: leads.name,
      email: leads.email,
      phone: leads.phone,
      city: leads.city,
      budget: leads.budget,
      interest: leads.interest,
      message: leads.message,
      status: leads.status,
      ip: leads.ip,
      score: leads.score,
      source: leads.source,
      marketId: leads.marketId,
      projectId: leads.projectId,
      assignedTo: leads.assignedTo,
      createdAt: leads.createdAt,
      marketName: markets.name,
      projectName: projects.name,
    })
    .from(leads)
    .leftJoin(markets, eq(leads.marketId, markets.id))
    .leftJoin(projects, eq(leads.projectId, projects.id))
    .where(eq(leads.archived, false))
    .orderBy(desc(leads.score), desc(leads.createdAt))
    .limit(300);

  const cards = rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    score: r.score || computeLeadScore(r),
  }));

  return <KanbanBoard cards={cards} canWrite={userCan(user, "leads.write")} currentUserId={user.id} />;
}
