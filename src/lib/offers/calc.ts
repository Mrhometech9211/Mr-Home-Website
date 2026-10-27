import { addMonthsUtc, applyPercent, currencyPrecision, fromMinor, stableHash, toBasisPoints, toMinor } from "./money";
import type {
  CalculatedComponent,
  OfferCalculation,
  OfferComponent,
  OfferFrequency,
  OfferPlanInput,
  OfferTermsInput,
  OfferUnitInput,
  PlanCalculation,
  ScheduleEntry,
  ValidationIssue,
} from "./types";

/**
 * Deterministic payment-plan engine.
 *
 * The AI never produces a financial figure: this module is the single source
 * of truth for discounts, fees, VAT, installment splits and totals. It never
 * fills an unspecified percentage, fee or discount — missing terms are
 * reported as validation errors instead.
 */

const FREQUENCY_MONTHS: Record<OfferFrequency, number> = { monthly: 1, quarterly: 3, annual: 12, "one-off": 0 };
const MAX_PLANS = 8;
const MAX_COMPONENTS = 40;

function safeText(v: unknown, max = 120): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function money(minor: number, precision: number) {
  return fromMinor(minor, precision);
}

function toleranceFor(components: number): number {
  // Percentage rounding can leave a few minor units; anything larger means the
  // plan genuinely does not allocate 100% and must not be auto-filled.
  return Math.max(2, components);
}

function isSeries(comp: OfferComponent): boolean {
  return comp.timing === "installments" || comp.timing === "milestone";
}

