import type { OfferFrequency, OfferPlanInput } from "./types";

/**
 * Down-payment tier presets.
 *
 * Everything here is integer basis points (1% = 100 bps), so a generated plan
 * always allocates exactly 100.00% and the deterministic engine in calc.ts can
 * reconcile it to the unit price without guessed rounding. Nothing is inferred
 * from the unit price here — the editor shows the real amounts only after the
 * engine has run, and the administrator can edit any figure afterwards.
 */

export const TIER_PRESETS = [10, 20, 30] as const;
export const TIER_KEY_PREFIX = "tier-";
export const DEFAULT_INSTALLMENT_MONTHS = 45;

export type TierPlanOptions = {
  /** Number of installments in the generated series (default 45). */
  installmentCount?: number;
  frequency?: Exclude<OfferFrequency, "one-off">;
  /**
   * Total percentage spread over the installment series. Defaults to 45% —
   * the common 1%-for-45-months developer pattern — capped at what is left
   * after the down payment.
   */
  installmentTotalPct?: number;
};

const MAX_BPS = 10000;

function toBps(percent: number): number {
  return Math.round(percent * 100);
}

function fromBps(bps: number): number {
  return Math.round(bps) / 100;
}

/**
 * Normalised tier key, e.g. 10 → "tier-10", 2.5 → "tier-2_5".
 *
 * The server validates plan identifiers against /^[a-zA-Z0-9_-]{1,40}$/, so a
 * decimal point is encoded as an underscore — otherwise fractional custom
 * tiers would be rejected when the offer is saved.
 */
export function tierKey(percent: number): string {
  return `${TIER_KEY_PREFIX}${String(fromBps(toBps(percent))).replace(".", "_")}`;
}

/** Read the percentage back out of a generated plan key, or null. */
export function tierPercentFromKey(key: string): number | null {
  if (!key.startsWith(TIER_KEY_PREFIX)) return null;
  const value = Number(key.slice(TIER_KEY_PREFIX.length).replace("_", "."));
  return Number.isFinite(value) && value > 0 && value < 100 ? value : null;
}

export function tierPlanName(percent: number, months: number): string {
  return `${fromBps(toBps(percent))}% down · ${months} mo`;
}

/**
 * Build one tier plan from a down-payment percentage.
 *
 * - down payment: exactly the requested percentage;
 * - installments: an equal series whose per-payment percentage is a whole
 *   number of basis points, so `value × count` lands on an exact total;
 * - handover: the remainder, so the three parts always sum to 100%.
 *
 * Throws RangeError for percentages that cannot form a plan.
 */
export function buildTierPlan(index: number, downPaymentPct: number, options: TierPlanOptions = {}): OfferPlanInput {
  const downBps = toBps(downPaymentPct);
  if (!Number.isFinite(downPaymentPct) || downBps <= 0 || downBps >= MAX_BPS) {
    throw new RangeError("Down payment must be between 0.01% and 99.99%.");
  }

  const count = Math.max(1, Math.min(600, Math.trunc(options.installmentCount ?? DEFAULT_INSTALLMENT_MONTHS)));
  const frequency = options.frequency ?? "monthly";
  const requestedTotalBps = options.installmentTotalPct == null ? 4500 : toBps(options.installmentTotalPct);
  const remainingBps = MAX_BPS - downBps;
  const installmentTotalBps = Math.max(0, Math.min(requestedTotalBps, remainingBps));

  const components: OfferPlanInput["components"] = [
    { id: `tier-${index}-down`, label: "Down payment", timing: "downPayment", type: "percent", value: fromBps(downBps) },
  ];

  let allocatedBps = downBps;
  // Whole basis points per payment keep the schedule exact; any residue is
  // carried by the handover line instead of being silently rounded away.
  const perPaymentBps = Math.floor(installmentTotalBps / count);
  if (perPaymentBps >= 1) {
    components.push({
      id: `tier-${index}-inst`,
      label: "Monthly installments",
      timing: "installments",
      type: "percent",
      value: fromBps(perPaymentBps),
      count,
      frequency,
    });
    allocatedBps += perPaymentBps * count;
  }

  const handoverBps = MAX_BPS - allocatedBps;
  if (handoverBps > 0) {
    components.push({
      id: `tier-${index}-hand`,
      label: "Handover payment",
      timing: "handover",
      type: "percent",
      value: fromBps(handoverBps),
    });
  }

  const percent = fromBps(downBps);
  return {
    key: tierKey(percent),
    name: tierPlanName(percent, count),
    badge: percent === 10 ? "Lowest entry" : percent === 30 ? "Fastest equity" : "",
    highlight: percent === 10,
    discount: { type: "none" },
    components,
  };
}

/** Total percentage a plan allocates, in basis points (whole numbers only). */
export function planAllocatedBps(plan: Pick<OfferPlanInput, "components">): number {
  let total = 0;
  for (const c of plan.components ?? []) {
    if (c.type !== "percent") return Number.NaN;
    const count = c.timing === "installments" || c.timing === "milestone" ? Math.max(1, Number(c.count) || 1) : 1;
    total += toBps(Number(c.value) || 0) * count;
  }
  return total;
}

/**
 * Rebuild the installment series of a tier with a different month count while
 * keeping its down payment. Used when the administrator changes the tenor.
 */
export function rebuildTierMonths(plan: OfferPlanInput, months: number): OfferPlanInput {
  const percent = tierPercentFromKey(plan.key);
  if (percent == null) return plan;
  const rebuilt = buildTierPlan(0, percent, {
    installmentCount: months,
    frequency: (plan.components.find((c) => c.timing === "installments")?.frequency as TierPlanOptions["frequency"]) ?? "monthly",
  });
  return {
    ...plan,
    name: tierPlanName(percent, Math.max(1, Math.min(600, Math.trunc(months)))),
    components: rebuilt.components.map((c) => ({ ...c, id: `${plan.key}-${c.timing}` })),
  };
}
