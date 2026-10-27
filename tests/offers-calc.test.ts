import assert from "node:assert/strict";
import test from "node:test";
import { calculateOffer, deriveQuestions, verifyCalculations } from "../src/lib/offers/calc";
import { addMonthsUtc, applyPercent, formatMinor, toMinor } from "../src/lib/offers/money";
import type { OfferPlanInput, OfferTermsInput } from "../src/lib/offers/types";

const plan = (over: Partial<OfferPlanInput> = {}): OfferPlanInput => ({
  key: "p1",
  name: "Plan 1",
  components: [
    { id: "d", label: "Down payment", timing: "downPayment", type: "percent", value: 10 },
    { id: "i", label: "Monthly installments", timing: "installments", type: "percent", value: 1, count: 45, frequency: "monthly" },
    { id: "h", label: "Handover", timing: "handover", type: "percent", value: 45 },
  ],
  ...over,
});

const terms = (over: Partial<OfferTermsInput> = {}): OfferTermsInput => ({
  currency: "AED",
  unitPrice: 25199320,
  plans: [plan()],
  paymentStartDate: "2026-11-01",
  handoverDate: "2029-12-31",
  ...over,
});

test("10% + 45×1% + 45% allocates exactly 100% with no drift", () => {
  const calc = calculateOffer({ terms: terms() });
  assert.equal(calc.issues.filter((i) => i.severity === "error").length, 0);
  const p = calc.plans[0];
  assert.equal(p.contractPriceMinor, 2519932000);
  assert.equal(p.initialPaymentMinor, 251993200);
  assert.equal(p.handoverPaymentMinor, 1133969400);
  assert.equal(p.schedule.reduce((a, s) => a + s.totalMinor, 0), p.contractPriceMinor);
  assert.equal(p.totalPayableMinor, p.contractPriceMinor);
  assert.deepEqual(verifyCalculations(calc), []);
});

test("discount is applied only when explicitly provided and supports percent", () => {
  const noDiscount = calculateOffer({ terms: terms() }).plans[0];
  assert.equal(noDiscount.discountAmountMinor, 0);
  assert.equal(noDiscount.discount.type, "none");

  const discounted = calculateOffer({ terms: terms({ plans: [plan({ discount: { type: "percent", value: 5 } })] }) }).plans[0];
  assert.equal(discounted.listPriceMinor, 2519932000);
  assert.equal(discounted.discountAmountMinor, 125996600);
  assert.equal(discounted.contractPriceMinor, 2393935400);
  assert.equal(discounted.initialPaymentMinor, 239393540);
  assert.equal(discounted.schedule.reduce((a, s) => a + s.totalMinor, 0), discounted.contractPriceMinor);
});

test("a fixed discount cannot exceed the unit price", () => {
  const calc = calculateOffer({ terms: terms({ plans: [plan({ discount: { type: "amount", value: 999999999 } })] }) });
  assert.ok(calc.issues.some((i) => i.code === "discount.exceeds"));
  assert.equal(calc.readyForApproval, false);
});

test("missing price is an error and is never invented", () => {
  const calc = calculateOffer({ terms: terms({ unitPrice: "" }) });
  assert.ok(calc.issues.some((i) => i.code === "price.missing"));
  assert.equal(calc.unitPriceMinor, 0);
  assert.equal(calc.readyForApproval, false);
  assert.ok(deriveQuestions(calc, {}).some((q) => /unit price/i.test(q)));
});

test("unit inventory price is used only with an explicit warning", () => {
  const calc = calculateOffer({ terms: terms({ unitPrice: "" }), unit: { price: 2500000 } });
  assert.equal(calc.unitPriceMinor, 250000000);
  assert.ok(calc.issues.some((i) => i.code === "price.from_unit" && i.severity === "warning"));
  assert.equal(calc.readyForApproval, true);
});

test("percentages that do not total 100 are rejected, not filled", () => {
  const bad = plan({
    components: [
      { id: "d", label: "Down", timing: "downPayment", type: "percent", value: 10 },
      { id: "h", label: "Handover", timing: "handover", type: "percent", value: 45 },
    ],
  });
  const calc = calculateOffer({ terms: terms({ plans: [bad] }) });
  assert.ok(calc.issues.some((i) => i.code === "plan.percent.total"));
  assert.equal(calc.plans[0].remainingMinor, Math.round(calc.plans[0].contractPriceMinor * 0.45));
  assert.equal(calc.plans[0].contractPriceMinor - calc.plans[0].initialPaymentMinor - calc.plans[0].handoverPaymentMinor, calc.plans[0].duringConstructionMinor);
  assert.equal(calc.readyForApproval, false);
});

test("fixed amounts must allocate the exact contract price", () => {
  const fixed = plan({
    components: [
      { id: "d", label: "Booking", timing: "booking", type: "amount", value: 100000 },
      { id: "h", label: "Handover", timing: "handover", type: "amount", value: 900000 },
    ],
  });
  const calc = calculateOffer({ terms: terms({ plans: [fixed], unitPrice: 2000000 }) });
  assert.ok(calc.issues.some((i) => i.code === "plan.amount.remaining"));
  assert.match(calc.issues.find((i) => i.code === "plan.amount.remaining")!.message, /1,000,000/);
});

