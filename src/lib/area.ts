export type AreaDisplayUnit = "sqm" | "sqft" | "marla" | "kanal";

const SQFT_PER_SQM = 10.7639;
const SQFT_PER_MARLA = 272.25;

/**
 * Format a stored square-metre area in a visitor-facing unit.
 *
 * Lives outside the `"use client"` PropertyCard module because server
 * components (e.g. /properties/[slug]) also format areas. Importing a
 * function from a client module into a server component throws at runtime.
 */
export function formatArea(areaSqm: string | number | null | undefined, unit: AreaDisplayUnit): string | null {
  const sqm = areaSqm == null ? NaN : Number(areaSqm);
  if (Number.isNaN(sqm)) return null;
  const sqft = sqm * SQFT_PER_SQM;
  const value =
    unit === "sqm" ? Math.round(sqm)
    : unit === "sqft" ? Math.round(sqft)
    : unit === "marla" ? Math.round(sqft / SQFT_PER_MARLA)
    : Math.round(sqft / (SQFT_PER_MARLA * 20)); // kanal = 20 marla
  // Plain unit labels (Sqft / Sqmt / Marla / Kanal) — no ft²/m² superscripts.
  const suffix = unit === "sqm" ? " Sqmt" : unit === "sqft" ? " Sqft" : unit === "marla" ? " Marla" : " Kanal";
  return `${value.toLocaleString()}${suffix}`;
}