function computeSinglePlan(input: OfferPlanInput, terms: OfferTermsInput, contractMinor: number, listMinor: number, currency: string, precision: number, issues: ValidationIssue[]): PlanCalculation {
  const planKey = input.key || "plan";
  const path = (suffix: string) => `plans.${planKey}.${suffix}`;
  const components: CalculatedComponent[] = [];
  let percentBps = 0;
  let hasFixed = false;

  const rawComponents = Array.isArray(input.components) ? input.components : [];
  if (rawComponents.length === 0) {
    issues.push({ code: "plan.components.missing", path: path("components"), planKey, message: "Add at least one payment component (down payment, installments, handover).", severity: "error" });
  }
  if (rawComponents.length > MAX_COMPONENTS) {
    issues.push({ code: "plan.components.too_many", path: path("components"), planKey, message: `A plan can have at most ${MAX_COMPONENTS} components.`, severity: "error" });
  }

  for (const [index, comp] of rawComponents.entries()) {
    const label = safeText(comp.label, 90) || `Payment ${index + 1}`;
    const cPath = path(`components.${index}`);
    if (comp.type !== "percent" && comp.type !== "amount") {
      issues.push({ code: "component.type", path: cPath, planKey, message: `“${label}” must be a percentage or a fixed amount.`, severity: "error" });
      continue;
    }
    const value = Number(comp.value);
    if (!Number.isFinite(value) || value <= 0) {
      issues.push({ code: "component.value", path: cPath, planKey, message: `“${label}” needs a positive ${comp.type === "percent" ? "percentage" : "amount"}.`, severity: "error" });
      continue;
    }

    let count = 1;
    if (isSeries(comp)) {
      if (comp.count == null || !Number.isInteger(Number(comp.count)) || Number(comp.count) < 1) {
        issues.push({ code: "component.count", path: cPath, planKey, message: `“${label}” needs the number of installments.`, severity: "error" });
        continue;
      }
      count = Number(comp.count);
      if (count > 600) {
        issues.push({ code: "component.count.max", path: cPath, planKey, message: `“${label}” cannot exceed 600 installments.`, severity: "error" });
        continue;
      }
      if (comp.frequency !== "monthly" && comp.frequency !== "quarterly" && comp.frequency !== "annual") {
        issues.push({ code: "component.frequency", path: cPath, planKey, message: `“${label}” needs a payment frequency.`, severity: "error" });
        continue;
      }
    }

    let amountMinor: number;
    if (comp.type === "percent") {
      const bps = toBasisPoints(value);
      if (bps == null || bps <= 0 || bps > 10000) {
        issues.push({ code: "component.percent.range", path: cPath, planKey, message: `“${label}” must be between 0.01% and 100%.`, severity: "error" });
        continue;
      }
      // For a series, `value` is the PER-INSTALLMENT percentage (1% × 45
      // months = 45% of the price), which is how developers quote plans.
      const multiplier = isSeries(comp) ? count : 1;
      percentBps += bps * multiplier;
      amountMinor = applyPercent(contractMinor, bps / 100) * multiplier;
    } else {
      const fixed = toMinor(value, precision);
      if (fixed == null || fixed <= 0) {
        issues.push({ code: "component.amount.invalid", path: cPath, planKey, message: `“${label}” has an invalid amount.`, severity: "error" });
        continue;
      }
      hasFixed = true;
      amountMinor = fixed * (isSeries(comp) ? count : 1);
    }

    const roundedPerPayment = terms.rounding === "nearest100" ? Math.round(amountMinor / count / (100 * Math.pow(10, precision))) * 100 * Math.pow(10, precision) : Math.round(amountMinor / count);
    const perPaymentMinor = count > 1 ? Math.max(1, roundedPerPayment) : amountMinor;
    components.push({
      ...comp,
      label,
      count,
      frequency: isSeries(comp) ? comp.frequency : "one-off",
      amountMinor,
      amount: money(amountMinor, precision),
      perPaymentMinor,
      perPayment: money(perPaymentMinor, precision),
      totalMinor: amountMinor,
      total: money(amountMinor, precision),
    });
  }

  // ---- allocation check -----------------------------------------------------
  let allocatedMinor = components.reduce((a, c) => a + c.amountMinor, 0);
  let remainingMinor = contractMinor - allocatedMinor;
  const tolerance = toleranceFor(components.length);
  const allPercent = !hasFixed;

  if (allPercent && percentBps !== 10000) {
    const pct = (percentBps / 100).toFixed(2).replace(/\.?0+$/, "");
    issues.push({
      code: "plan.percent.total",
      path: path("components"),
      planKey,
      message: `“${input.name || "Plan"}” allocates ${pct}% of the price — exactly 100% is required (${(100 - percentBps / 100).toFixed(2).replace(/\.?0+$/, "")}% is unassigned).`,
      severity: "error",
    });
  } else if (!allPercent && remainingMinor > tolerance) {
    issues.push({
      code: "plan.amount.remaining",
      path: path("components"),
      planKey,
      message: `“${input.name || "Plan"}” leaves ${money(remainingMinor, precision).toLocaleString()} ${currency} unallocated. Add the missing payment or percentage — nothing is filled automatically.`,
      severity: "error",
    });
  } else if (!allPercent && remainingMinor < -tolerance) {
    issues.push({
      code: "plan.amount.over",
      path: path("components"),
      planKey,
      message: `“${input.name || "Plan"}” over-allocates by ${money(Math.abs(remainingMinor), precision).toLocaleString()} ${currency}.`,
      severity: "error",
    });
  }

  // Absorb only sub-unit rounding drift; never a genuine missing payment.
  let roundingAdjustmentMinor = 0;
  if (remainingMinor !== 0 && Math.abs(remainingMinor) <= tolerance && components.length) {
    const target =
      components.find((c) => c.timing === "handover") ??
      components.find((c) => c.timing === "installments") ??
      components.find((c) => c.timing === "downPayment") ??
      components[components.length - 1];
    target.amountMinor += remainingMinor;
    target.amount = money(target.amountMinor, precision);
    target.totalMinor += remainingMinor;
    target.total = money(target.totalMinor, precision);
    roundingAdjustmentMinor = remainingMinor;
    allocatedMinor = contractMinor;
  }

  // ---- schedule -------------------------------------------------------------
  const schedule: ScheduleEntry[] = [];
  for (const c of components) {
    const months = c.frequency ? FREQUENCY_MONTHS[c.frequency] : 0;
    const start = c.startDate || terms.paymentStartDate || null;
    let dueDate: string | null = null;
    if (months > 0 && start) dueDate = addMonthsUtc(start, months);
    if (c.timing === "handover" && terms.handoverDate) dueDate = terms.handoverDate;
    schedule.push({
      label: c.label,
      timing: c.timing,
      dueDate,
      count: c.count ?? 1,
      amountMinor: c.perPaymentMinor,
      amount: c.perPayment,
      totalMinor: c.totalMinor,
      total: c.total,
      sourceComponentId: c.id,
    });
  }

  const initialMinor = components.filter((c) => c.timing === "booking" || c.timing === "downPayment").reduce((a, c) => a + c.totalMinor, 0);
  const handoverMinor = components.filter((c) => c.timing === "handover").reduce((a, c) => a + c.totalMinor, 0);
  const installments = components.filter((c) => c.timing === "installments");
  const installmentsMinor = installments.reduce((a, c) => a + c.totalMinor, 0);
  const installmentCount = installments.reduce((a, c) => a + (c.count ?? 1), 0);
  const installmentAmountMinor = installments.length === 1 ? installments[0].perPaymentMinor : installmentCount > 0 ? Math.round(installmentsMinor / installmentCount) : 0;

  // ---- fees / VAT ------------------------------------------------------------
  const fees: { label: string; amount: number; amountMinor: number }[] = [];
  for (const fee of Array.isArray(terms.fees) ? terms.fees : []) {
    const label = safeText(fee.label, 80);
    const value = Number(fee.value);
    if (!label || !Number.isFinite(value) || value < 0) continue;
    const base = fee.basis === "listPrice" ? listMinor : contractMinor;
    const amountMinor = fee.type === "percent" ? applyPercent(base, value) : toMinor(value, precision) ?? 0;
    if (amountMinor < 0) continue;
    fees.push({ label, amountMinor, amount: money(amountMinor, precision) });
  }
  const feesMinor = fees.reduce((a, f) => a + f.amountMinor, 0);
  const vatMinor = terms.vatPct != null && Number(terms.vatPct) > 0 ? applyPercent(contractMinor, Number(terms.vatPct)) : 0;
  const totalPayableMinor = contractMinor + feesMinor + vatMinor;

  const plan: PlanCalculation = {
    key: planKey,
    name: safeText(input.name, 80) || "Payment plan",
    badge: safeText(input.badge, 30) || undefined,
    highlight: !!input.highlight,
    currency,
    precision,
    listPrice: money(listMinor, precision),
    listPriceMinor: listMinor,
    discount: { type: input.discount?.type ?? "none", value: input.discount?.type === "none" ? 0 : Number(input.discount?.value ?? 0), reason: input.discount?.reason },
    discountAmount: money(listMinor - contractMinor, precision),
    discountAmountMinor: listMinor - contractMinor,
    contractPrice: money(contractMinor, precision),
    contractPriceMinor: contractMinor,
    components,
    schedule,
    initialPayment: money(initialMinor, precision),
    initialPaymentMinor: initialMinor,
    duringConstruction: money(contractMinor - initialMinor - handoverMinor, precision),
    duringConstructionMinor: contractMinor - initialMinor - handoverMinor,
    handoverPayment: money(handoverMinor, precision),
    handoverPaymentMinor: handoverMinor,
    installmentsTotal: money(installmentsMinor, precision),
    installmentsTotalMinor: installmentsMinor,
    installmentAmount: money(installmentAmountMinor, precision),
    installmentAmountMinor,
    installmentCount,
    installmentsFrequency: installments[0]?.frequency,
    fees,
    feesTotal: money(feesMinor, precision),
    feesTotalMinor: feesMinor,
    vatTotal: money(vatMinor, precision),
    vatTotalMinor: vatMinor,
    totalPayable: money(totalPayableMinor, precision),
    totalPayableMinor,
    allocatedMinor,
    remainingMinor,
    roundingAdjustmentMinor,
    checksum: stableHash({ key: planKey, name: input.name, discount: input.discount, components: rawComponents, fees: terms.fees ?? [], vat: terms.vatPct ?? null, contractMinor }),
  };
  return plan;
}