test("installment series require a count and frequency", () => {
  const missing = plan({
    components: [
      { id: "d", label: "Down", timing: "downPayment", type: "percent", value: 10 },
      { id: "i", label: "Installments", timing: "installments", type: "percent", value: 45, count: 45 },
      { id: "h", label: "Handover", timing: "handover", type: "percent", value: 45 },
    ],
  });
  const calc = calculateOffer({ terms: terms({ plans: [missing] }) });
  assert.ok(calc.issues.some((i) => i.code === "component.frequency"));
});

test("fees and VAT are additional, explicit, and reconcile", () => {
  const calc = calculateOffer({
    terms: terms({
      fees: [
        { id: "f1", label: "Registration", type: "percent", value: 4, basis: "contractPrice" },
        { id: "f2", label: "Admin", type: "amount", value: 5250 },
      ],
      vatPct: 5,
    }),
  });
  const p = calc.plans[0];
  // 4% of 25,199,320 = 1,007,972.80
  assert.equal(p.feesTotalMinor, 100797280 + 525000);
  assert.equal(p.vatTotalMinor, 125996600);
  assert.equal(p.totalPayableMinor, p.contractPriceMinor + p.feesTotalMinor + p.vatTotalMinor);
  assert.equal(calc.readyForApproval, true);
});

test("zero/absent fees never appear", () => {
  const p = calculateOffer({ terms: terms() }).plans[0];
  assert.equal(p.fees.length, 0);
  assert.equal(p.vatTotalMinor, 0);
});

test("three plans compute independently with mixed discounts", () => {
  const calc = calculateOffer({
    terms: terms({
      plans: [
        plan({ key: "p1", name: "Plan 1", discount: { type: "percent", value: 5 }, components: [
          { id: "d", label: "Down", timing: "downPayment", type: "percent", value: 10 },
          { id: "i", label: "Installments", timing: "installments", type: "percent", value: 1, count: 45, frequency: "monthly" },
          { id: "h", label: "Handover", timing: "handover", type: "percent", value: 45 },
        ] }),
        plan({ key: "p2", name: "Plan 2", discount: { type: "percent", value: 10 }, components: [
          { id: "d", label: "Down", timing: "downPayment", type: "percent", value: 20 },
          { id: "i", label: "Installments", timing: "installments", type: "percent", value: 1, count: 45, frequency: "monthly" },
          { id: "h", label: "Handover", timing: "handover", type: "percent", value: 35 },
        ] }),
        plan({ key: "p3", name: "Plan 3", discount: { type: "percent", value: 15 }, components: [
          { id: "d", label: "Down", timing: "downPayment", type: "percent", value: 30 },
          { id: "i", label: "Installments", timing: "installments", type: "percent", value: 1, count: 45, frequency: "monthly" },
          { id: "h", label: "Handover", timing: "handover", type: "percent", value: 25 },
        ] }),
      ],
    }),
  });
  assert.equal(calc.plans.length, 3);
  assert.equal(calc.readyForApproval, true);
  assert.ok(calc.plans[0].totalPayableMinor > calc.plans[1].totalPayableMinor);
  assert.ok(calc.plans[1].totalPayableMinor > calc.plans[2].totalPayableMinor);
  for (const p of calc.plans) {
    assert.equal(p.schedule.reduce((a, s) => a + s.totalMinor, 0), p.contractPriceMinor);
  }
});

test("duplicate plan names are rejected", () => {
  const calc = calculateOffer({ terms: terms({ plans: [plan(), plan({ key: "p2", name: "Plan 1" })] }) });
  assert.ok(calc.issues.some((i) => i.code === "plan.duplicate_name"));
});

test("money helpers round half-up and never use float drift", () => {
  assert.equal(toMinor("1.005", 2), 101);
  assert.equal(toMinor("25,199,320", 2), 2519932000);
  assert.equal(toMinor("0.1", 2), 10);
  assert.equal(applyPercent(1000, 12.5), 125);
  assert.equal(formatMinor(2519932000, "AED"), "25,199,320.00");
  assert.equal(addMonthsUtc("2026-11-30", 45), "2030-08-30");
});

test("schedules add dates only when a start date was supplied", () => {
  const withDates = calculateOffer({ terms: terms() }).plans[0];
  assert.equal(withDates.schedule.find((s) => s.timing === "installments")?.dueDate, "2026-12-01");
  assert.equal(withDates.schedule.find((s) => s.timing === "handover")?.dueDate, "2029-12-31");
  const noDates = calculateOffer({ terms: terms({ paymentStartDate: null, handoverDate: null }) }).plans[0];
  assert.equal(noDates.schedule.find((s) => s.timing === "installments")?.dueDate, null);
});

test("nearest-100 installment rounding leaves the contract total exact", () => {
  const calc = calculateOffer({ terms: terms({ rounding: "nearest100" }) });
  const p = calc.plans[0];
  assert.equal(p.schedule.reduce((a, s) => a + s.totalMinor, 0), p.contractPriceMinor);
  assert.ok(p.installmentAmountMinor % 10000 === 0);
});
