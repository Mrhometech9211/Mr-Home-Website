/**
 * Pure, client-safe types for the Sales Offer Generator. No server-only
 * imports here: the admin builder, the calculation engine, the PDF renderer,
 * the API and the tests all share these exact shapes.
 */

export type OfferComponentTiming =
  | "booking"
  | "downPayment"
  | "construction"
  | "installments"
  | "handover"
  | "milestone"
  | "other";

export type OfferFrequency = "monthly" | "quarterly" | "annual" | "one-off";

export type OfferComponent = {
  id: string;
  label: string;
  timing: OfferComponentTiming;
  type: "percent" | "amount";
  /** Percent (0–100) or a money amount in the offer currency. */
  value: number;
  /** Required for installment/milestone series; 1 for a single payment. */
  count?: number;
  frequency?: OfferFrequency;
  /** First installment date (YYYY-MM-DD). Dates are omitted when absent. */
  startDate?: string | null;
  note?: string;
};

export type OfferDiscount =
  | { type: "none"; value?: number; reason?: string }
  | { type: "percent"; value: number; reason?: string }
  | { type: "amount"; value: number; reason?: string };

export type OfferFee = {
  id: string;
  label: string;
  type: "percent" | "amount";
  value: number;
  basis?: "listPrice" | "contractPrice";
};

export type OfferPlanInput = {
  key: string;
  name: string;
  badge?: string;
  highlight?: boolean;
  discount?: OfferDiscount;
  components: OfferComponent[];
};

export type OfferTermsInput = {
  currency: string;
  unitPrice: number | string;
  plans: OfferPlanInput[];
  vatPct?: number | null;
  fees?: OfferFee[];
  /** Only applied when explicitly chosen; defaults to currency precision. */
  rounding?: "currency" | "nearest100" | "none";
  paymentStartDate?: string | null;
  handoverDate?: string | null;
  notes?: string;
};

export type OfferCustomerInput = {
  name?: string;
  email?: string;
  phone?: string;
  country?: string;
};

export type OfferUnitInput = {
  unitNo?: string;
  type?: string;
  bedrooms?: string;
  area?: number | string;
  areaUnit?: string;
  floor?: string;
  view?: string;
  price?: number | string;
};

export type OfferAssets = {
  coverImage?: string;
  gallery: string[];
  floorPlans: { name: string; image: string }[];
  /** Optional per-plan card imagery; plans without an entry rotate the gallery. */
  planImages?: { planKey: string; image: string }[];
  projectLogo?: string;
  mrHomeLogo?: string;
  /** Asked per offer unless the prompt explicitly states the choice. */
  includeMrHomeLogo: boolean;
};

export type OfferCoverStyle = "photo" | "split" | "solid";
export type OfferDensity = "comfortable" | "compact";
export type OfferDisplayFont = "sans" | "serif";

export type OfferDesign = {
  theme: "premium" | "minimal" | "bold";
  accent: string;
  ink: string;
  paper: string;
  showPriceBreakdown: boolean;
  showGallery: boolean;
  showFloorPlans: boolean;
  showContact: boolean;
  showDisclaimer: boolean;
  showScheduleSummary: boolean;
  /** Cover composition. "photo" is a full-bleed image, "split" a half panel, "solid" type-only. */
  coverStyle?: OfferCoverStyle;
  /** Strength (0–90) of the dark scrim over a photographic cover. */
  coverOverlay?: number;
  /** Cover headline override; falls back to the project name. */
  headline?: string;
  /** Small line above the headline, e.g. "PRESTIGIOUS LIVING AT". */
  eyebrow?: string;
  /** Headline / section-title face. Body text always stays clean sans. */
  displayFont?: OfferDisplayFont;
  /** Vertical rhythm of plan cards and tables. */
  density?: OfferDensity;
  /** Unit number / area / view strip on the cover. */
  showUnitStrip?: boolean;
  /** Per-plan card photography. */
  showPlanImages?: boolean;
  pageNumbers?: boolean;
  /** Faint vertical mark along the inner edge of every content page. */
  watermark?: string;
  ctaText?: string;
  ctaNote?: string;
  disclaimer?: string;
  footerNote?: string;
  preparedBy?: string;
  contactPhone?: string;
  contactEmail?: string;
  contactSite?: string;
  tagline?: string;
};

export type OfferSnapshotInput = {
  reference: string;
  title?: string;
  date?: string;
  customer?: OfferCustomerInput;
  project?: {
    name?: string;
    city?: string;
    country?: string;
    developer?: string;
    description?: string;
    market?: string;
    amenities?: string[];
  };
  unit?: OfferUnitInput;
  terms: OfferTermsInput;
  assets: OfferAssets;
  design: OfferDesign;
};

export type ValidationIssue = {
  code: string;
  path?: string;
  planKey?: string;
  message: string;
  severity: "error" | "warning";
};

export type CalculatedComponent = OfferComponent & {
  amountMinor: number;
  amount: number;
  perPaymentMinor: number;
  perPayment: number;
  totalMinor: number;
  total: number;
};

export type ScheduleEntry = {
  label: string;
  timing: OfferComponentTiming;
  dueDate?: string | null;
  count: number;
  amountMinor: number;
  amount: number;
  totalMinor: number;
  total: number;
  sourceComponentId: string;
};

export type PlanCalculation = {
  key: string;
  name: string;
  badge?: string;
  highlight?: boolean;
  currency: string;
  precision: number;
  listPrice: number;
  listPriceMinor: number;
  discount: { type: string; value: number; reason?: string };
  discountAmount: number;
  discountAmountMinor: number;
  contractPrice: number;
  contractPriceMinor: number;
  components: CalculatedComponent[];
  schedule: ScheduleEntry[];
  initialPayment: number;
  initialPaymentMinor: number;
  duringConstruction: number;
  duringConstructionMinor: number;
  handoverPayment: number;
  handoverPaymentMinor: number;
  installmentsTotal: number;
  installmentsTotalMinor: number;
  installmentAmount: number;
  installmentAmountMinor: number;
  installmentCount: number;
  installmentsFrequency?: OfferFrequency;
  fees: { label: string; amount: number; amountMinor: number }[];
  feesTotal: number;
  feesTotalMinor: number;
  vatTotal: number;
  vatTotalMinor: number;
  totalPayable: number;
  totalPayableMinor: number;
  allocatedMinor: number;
  remainingMinor: number;
  roundingAdjustmentMinor: number;
  checksum: string;
};

export type OfferCalculation = {
  currency: string;
  precision: number;
  unitPrice: number;
  unitPriceMinor: number;
  plans: PlanCalculation[];
  totals: {
    contractPriceMinor: number;
    feesMinor: number;
    vatMinor: number;
    totalPayableMinor: number;
  };
  issues: ValidationIssue[];
  readyForApproval: boolean;
  checksum: string;
};

export const OFFER_STATUSES = ["draft", "needs_info", "ready_for_review", "approved", "archived"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const STATUS_LABELS: Record<OfferStatus, string> = {
  draft: "Draft",
  needs_info: "Needs information",
  ready_for_review: "Ready for review",
  approved: "Approved",
  archived: "Archived",
};
