import { BadgeCheck, CalendarCheck2, CircleHelp, FileCheck2, ShieldCheck } from "lucide-react";
import type { ProjectWithMarket } from "@/lib/content";
import { STATUS_LABELS } from "@/lib/utils";

function fmtDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Public provenance panel. It only repeats what the admin recorded; where a
 * fact has no check date it says "Unconfirmed" instead of implying verification.
 */
export function ProjectVerification({ project }: { project: ProjectWithMarket }) {
  const checks = project.verificationChecks ?? [];
  const hasAny =
    project.price != null ||
    checks.length > 0 ||
    !!project.priceCheckedAt ||
    !!project.verificationCheckedAt ||
    !!project.paymentPlan ||
    !!project.handoverSource ||
    !!project.developerApproval ||
    !!project.projectApproval;
  if (!hasAny) return null;

  const priceChecked = fmtDate(project.priceCheckedAt);
  const verifiedOn = fmtDate(project.verificationCheckedAt);
  const rows: { label: string; value: string; ok: boolean; note?: string }[] = [];

  if (project.price != null) {
    rows.push({
      label: "Starting price",
      value: priceChecked ? `Last checked ${priceChecked}` : "Unconfirmed — ask your advisor for the current price",
      ok: !!priceChecked,
    });
  }
  rows.push({
    label: "Availability",
    value: `${STATUS_LABELS[project.status] ?? project.status}${verifiedOn ? ` · checked ${verifiedOn}` : " · Unconfirmed"}`,
    ok: !!verifiedOn,
  });
  if (project.paymentPlan) {
    rows.push({
      label: "Payment plan",
      value: project.paymentPlan,
      ok: !!project.verificationCheckedAt,
      note: project.paymentPlanSource ? `Source: ${project.paymentPlanSource}` : "Source not recorded",
    });
  }
  if (project.handover) {
    rows.push({
      label: "Handover",
      value: project.handover,
      ok: !!project.handoverSource,
      note: project.handoverSource ? `Source: ${project.handoverSource}` : "Source not recorded",
    });
  }
  if (project.developerApproval) rows.push({ label: "Developer approval", value: project.developerApproval, ok: true });
  if (project.projectApproval) rows.push({ label: "Project approval", value: project.projectApproval, ok: true });

  return (
    <section className="mx-auto mt-10 max-w-[1400px] px-4 sm:px-6" aria-labelledby="listing-verification">
      <div className="rounded-[26px] border border-ink/8 bg-white p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Listing facts</p>
            <h2 id="listing-verification" className="mt-2 text-[20px] font-semibold tracking-tight text-ink">What we have confirmed</h2>
            <p className="mt-1 max-w-2xl text-[12.5px] text-charcoal/70">
              Sourced from the developer and our own checks. Items without a check date are shown as unconfirmed.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 text-[11.5px] text-charcoal/70">
            <ShieldCheck className="h-3.5 w-3.5 text-brand" />
            {verifiedOn ? `Verified ${verifiedOn}` : "Not yet verified"}
          </div>
        </div>

        <dl className="mt-5 grid gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <div key={r.label} className="rounded-2xl border border-ink/8 px-4 py-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-mist">
                {r.ok ? <BadgeCheck className="h-3.5 w-3.5 text-brand" /> : <CircleHelp className="h-3.5 w-3.5 text-amber-600" />}
                {r.label}
              </div>
              <dd className="mt-1 whitespace-pre-line text-[13.5px] text-ink">{r.value}</dd>
              {r.note && <dd className="mt-1 text-[11.5px] text-mist">{r.note}</dd>}
            </div>
          ))}
        </dl>

        {checks.length > 0 && (
          <div className="mt-5">
            <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-mist"><FileCheck2 className="h-3.5 w-3.5" /> Checks completed</h3>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {checks.map((c, i) => (
                <li key={`${c.check}-${i}`} className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-[12.5px] text-charcoal/80">
                  <span className="font-medium text-ink">{c.check}</span> — {c.status}
                  {c.source ? <span className="text-mist"> · {c.source}</span> : null}
                  {c.checkedAt ? <span className="text-mist"> · {c.checkedAt}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(project.verificationSource || project.verificationReviewer || verifiedOn) && (
          <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink/6 pt-4 text-[11.5px] text-mist">
            <span className="inline-flex items-center gap-1"><CalendarCheck2 className="h-3.5 w-3.5" /> {verifiedOn ? `Checked ${verifiedOn}` : "No verification date"}</span>
            {project.verificationReviewer && <span>Reviewer: {project.verificationReviewer}</span>}
            {project.verificationSource && <span>Source: {project.verificationSource}</span>}
          </p>
        )}
      </div>
    </section>
  );
}
