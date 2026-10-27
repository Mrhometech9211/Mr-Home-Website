/**
 * Decimal-safe money helpers shared by the calculation engine, the PDF
 * renderer and the admin UI. All arithmetic is performed on integer minor
 * units; percentages are parsed to basis points first, so 12.5% never becomes
 * 0.1249999999. No floating point value is ever used for a stored total.
 */

export const CURRENCY_PRECISION: Record<string, number> = {
  AED: 2, USD: 2, EUR: 2, GBP: 2, PKR: 2, SAR: 2, QAR: 2, OMR: 2, BHD: 2,
  KWD: 3, JOD: 3, JPY: 0, KRW: 0, INR: 2, TRY: 2, EGP: 2, CAD: 2, AUD: 2,
  CHF: 2, SGD: 2, HKD: 2, MYR: 2, THB: 2, IDR: 0, PHP: 2, ZAR: 2, NGN: 2,
};

export function currencyPrecision(currency: string): number {
  return CURRENCY_PRECISION[String(currency || "").toUpperCase()] ?? 2;
}

/** Parse a human-entered amount ("25,199,320", "1 250.50", 42) into cents/minor units. */
export function toMinor(input: number | string | null | undefined, precision: number): number | null {
  if (input == null) return null;
  let s = typeof input === "number" ? String(input) : String(input).trim();
  if (!s) return null;
  s = s.replace(/[\s,_]/g, "").replace(/^[A-Za-z]{3}/, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(s)) return null;
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);
  const [whole, frac = ""] = s.split(".");
  const p = Math.max(0, Math.min(6, Math.trunc(precision)));
  const digits = (whole || "0") + (frac + "0".repeat(p + 1)).slice(0, p + 1);
  const units = Number(digits.slice(0, digits.length - 1));
  const next = Number(digits.slice(-1));
  if (!Number.isSafeInteger(units)) return null;
  const minor = units + (next >= 5 ? 1 : 0);
  return negative ? -minor : minor;
}

export function fromMinor(minor: number, precision: number): number {
  return minor / Math.pow(10, Math.max(0, Math.min(6, precision)));
}

/** Percentage → integer basis points (12.5% → 1250). */
export function toBasisPoints(pct: number | string | null | undefined): number | null {
  return toMinor(pct, 2);
}

/** Apply a percentage to a minor-unit amount with half-up rounding. */
export function applyPercent(minor: number, pct: number): number {
  const bps = toBasisPoints(pct);
  if (bps == null) return 0;
  const product = minor * bps;
  return product >= 0 ? Math.floor((product + 5000) / 10000) : -Math.floor((-product + 5000) / 10000);
}

/** Round to a currency-aware increment (only used when explicitly requested). */
export function roundToIncrement(minor: number, incrementMinor: number): number {
  if (!Number.isFinite(incrementMinor) || incrementMinor <= 1) return minor;
  return Math.round(minor / incrementMinor) * incrementMinor;
}

export function formatMinor(minor: number, currency: string): string {
  const p = currencyPrecision(currency);
  const value = fromMinor(minor, p);
  try {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: p,
      maximumFractionDigits: p,
    }).format(value);
  } catch {
    return value.toFixed(p);
  }
}

/** Format an amount for display, with the currency code. */
export function formatMoney(minor: number, currency: string): string {
  return `${formatMinor(minor, currency)} ${String(currency || "").toUpperCase()}`.trim();
}

/** Stable FNV-1a hash used to prove a PDF matches the exact input snapshot. */
export function stableHash(input: unknown): string {
  const text = typeof input === "string" ? input : JSON.stringify(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Deterministic UTC date helpers — no server timezone can leak into a PDF. */
export function addMonthsUtc(iso: string, months: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo, 1));
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(d, lastDay));
  return date.toISOString().slice(0, 10);
}
