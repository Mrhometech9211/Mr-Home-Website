import "server-only";
import { and, asc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { leadActivities, leadTasks, leads, users } from "@/db/schema";
import { computeLeadScore } from "./lead-score";
import { getSettings } from "./content";
import type { Automations } from "./settings-types";

/**
 * Admin → Settings → Automation engine.
 *
 * Runs entirely on the server, is best-effort (a failed rule can never break a
 * lead submission) and only touches data the admin already owns. Rules:
 *   • autoScore      — rate every new lead 0–100 for inbox prioritisation.
 *   • autoAssign     — give the lead to the least-loaded built-in teammate who
 *                      can work leads (fair round-robin without a counter table).
 *   • autoFollowUp   — create a "First follow-up" task due in N hours.
 *   • staleArchive   — archive NEW / CONTACTED leads untouched for N days.
 */

export type LeadAutomationResult = {
  score?: number;
  assignedTo?: number | null;
  assignedToName?: string | null;
  taskCreated?: boolean;
};

/** Built-in roles that hold `leads.write` (see permissions.ts). */
const LEAD_ROLES = ["SUPER_ADMIN", "ADMIN", "EDITOR"] as const;

async function leastLoadedUser(): Promise<{ id: number; name: string } | null> {
  // Open = not archived and still in a working pipeline stage.
  const openCount = sql<number>`count(${leads.id})::int`;
  const rows = await db
    .select({ id: users.id, name: users.name, open: openCount })
    .from(users)
    .leftJoin(
      leads,
      and(
        eq(leads.assignedTo, users.id),
        eq(leads.archived, false),
        inArray(leads.status, ["NEW", "CONTACTED", "QUALIFIED"]),
      ),
    )
    .where(inArray(users.role, [...LEAD_ROLES]))
    .groupBy(users.id, users.name)
    .orderBy(asc(openCount), asc(users.id))
    .limit(1);
  return rows[0] ? { id: rows[0].id, name: rows[0].name } : null;
}

/** Applies the enabled rules to one freshly created lead. Never throws. */
export async function runNewLeadAutomations(leadId: number): Promise<LeadAutomationResult> {
  const out: LeadAutomationResult = {};
  try {
    const settings = await getSettings();
    const rules: Automations = settings.automations;
    const [lead] = await db
      .select({
        id: leads.id,
        status: leads.status,
        budget: leads.budget,
        city: leads.city,
        marketId: leads.marketId,
        projectId: leads.projectId,
        phone: leads.phone,
        whatsapp: leads.whatsapp,
        message: leads.message,
        source: leads.source,
        campaign: leads.campaign,
        assignedTo: leads.assignedTo,
      })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);
    if (!lead) return out;

    if (rules.autoScore) {
      const score = computeLeadScore(lead);
      await db.update(leads).set({ score }).where(eq(leads.id, leadId));
      out.score = score;
    }

    let owner = lead.assignedTo;
    if (rules.autoAssign && !owner) {
      const pick = await leastLoadedUser();
      if (pick) {
        owner = pick.id;
        out.assignedTo = pick.id;
        out.assignedToName = pick.name;
        await db.update(leads).set({ assignedTo: pick.id, updatedAt: new Date() }).where(eq(leads.id, leadId));
        await db.insert(leadActivities).values({
          leadId,
          type: "assigned",
          description: `Automatically assigned to ${pick.name} (least active pipeline)`,
        });
      }
    }

    if (rules.autoFollowUp) {
      const hours = Math.max(1, Math.min(720, rules.followUpHours || 24));
      const dueAt = new Date(Date.now() + hours * 60 * 60 * 1000);
      await db.insert(leadTasks).values({
        leadId,
        title: `First follow-up — contact within ${hours}h`,
        dueAt,
        assignedTo: owner ?? null,
      });
      out.taskCreated = true;
    }
  } catch (err) {
    // Automation is an enhancement: log and let the lead succeed anyway.
    console.error("[automations] new-lead rules failed", err);
  }
  return out;
}

/** Archives leads stale beyond the configured window. Returns how many changed. */
export async function runStaleLeadArchive(): Promise<{ archived: number; days: number }> {
  const settings = await getSettings();
  const days = Math.max(3, Math.min(365, settings.automations.staleArchiveDays || 45));
  if (!settings.automations.staleArchive) return { archived: 0, days };
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.archived, false), inArray(leads.status, ["NEW", "CONTACTED"]), lt(leads.updatedAt, cutoff)))
    .limit(500);
  if (!rows.length) return { archived: 0, days };
  const ids = rows.map((r) => r.id);
  await db.update(leads).set({ archived: true, updatedAt: new Date() }).where(inArray(leads.id, ids));
  await db.insert(leadActivities).values(
    ids.map((id) => ({
      leadId: id,
      type: "archived",
      description: `Archived automatically after ${days} days without activity`,
    })),
  );
  return { archived: ids.length, days };
}

/** Counts the current automation backlog for the settings screen. */
export async function automationStats() {
  const settings = await getSettings();
  const rules = settings.automations;
  const [unassigned] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(eq(leads.archived, false), isNull(leads.assignedTo)));
  const days = Math.max(3, Math.min(365, rules.staleArchiveDays || 45));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [stale] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(eq(leads.archived, false), inArray(leads.status, ["NEW", "CONTACTED"]), lt(leads.updatedAt, cutoff)));
  const [team] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(inArray(users.role, [...LEAD_ROLES]));
  return { unassigned: unassigned?.count ?? 0, stale: stale?.count ?? 0, teamSize: team?.count ?? 0, rules, staleDays: days };
}
