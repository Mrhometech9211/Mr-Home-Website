import test from "node:test";
import assert from "node:assert/strict";
import { projectJsonLd, propertyJsonLd, webPageJsonLd } from "../src/lib/structured-data";

type Json = Record<string, unknown>;

function project(overrides: Record<string, unknown> = {}): Json {
  return {
    slug: "test-residence",
    name: "Test Residence",
    description: "A test project.",
    shortDescription: "A test project.",
    city: "Dubai",
    country: "UAE",
    address: "Business Bay",
    market: { name: "UAE", slug: "uae" },
    price: "500000",
    currency: "USD",
    latitude: 25.1,
    longitude: 55.2,
    bedrooms: "2",
    bathrooms: "2",
    areaValue: "900",
    areaUnit: "sqft",
    gallery: [],
    amenities: [],
    specifications: [],
    floorPlans: [],
    documents: [],
    verificationChecks: [],
    priceCheckedAt: null,
    verificationCheckedAt: null,
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
}

test("project Offer price is omitted until a price verification field confirms it", () => {
  const ld = projectJsonLd(project() as never) as Json;
  assert.equal(ld.offers, undefined);
});

test("project Offer price appears when priceCheckedAt is stored", () => {
  const ld = projectJsonLd(project({ priceCheckedAt: new Date("2026-01-01T00:00:00Z") }) as never) as Json;
  const offers = ld.offers as Json;
  assert.equal(offers.price, 500000);
  assert.equal(offers.priceCurrency, "USD");
});

test("a confirming price verification check also unlocks the Offer price", () => {
  const ld = projectJsonLd(
    project({ verificationChecks: [{ check: "price", status: "confirmed", checkedAt: "2026-01-01" }] }) as never,
  ) as Json;
  assert.equal((ld.offers as Json).price, 500000);
});

test("a non-price or unconfirmed check does not unlock the Offer price", () => {
  const ld = projectJsonLd(
    project({
      verificationChecks: [
        { check: "handover", status: "confirmed", checkedAt: "2026-01-01" },
        { check: "price", status: "pending", checkedAt: "2026-01-01" },
      ],
    }) as never,
  ) as Json;
  assert.equal(ld.offers, undefined);
});

const IN_STOCK = "https://schema.org/InStock";

test("a verification date alone never emits availability", () => {
  const ld = projectJsonLd(
    project({ inStockConfirmed: false, verificationCheckedAt: new Date("2026-01-01T00:00:00Z") }) as never,
  ) as Json;
  assert.equal(ld.offers, undefined);
});

test("a project stored before the In Stock field behaves as not confirmed", () => {
  const legacy = project({ verificationCheckedAt: new Date("2026-01-01T00:00:00Z") });
  assert.equal("inStockConfirmed" in legacy, false);
  const ld = projectJsonLd(legacy as never) as Json;
  assert.equal(ld.offers, undefined);
});

test("ticking In Stock without a verification date emits no availability", () => {
  const ld = projectJsonLd(project({ inStockConfirmed: true, verificationCheckedAt: null }) as never) as Json;
  assert.equal(ld.offers, undefined);
});

test("ticking In Stock with an unparseable date emits no availability", () => {
  const ld = projectJsonLd(
    project({ inStockConfirmed: true, verificationCheckedAt: "not-a-date" }) as never,
  ) as Json;
  assert.equal(ld.offers, undefined);
});

test("confirmed In Stock with a valid date emits an availability-only Offer", () => {
  const ld = projectJsonLd(
    project({ inStockConfirmed: true, verificationCheckedAt: new Date("2026-01-01T00:00:00Z"), priceCheckedAt: null }) as never,
  ) as Json;
  const offers = ld.offers as Json;
  assert.equal(Array.isArray(offers), false);
  assert.equal(offers["@type"], "Offer");
  assert.equal(offers.availability, IN_STOCK);
  assert.equal(offers.price, undefined);
  assert.equal(offers.priceCurrency, undefined);
  assert.equal(offers.url, ld.url);
});

test("confirmed In Stock must not unlock an unverified price", () => {
  const ld = projectJsonLd(
    project({ inStockConfirmed: true, verificationCheckedAt: "2026-01-01" }) as never,
  ) as Json;
  const offers = ld.offers as Json;
  assert.equal(offers.availability, IN_STOCK);
  assert.equal(offers.price, undefined);
});

test("verified price and confirmed In Stock share exactly one Offer", () => {
  const ld = projectJsonLd(
    project({
      inStockConfirmed: true,
      verificationCheckedAt: new Date("2026-01-01T00:00:00Z"),
      priceCheckedAt: new Date("2026-01-01T00:00:00Z"),
    }) as never,
  ) as Json;
  assert.equal(Array.isArray(ld.offers), false);
  const offers = ld.offers as Json;
  assert.equal(offers["@type"], "Offer");
  assert.equal(offers.price, 500000);
  assert.equal(offers.priceCurrency, "USD");
  assert.equal(offers.availability, IN_STOCK);
});

test("unticking In Stock removes availability without touching the verified price", () => {
  const ld = projectJsonLd(
    project({
      inStockConfirmed: false,
      verificationCheckedAt: new Date("2026-01-01T00:00:00Z"),
      priceCheckedAt: new Date("2026-01-01T00:00:00Z"),
    }) as never,
  ) as Json;
  const offers = ld.offers as Json;
  assert.equal(offers.availability, undefined);
  assert.equal(offers.price, 500000);
});

// A sold-out/available status is display data and never becomes availability markup on its own.
test("project status does not produce availability on its own", () => {
  for (const status of ["available", "ready", "sold-out"]) {
    const ld = projectJsonLd(
      project({ status, inStockConfirmed: false, verificationCheckedAt: new Date("2026-01-01T00:00:00Z") }) as never,
    ) as Json;
    assert.equal(ld.offers, undefined, status);
  }
});

test("project JSON-LD shares the canonical URL and keeps property facts under about", () => {
  const ld = projectJsonLd(project({ priceCheckedAt: new Date("2026-01-01T00:00:00Z") }) as never, {
    canonical: "https://www.mrhomerealestate.com/projects/test-residence",
    description: "Resolved description.",
  }) as Json;
  assert.equal(ld.url, "https://www.mrhomerealestate.com/projects/test-residence");
  assert.equal((ld.mainEntityOfPage as Json)["@id"], "https://www.mrhomerealestate.com/projects/test-residence#webpage");
  assert.equal((ld.offers as Json).url, ld.url);
  assert.equal(ld.address, undefined);
  assert.equal((ld.about as Json)["@type"], "Accommodation");
  assert.equal(ld.description, "Resolved description.");
});

test("property facts also live under about rather than directly on RealEstateListing", () => {
  const ld = propertyJsonLd(
    {
      slug: "test-listing",
      title: "Test Listing",
      description: "Listing.",
      city: "Dubai",
      country: "UAE",
      address: "Business Bay",
      price: "250000",
      currency: "USD",
      areaSqm: "80",
      bedrooms: "1",
      gallery: [],
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    } as never,
    { canonical: "https://www.mrhomerealestate.com/properties/test-listing" },
  ) as Json;
  assert.equal(ld.address, undefined);
  assert.equal((ld.about as Json)["@type"], "Accommodation");
  assert.equal(ld.url, "https://www.mrhomerealestate.com/properties/test-listing");
});

test("WebPage uses the resolved title, description and canonical", () => {
  const ld = webPageJsonLd({
    path: "/buy?market=dubai",
    canonical: "https://www.mrhomerealestate.com/buy",
    type: "CollectionPage",
    name: "Resolved title",
    description: "Resolved description",
  }) as Json;
  assert.equal(ld["@type"], "CollectionPage");
  assert.equal(ld["@id"], "https://www.mrhomerealestate.com/buy#webpage");
  assert.equal(ld.url, "https://www.mrhomerealestate.com/buy");
  assert.equal(ld.name, "Resolved title");
  assert.equal(ld.description, "Resolved description");
});