export function calculateOffer(input: { terms: OfferTermsInput; unit?: OfferUnitInput | null; fallbackCurrency?: string }): OfferCalculation {
  const issues: ValidationIssue[] = [];
  const terms = input.terms ?? ({} as OfferTermsInput);
  const currency = String(terms.currency || input.fallbackCurrency || "").trim().toUpperCase();
  const precision = currencyPrecision(currency);

  if (!/^[A-Z]{3}$/.test(currency)) {
    issues.push({ code: "currency.invalid", path: "currency", message: "Choose a 3-letter currency (e.g. AED, PKR, USD).", severity: "error" });
  }

  let unitPriceMinor = toMinor(terms.unitPrice, precision);
  if (unitPriceMinor == null || unitPriceMinor <= 0) {
    const fromUnit = input.unit?.price != null ? toMinor(input.unit.price, precision) : null;
    if (fromUnit != null && fromUnit > 0) {
      unitPriceMinor = fromUnit;
      issues.push({
        code: "price.from_unit",
        path: "unitPrice",
        message: "The unit price was taken from the selected unit record — confirm it before approval.",
        severity: "warning",
      });
    } else {
      issues.push({ code: "price.missing", path: "unitPrice", message: "Enter the unit price — a financial offer cannot be produced without it.", severity: "error" });
      unitPriceMinor = 0;
    }
  }
  const unitPriceMinorSafe = Math.max(0, unitPriceMinor ?? 0);

  const plans = Array.isArray(terms.plans) ? terms.plans : [];
  if (plans.length === 0) {
    issues.push({ code: "plans.missing", path: "plans", message: "Add at least one payment plan.", severity: "error" });
  } else if (plans.length > MAX_PLANS) {
    issues.push({ code: "plans.too_many", path: "plans", message: `A single PDF supports up to ${MAX_PLANS} plans.`, severity: "error" });
  }

  const keys = new Set<string>();
  const names = new Set<string>();
  const computed: PlanCalculation[] = [];

  plans.forEach((plan, index) => {
    const planKey = plan.key || `plan-${index + 1}`;
    const planName = safeText(plan.name, 80);
    if (!planName) issues.push({ code: "plan.name", path: `plans.${planKey}.name`, planKey, message: "Each plan needs a name.", severity: "error" });
    if (keys.has(planKey)) issues.push({ code: "plan.duplicate_key", path: `plans.${planKey}.key`, planKey, message: "Plan identifiers must be unique.", severity: "error" });
    if (planName && names.has(planName.toLowerCase())) issues.push({ code: "plan.duplicate_name", path: `plans.${planKey}.name`, planKey, message: `Two plans are named “${planName}” — rename one so the PDF is unambiguous.`, severity: "error" });
    keys.add(planKey);
    if (planName) names.add(planName.toLowerCase());

    // Discounts are only ever applied when explicitly provided.
    let contractMinor = unitPriceMinorSafe;
    const discount = plan.discount ?? { type: "none" as const };
    if (discount.type === "percent" || discount.type === "amount") {
      const raw = Number(discount.value);
      if (!Number.isFinite(raw) || raw <= 0) {
        issues.push({ code: "discount.invalid", path: `plans.${planKey}.discount`, planKey, message: "Enter a positive discount or set it to none.", severity: "error" });
      } else if (discount.type === "percent") {
        if (raw > 100) issues.push({ code: "discount.range", path: `plans.${planKey}.discount`, planKey, message: "Discount cannot exceed 100%.", severity: "error" });
        else contractMinor = unitPriceMinorSafe - applyPercent(unitPriceMinorSafe, raw);
      } else {
        const amt = toMinor(raw, precision) ?? 0;
        if (amt > unitPriceMinorSafe) issues.push({ code: "discount.exceeds", path: `plans.${planKey}.discount`, planKey, message: "Discount cannot exceed the unit price.", severity: "error" });
        else contractMinor = unitPriceMinorSafe - amt;
      }
    } else if (discount.type !== "none") {
      issues.push({ code: "discount.type", path: `plans.${planKey}.discount`, planKey, message: "Unknown discount type.", severity: "error" });
    }

    computed.push(computeSinglePlan(plan, terms, Math.max(0, contractMinor), unitPriceMinorSafe, currency, precision, issues));
  });

  const totals = computed.reduce(
    (acc, p) => ({
      contractPriceMinor: acc.contractPriceMinor + p.contractPriceMinor,
      feesMinor: acc.feesMinor + p.feesTotalMinor,
      vatMinor: acc.vatMinor + p.vatTotalMinor,
      totalPayableMinor: acc.totalPayableMinor + p.totalPayableMinor,
    }),
    { contractPriceMinor: 0, feesMinor: 0, vatMinor: 0, totalPayableMinor: 0 },
  );

  const readyForApproval = issues.every((i) => i.severity !== "error");
  return {
    currency,
    precision,
    unitPrice: money(unitPriceMinorSafe, precision),
    unitPriceMinor: unitPriceMinorSafe,
    plans: computed,
    totals,
    issues,
    readyForApproval,
    checksum: stableHash({ unitPriceMinor: unitPriceMinorSafe, currency, plans: computed.map((p) => p.checksum) }),
  };
}

