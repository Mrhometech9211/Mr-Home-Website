import Link from "next/link";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, leadActivities, leadTasks, leads, markets, projects, users } from "@/db/schema";
import { Badge } from "@/components/admin/ui";
import { formatDateTime, statusTone } from "@/lib/utils";
import { TrendChart } from "@/components/admin/TrendChart";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const active = eq(leads.archived, false);
  const [byStatus, total, unassigned, byMarket, byProject, bySource, daily, recent, followUps, recentAudit, projectCount, marketCount] = await Promise.all([
    db.select({ status: leads.status, count: sql<number>`count(*)::int` }).from(leads).where(active).groupBy(leads.status),
    db.select({ count: sql<number>`count(*)::int` }).from(leads).where(active),
    db.select({ count: sql<number>`count(*)::int` }).from(leads).where(and(active, isNull(leads.assignedTo))),
    db.select({ name: markets.name, count: sql<number>`count(*)::int` }).from(leads).leftJoin(markets, eq(leads.marketId, markets.id)).where(active).groupBy(markets.name).orderBy(desc(sql`count(*)`)).limit(10),
    db.select({ name: projects.name, count: sql<number>`count(*)::int` }).from(leads).leftJoin(projects, eq(leads.projectId, projects.id)).where(active).groupBy(projects.name).orderBy(desc(sql`count(*)`)).limit(8),
    db.select({ name: leads.source, count: sql<number>`count(*)::int` }).from(leads).where(active).groupBy(leads.source).orderBy(desc(sql`count(*)`)),
    // Zero-filled 30-day series computed entirely in the database (no client clock).
    db.execute<{ day: string; count: number }>(sql`select to_char(gs.day, 'YYYY-MM-DD') as day, coalesce(count(l.id), 0)::int as count from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') as gs(day) left join ${leads} l on l.created_at >= gs.day and l.created_at < gs.day + interval '1 day' and l.archived = false group by gs.day order by gs.day`),
    db.select({ id: leadActivities.id, leadId: leadActivities.leadId, description: leadActivities.description, userName: leadActivities.userName, createdAt: leadActivities.createdAt, leadName: leads.name }).from(leadActivities).leftJoin(leads, eq(leadActivities.leadId, leads.id)).orderBy(desc(leadActivities.createdAt)).limit(10),
    db.select({ id: leadTasks.id, title: leadTasks.title, dueAt: leadTasks.dueAt, leadId: leadTasks.leadId, leadName: leads.name, assignee: users.name, overdue: sql<boolean>`${leadTasks.dueAt} < now()` }).from(leadTasks).leftJoin(leads, eq(leadTasks.leadId, leads.id)).leftJoin(users, eq(leadTasks.assignedTo, users.id)).where(eq(leadTasks.done, false)).orderBy(leadTasks.dueAt).limit(8),
    db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(6),
    db.select({ count: sql<number>`count(*)::int` }).from(projects).where(eq(projects.published, true)),
    db.select({ count: sql<number>`count(*)::int` }).from(markets).where(eq(markets.published, true)),
  ]);
  // db.execute returns { rows } for node-postgres-compatible drivers
  const trendRows = (daily as unknown as { rows: { day: string; count: number }[] }).rows;
  const s = Object.fromEntries(byStatus.map((r) => [r.status, r.count]));
  const totalLeads = total[0].count;
  // Conversion = Closed Deal share of all active leads (Closed Deals are deals that actually closed).
  const closedDeals = s.CLOSED_DEAL ?? 0;
  const conversion = totalLeads ? Math.round(((closedDeals + (s.CONVERTED ?? 0)) / totalLeads) * 100) : 0;
  const weekly = trendRows.slice(-7).reduce((a, b) => a + Number(b.count), 0);
  const monthly = trendRows.reduce((a, b) => a + Number(b.count), 0);
  const today = trendRows[trendRows.length - 1]?.count ?? 0;

  const stat = (label: string, value: number | string, href?: string, tone?: string) => (
    <Link key={label} href={href ?? "/admin/leads"} className="rounded-2xl border border-ink/8 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-mist">{label}</div>
      <div className={`mt-1 text-[26px] font-semibold tracking-tight ${tone ?? "text-ink"}`}>{value}</div>
    </Link>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-[22px] font-semibold tracking-tight">Dashboard</h1><p className="text-[13px] text-mist">CRM performance and website activity — live from the database.</p></div>
        <div className="flex gap-2"><Link href="/admin/leads/new" className="rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-deep">Add lead</Link><Link href="/admin/projects/new" className="rounded-lg border border-ink/10 bg-white px-4 py-2 text-[13px] font-medium text-ink hover:border-ink/30">Add project</Link></div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-9">
        {stat("Total leads", totalLeads)}
        {stat("New", s.NEW ?? 0, "/admin/leads?status=NEW", "text-sky-600")}
        {stat("Contacted", s.CONTACTED ?? 0, "/admin/leads?status=CONTACTED", "text-amber-600")}
        {stat("Qualified", s.QUALIFIED ?? 0, "/admin/leads?status=QUALIFIED", "text-emerald-600")}
        {stat("Converted", s.CONVERTED ?? 0, "/admin/leads?status=CONVERTED")}
        {stat("Closed Deal", closedDeals, "/admin/leads?status=CLOSED_DEAL", "text-emerald-600")}
        {stat("Lost", s.LOST ?? 0, "/admin/leads?status=LOST", "text-red-600")}
        {stat("Conversion", `${conversion}%`)}
        {stat("Unassigned", unassigned[0].count, "/admin/leads", unassigned[0].count ? "text-amber-600" : undefined)}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-ink/8 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between"><h2 className="text-[14px] font-semibold">Lead trends</h2><div className="flex gap-4 text-[12px] text-mist"><span>Today <b className="text-ink">{today}</b></span><span>7 days <b className="text-ink">{weekly}</b></span><span>30 days <b className="text-ink">{monthly}</b></span></div></div>
          <TrendChart data={trendRows} days={30} />
        </section>
        <section className="rounded-2xl border border-ink/8 bg-white p-5 shadow-sm">
          <h2 className="text-[14px] font-semibold">Website</h2>
          <dl className="mt-3 space-y-2 text-[13px]">
            <div className="flex justify-between"><dt className="text-charcoal/70">Published projects</dt><dd className="font-semibold">{projectCount[0].count}</dd></div>
            <div className="flex justify-between"><dt className="text-charcoal/70">Published markets</dt><dd className="font-semibold">{marketCount[0].count}</dd></div>
            <div className="flex justify-between"><dt className="text-charcoal/70">Open follow-ups</dt><dd className="font-semibold">{followUps.length}</dd></div>
          </dl>
          <h3 className="mt-5 text-[12px] font-semibold uppercase tracking-wider text-mist">Leads by source</h3>
          <ul className="mt-2 space-y-1.5 text-[13px]">{bySource.map((r) => <li key={r.name ?? "—"} className="flex justify-between"><span>{r.name ?? "—"}</span><span className="font-semibold">{r.count}</span></li>)}</ul>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-ink/8 bg-white p-5 shadow-sm">
          <h2 className="text-[14px] font-semibold">Leads by market</h2>
          <ul className="mt-3 space-y-2">{byMarket.map((r) => { const pct = totalLeads ? Math.round((r.count / totalLeads) * 100) : 0; return <li key={r.name ?? "—"} className="text-[13px]"><div className="flex justify-between"><span>{r.name ?? "Unspecified"}</span><span className="font-semibold">{r.count}</span></div><div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} /></div></li>; })}{byMarket.length === 0 && <li className="text-[13px] text-mist">No leads yet.</li>}</ul>
        </section>
        <section className="rounded-2xl border border-ink/8 bg-white p-5 shadow-sm">
          <h2 className="text-[14px] font-semibold">Leads by project</h2>
          <ul className="mt-3 space-y-1.5 text-[13px]">{byProject.map((r) => <li key={r.name ?? "—"} className="flex justify-between"><span className="truncate pr-3">{r.name ?? "No project"}</span><span className="font-semibold">{r.count}</span></li>)}{byProject.length === 0 && <li className="text-mist">No leads yet.</li>}</ul>
        </section>
        <section className="rounded-2xl border border-ink/8 bg-white p-5 shadow-sm">
          <h2 className="text-[14px] font-semibold">Follow-ups due</h2>
          <ul className="mt-3 space-y-2 text-[13px]">
            {followUps.map((t) => <li key={t.id} className={`rounded-lg border px-3 py-2 ${t.overdue ? "border-red-200 bg-red-50" : "border-ink/8"}`}><Link href={`/admin/leads/${t.leadId}`} className="font-medium hover:text-brand">{t.title}</Link><div className="text-[11.5px] text-mist">{t.leadName} · {t.dueAt ? formatDateTime(t.dueAt) : "No due date"}{t.assignee ? ` · ${t.assignee}` : ""}</div></li>)}
            {followUps.length === 0 && <li className="text-mist">Nothing scheduled.</li>}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-ink/8 bg-white p-5 shadow-sm">
          <h2 className="text-[14px] font-semibold">Recent CRM activity</h2>
          <ul className="mt-3 divide-y divide-ink/6 text-[13px]">{recent.map((a) => <li key={a.id} className="flex items-start justify-between gap-3 py-2"><div><Link href={`/admin/leads/${a.leadId}`} className="font-medium hover:text-brand">{a.leadName ?? `Lead #${a.leadId}`}</Link><div className="text-charcoal/70">{a.description}{a.userName ? ` — ${a.userName}` : ""}</div></div><time className="shrink-0 text-[11.5px] text-mist">{formatDateTime(a.createdAt)}</time></li>)}{recent.length === 0 && <li className="py-2 text-mist">No activity yet.</li>}</ul>
        </section>
        <section className="rounded-2xl border border-ink/8 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><h2 className="text-[14px] font-semibold">Audit trail</h2><Link href="/admin/audit" className="text-[12px] text-brand hover:underline">View all</Link></div>
          <ul className="mt-3 divide-y divide-ink/6 text-[13px]">{recentAudit.map((a) => <li key={a.id} className="flex items-center justify-between gap-3 py-2"><div><Badge tone="neutral">{a.action}</Badge> <span className="text-charcoal/70">{a.entity}{a.entityId ? ` #${a.entityId}` : ""} · {a.userEmail ?? "system"}</span>{a.ip && <span className="ml-2 font-mono text-[11px] text-mist" title="Request IP">{a.ip}</span>}</div><time className="shrink-0 text-[11.5px] text-mist">{formatDateTime(a.createdAt)}</time></li>)}</ul>
        </section>
      </div>
      <div className="flex flex-wrap gap-2 text-[12px]">{Object.entries(s).map(([k, v]) => <Badge key={k} tone={statusTone(k)}>{k}: {v}</Badge>)}</div>
    </div>
  );
}
