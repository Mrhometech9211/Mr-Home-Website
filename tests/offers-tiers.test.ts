import assert from "node:assert/strict";
import test from "node:test";
import { calculateOffer } from "../src/lib/offers/calc";
import { buildTierPlan, planAllocatedBps, rebuildTierMonths, tierKey, tierPercentFromKey } from "../src/lib/offers/plans";
import type { OfferTermsInput } from "../src/lib/offers/types";

const terms = (plans = [buildTierPlan(0, 10)]): OfferTermsInput => ({
  currency: "AED",
  unitPrice: 2_200_000,
  plans,
  paymentStartDate: "2026-11-01",
  handoverDate: "2029-12-31",
});

test("10 / 20 / 30 tiers each allocate exactly 100% and reconcile with the price", () => {
  for (const [index, pct] of [10, 20, 30].entries()) {
    const plan = buildTierPlan(index, pct);
    assert.equal(planAllocatedBps(plan), 10000, `${pct}% tier must allocate 100%`);
    const calc = calculateOffer({ terms: terms([plan]) });
    assert.deepEqual(calc.issues.filter((i) => i.severity === "error"), [], `${pct}% tier must validate`);
    const p = calc.plans[0];
    assert.equal(p.contractPriceMinor, 220_000_000);
    assert.equal(p.initialPaymentMinor, 22_000_000 * (pct / 10), `initial payment follows the price and tier`);
    assert.equal(p.schedule.reduce((a, s) => a + s.totalMinor, 0), p.contractPriceMinor);
  }
});

test("all three tiers together keep their own down payment and totals", () => {
  const plans = [buildTierPlan(0, 10), buildTierPlan(1, 20), buildTierPlan(2, 30)];
  const calc = calculateOffer({ terms: terms(plans) });
  assert.equal(calc.issues.filter((i) => i.severity === "error").length, 0);
  assert.deepEqual(
    calc.plans.map((p) => p.initialPaymentMinor),
    [22_000_000, 44_000_000, 66_000_000],
  );
});

test("a custom 2.5% tier is exact and still totals 100%", () => {
  const plan = buildTierPlan(0, 2.5);
  assert.equal(planAllocatedBps(plan), 10000);
  const calc = calculateOffer({ terms: terms([plan]) });
  assert.equal(calc.issues.filter((i) => i.severity === "error").length, 0);
  assert.equal(calc.plans[0].initialPaymentMinor, 5_500_000);
});

test("a 55% tier leaves nothing for handover and still allocates exactly 100%", () => {
  const plan = buildTierPlan(0, 55);
  assert.equal(planAllocatedBps(plan), 10000);
  assert.equal(plan.components.some((c) => c.timing === "handover"), false);
  const calc = calculateOffer({ terms: terms([plan]) });
  assert.equal(calc.issues.filter((i) => i.severity === "error").length, 0);
});

test("a tier above 55% keeps the residue at handover instead of over-allocating", () => {
  const plan = buildTierPlan(0, 60);
  assert.equal(planAllocatedBps(plan), 10000);
  const handover = plan.components.find((c) => c.timing === "handover");
  assert.ok(handover, "the 0.4% residue still needs a line");
  const calc = calculateOffer({ terms: terms([plan]) });
  assert.equal(calc.issues.filter((i) => i.severity === "error").length, 0);
});

test("changing the tenor rebuilds the series without breaking allocation", () => {
  const plan = rebuildTierMonths(buildTierPlan(0, 10), 36);
  assert.equal(planAllocatedBps(plan), 10000);
  const calc = calculateOffer({ terms: terms([plan]) });
  assert.equal(calc.issues.filter((i) => i.severity === "error").length, 0);
  assert.equal(calc.plans[0].installmentCount, 36);
});

test("tier keys round-trip and reject invalid percentages", () => {
  assert.equal(tierKey(10), "tier-10");
  assert.equal(tierKey(2.5), "tier-2_5");
  assert.match(tierKey(2.5), /^[a-zA-Z0-9_-]{1,40}$/);
  assert.equal(tierPercentFromKey("tier-2_5"), 2.5);
  assert.equal(tierPercentFromKey("tier-2.5"), 2.5);
  assert.equal(tierPercentFromKey("plan-1"), null);
  assert.throws(() => buildTierPlan(0, 0));
  assert.throws(() => buildTierPlan(0, 100));
  assert.throws(() => buildTierPlan(0, Number.NaN));
});
