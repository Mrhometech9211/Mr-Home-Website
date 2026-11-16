import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { MarketMetricWithMarket } from "@/lib/content";

function formatValue(m: MarketMetricWithMarket) {
  const n = Number(m.value);
  if (!Number.isFinite(n)) return m.value;
  return n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

function unitLabel(m: MarketMetricWithMarket) {
  return m.unit?.trim() || m.currency?.trim() || "";
}

function checkedLabel(value: Date | string) {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Public comparison dashboard. It renders only published rows and refuses to
 * display a projection that lacks assumptions + source. Charts appear only
 * when at least two markets share the same metric/period.
 */
export function MarketMetricsDashboard({ metrics }: { metrics: MarketMetricWithMarket[] }) {
  const usable = metrics.filter((m) => m.kind !== "projection" || (m.assumptions?.trim() && m.sourceUrl?.trim()));
  if (usable.length === 0) return null;

  const historical = usable.filter((m) => m.kind !== "projection");
  const projections = usable.filter((m) => m.kind === "projection");

  const groups = new Map<string, MarketMetricWithMarket[]>();
  for (const m of historical) {
    const key = `${m.metric.trim().toLowerCase()}|${m.period.trim().toLowerCase()}|${unitLabel(m).toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  const chartGroups = [...groups.values()].filter((g) => new Set(g.map((m) => m.marketId)).size >= 2);

  return (
    <section className="border-t border-ink/8 bg-ivory-deep/40 py-20" aria-labelledby="market-comparison">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
        <p className="eyebrow">Market Comparison</p>
        <h2 id="market-comparison" className="display mt-4 text-[clamp(1.8rem,3.4vw,2.6rem)] text-ink">Compare the numbers behind each market.</h2>
        <p className="mt-3 max-w-3xl text-[13.5px] leading-relaxed text-charcoal/75">
          Every figure below is entered and sourced by the MR.HOME team. Historical results and forecasts are shown separately; a projection is not a guaranteed return.
        </p>

        {chartGroups.length > 0 && (
          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            {chartGroups.map((group) => {
              const max = Math.max(...group.map((m) => Math.abs(Number(m.value)) || 0), 1);
              const first = group[0];
              return (
                <div key={`${first.metric}-${first.period}-${unitLabel(first)}`} className="rounded-2xl border border-ink/8 bg-white p-5 shadow-card">
                  <h3 className="text-[14px] font-semibold text-ink">{first.metric}</h3>
                  <p className="mt-1 text-[11.5px] text-mist">{first.period} · historical data · {unitLabel(first) || "value"}</p>
                  <div className="mt-4 space-y-3">
                    {group.map((m) => (
                      <div key={m.id}>
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="text-charcoal/80">{m.marketFlag} {m.marketName}{m.city ? ` · ${m.city}` : ""}</span>
                          <span className="font-medium tabular-nums text-ink">{formatValue(m)}{unitLabel(m) ? ` ${unitLabel(m)}` : ""}</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${m.marketName}: ${formatValue(m)} ${unitLabel(m)}`}>
                          <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(4, (Math.abs(Number(m.value)) / max) * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-10 space-y-8">
          {historical.length > 0 && <MetricTable title="Historical data" rows={historical} />}
          {projections.length > 0 && (
            <div>
              <MetricTable title="Forecasts / projections" rows={projections} />
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900">
                Projections are estimates based on the assumptions listed above. They are not guaranteed returns and should not be relied on as investment advice.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function MetricTable({ title, rows }: { title: string; rows: MarketMetricWithMarket[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink/8 bg-white shadow-card">
      <div className="border-b border-ink/8 px-5 py-4">
        <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead>
            <tr className="border-b border-ink/8 bg-slate-50/60">
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-mist">Market</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-mist">Metric</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-mist">Value</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-mist">Period</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-mist">Method</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-mist">Source & checked</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/6">
            {rows.map((m) => (
              <tr key={m.id} className="align-top">
                <td className="px-4 py-3.5 text-[13px] text-ink">
                  <Link href={`/markets/${m.marketSlug}`} className="font-medium hover:text-brand">{m.marketFlag} {m.marketName}</Link>
                  {m.city && <div className="text-[11.5px] text-mist">{m.city}</div>}
                </td>
                <td className="px-4 py-3.5 text-[13px] text-charcoal/80">
                  {m.metric}
                  {m.kind === "projection" && <div className="mt-1 inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-800">Forecast</div>}
                  {m.assumptions && <div className="mt-1 max-w-xs text-[11.5px] text-charcoal/60"><strong className="font-medium">Assumptions:</strong> {m.assumptions}</div>}
                  {m.limitations && <div className="mt-1 max-w-xs text-[11.5px] text-charcoal/60"><strong className="font-medium">Limitations:</strong> {m.limitations}</div>}
                </td>
                <td className="px-4 py-3.5 text-[13px] font-medium tabular-nums text-ink">{formatValue(m)}{unitLabel(m) ? ` ${unitLabel(m)}` : ""}</td>
                <td className="px-4 py-3.5 text-[12.5px] text-charcoal/75">{m.period}</td>
                <td className="px-4 py-3.5 text-[12.5px] text-charcoal/70">{m.method || "—"}</td>
                <td className="px-4 py-3.5 text-[12.5px]">
                  {m.sourceUrl ? (
                    <a href={m.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-brand hover:underline">
                      Source <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-mist">No source</span>
                  )}
                  <div className="mt-1 text-[11.5px] text-mist">Checked {checkedLabel(m.checkedAt)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