/** Focused follow-up questions shown before generation (deterministic, non-AI). */
export function deriveQuestions(calc: OfferCalculation, draft: { paymentStartDate?: string | null; handoverDate?: string | null; customer?: { name?: string } }): string[] {
  const qs: string[] = [];
  const errors = calc.issues.filter((i) => i.severity === "error");
  if (errors.some((e) => e.code === "price.missing")) qs.push("What is the unit price (and currency) for this offer?");
  if (errors.some((e) => e.code === "plans.missing")) qs.push("Which payment plan(s) should the offer show?");
  for (const plan of calc.plans) {
    const planErrors = errors.filter((e) => e.planKey === plan.key);
    if (planErrors.some((e) => e.code === "plan.percent.total" || e.code === "plan.amount.remaining")) {
      qs.push(`How is the remaining balance on “${plan.name}” paid — installment, construction milestone, or handover?`);
    }
    if (planErrors.some((e) => e.code === "component.count")) qs.push(`How many installments does “${plan.name}” have?`);
  }
  if (!draft.paymentStartDate && calc.plans.some((p) => p.installmentCount > 0)) qs.push("When does the installment schedule start (first payment date)?");
  if (!draft.handoverDate) qs.push("What is the expected handover date?");
  if (!draft.customer?.name) qs.push("Who is the customer this offer is prepared for?");
  if (calc.issues.some((i) => i.code === "price.from_unit")) qs.push("The price came from the unit record — confirm it is the current price.");
  return [...new Set(qs)].slice(0, 8);
}

/** Sanity assertions used after rendering: totals must reconcile exactly. */
export function verifyCalculations(calc: OfferCalculation): string[] {
  const problems: string[] = [];
  for (const plan of calc.plans) {
    const scheduleTotal = plan.schedule.reduce((a, s) => a + s.totalMinor, 0);
    if (scheduleTotal !== plan.contractPriceMinor) {
      problems.push(`${plan.name}: schedule totals ${scheduleTotal} but contract price is ${plan.contractPriceMinor}`);
    }
    if (plan.contractPriceMinor + plan.feesTotalMinor + plan.vatTotalMinor !== plan.totalPayableMinor) {
      problems.push(`${plan.name}: total payable does not reconcile`);
    }
  }
  return problems;
}
