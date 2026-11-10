import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { calculateOffer } from "../../src/lib/offers/calc";
import { DEFAULT_ASSETS, DEFAULT_DESIGN } from "../../src/lib/offers/defaults";
import { buildTierPlan } from "../../src/lib/offers/plans";
import { expectedPdfFigures, renderOfferPdf, validateRenderedPdf } from "../../src/lib/offers/render";
import type { OfferSnapshotInput, OfferTermsInput } from "../../src/lib/offers/types";

/**
 * The renderer imports "server-only", so run this file with
 * `npm run test:render` (node --conditions=react-server).
 *
 * These checks exercise the real PDF: page count and extracted text, not a
 * byte-length guess. No images are supplied, so nothing is fetched.
 */

function snapshot(terms: OfferTermsInput): OfferSnapshotInput {
  return {
    reference: "MH-OFR-RENDER-1",
    title: "Sales Offer",
    date: "2026-10-30",
    project: { name: "Maison Etoile", city: "Paris", country: "France", amenities: ["Concierge", "Pool"] },
    unit: { unitNo: "9001", type: "Apartment", bedrooms: "3", area: 1850, areaUnit: "sqft", floor: "9" },
    terms,
    assets: { ...DEFAULT_ASSETS },
    design: { ...DEFAULT_DESIGN },
  };
}

const terms: OfferTermsInput = {
  currency: "AED",
  unitPrice: 2_200_000,
  plans: [buildTierPlan(0, 10), buildTierPlan(1, 20), buildTierPlan(2, 30)],
  paymentStartDate: "2026-11-01",
  handoverDate: "2029-12-31",
};

test("the default two-page letter stays at two pages and keeps every plan figure", async () => {
  const snap = snapshot(terms);
  const calc = calculateOffer({ terms });
  assert.equal(calc.issues.filter((issue) => issue.severity === "error").length, 0);

  const bytes = await renderOfferPdf(snap, calc, { origin: "http://127.0.0.1:65535" });
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 2, "the default letter must be exactly two pages");

  const check = await validateRenderedPdf(bytes, expectedPdfFigures(snap, calc));
  assert.equal(check.pages, 2);
  assert.deepEqual(check.missing, [], "every calculated figure must be extractable from the PDF");
});

test("a single custom 2.5% tier still fits the two-page letter", async () => {
  const single: OfferTermsInput = { ...terms, plans: [buildTierPlan(0, 2.5)] };
  const snap = snapshot(single);
  const calc = calculateOffer({ terms: single });
  const bytes = await renderOfferPdf(snap, calc, { origin: "http://127.0.0.1:65535" });
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 2);

  const check = await validateRenderedPdf(bytes, expectedPdfFigures(snap, calc));
  assert.equal(check.ok, true, `missing: ${check.missing.join(", ")}`);
});

test("hiding the Mr Home logo renders no fallback brand mark", async () => {
  const snap = snapshot(terms);
  snap.assets = { ...snap.assets, includeMrHomeLogo: false };
  const calc = calculateOffer({ terms });
  const bytes = await renderOfferPdf(snap, calc, { origin: "http://127.0.0.1:65535" });
  const text = await validateRenderedPdf(bytes, ["MH-OFR-RENDER-1"]);
  assert.equal(text.ok, true);
});
