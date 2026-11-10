import type { OfferAssets, OfferDesign, OfferPlanInput } from "./types";

export const DEFAULT_DESIGN: OfferDesign = {
  theme: "premium",
  accent: "#1f8f3a",
  ink: "#0b1b12",
  paper: "#ffffff",
  showPriceBreakdown: true,
  showGallery: true,
  showFloorPlans: true,
  showCustomer: false,
  showContact: true,
  showDisclaimer: true,
  showScheduleSummary: true,
  coverStyle: "photo",
  coverOverlay: 52,
  eyebrow: "Sales Offer",
  displayFont: "sans",
  bodyFont: "sans",
  bodyFontSize: 9,
  headingFontSize: 42,
  unitLabel: "Unit No.",
  showAmountInWords: false,
  showTagline: false,
  showUnitSpecs: true,
  unitSpecs: [],
  unitCardScale: "medium",
  taglinePosition: "footer",
  maxPages: 2,
  sections: {
    cover: { headingSize: 42 },
    unit: { headingSize: 19, fontSize: 8, border: true },
    plans: { headingSize: 22, fontSize: 8, border: true },
    breakdown: { heading: "Price Breakdown", headingSize: 8, fontSize: 7, border: true },
    gallery: { heading: "Project Gallery", headingSize: 8, imageScale: "medium" },
    floorPlans: { heading: "Floor Plans", headingSize: 8, imageScale: "medium" },
  },
  showMinorUnits: false,
  showCurrencyCode: true,
  dateLabel: "Offer Date",
  density: "comfortable",
  showUnitStrip: true,
  showPlanImages: true,
  pageNumbers: true,
  watermark: "",
  ctaText: "Ready to invest?",
  ctaNote: "Let's get you started.",
  disclaimer:
    "All prices, payment terms and handover dates are indicative and subject to the developer's final confirmation. Availability and currency conversion may change without notice.",
  tagline: "",
  preparedBy: "",
  contactSite: "www.mrhomerealestate.com",
  contactEmail: "info@mrhome.ae",
  contactPhone: "+92 300 1363636",
};

export const DEFAULT_ASSETS: OfferAssets = {
  gallery: [],
  floorPlans: [],
  planImages: [],
  includeMrHomeLogo: false,
  showProjectLogo: true,
};

/** UI convenience only — every figure stays visible and editable. */
export function suggestedPlan(index: number): OfferPlanInput {
  const downPayments = [10, 20, 30][index] ?? 10;
  const handovers = [45, 35, 25][index] ?? 45;
  return {
    key: `plan-${index + 1}`,
    name: `Plan ${index + 1}`,
    badge: index === 0 ? "Popular" : index === 2 ? "Premium" : "",
    highlight: index === 0,
    discount: { type: "none" },
    components: [
      { id: `p${index}-down`, label: "Down payment", timing: "downPayment", type: "percent", value: downPayments },
      { id: `p${index}-inst`, label: "Monthly installments", timing: "installments", type: "percent", value: 1, count: 45, frequency: "monthly" },
      { id: `p${index}-hand`, label: "Handover payment", timing: "handover", type: "percent", value: handovers },
    ],
  };
}

export const THEME_PRESETS: {
  key: OfferDesign["theme"];
  label: string;
  accent: string;
  ink: string;
  paper: string;
  displayFont: NonNullable<OfferDesign["displayFont"]>;
  coverStyle: NonNullable<OfferDesign["coverStyle"]>;
  desc: string;
}[] = [
  { key: "premium", label: "Premium green / black / white", accent: "#1f8f3a", ink: "#0b1b12", paper: "#ffffff", displayFont: "sans", coverStyle: "photo", desc: "Full-bleed photography, bold sans display, green accents." },
  { key: "minimal", label: "Minimal editorial", accent: "#2f6f4f", ink: "#1d1d1b", paper: "#fbfaf6", displayFont: "serif", coverStyle: "split", desc: "Warm paper, serif headline, quieter overlays." },
  { key: "bold", label: "Bold high-contrast", accent: "#128a3e", ink: "#000000", paper: "#ffffff", displayFont: "sans", coverStyle: "solid", desc: "Type-first solid cover, maximum contrast." },
  { key: "emerald", label: "Emerald gallery", accent: "#0f7a52", ink: "#07231a", paper: "#f7fbf8", displayFont: "sans", coverStyle: "frame", desc: "Deep emerald cover with a framed hero photograph." },
  { key: "midnight", label: "Midnight gold", accent: "#c9a227", ink: "#0a0f14", paper: "#fbfaf7", displayFont: "serif", coverStyle: "split", desc: "Near-black ink, gold accent, serif headlines." },
  { key: "editorial", label: "Editorial mono", accent: "#1c1c1c", ink: "#141414", paper: "#ffffff", displayFont: "serif", coverStyle: "frame", desc: "Monochrome print editorial — restraint over colour." },
  { key: "glass", label: "Emerald glass", accent: "#46d49c", ink: "#071d18", paper: "#f4fbf7", displayFont: "sans", coverStyle: "photo", desc: "Layered emerald glass-style panels over project imagery." },
  { key: "horizon", label: "Coastal horizon", accent: "#43a9b2", ink: "#102a35", paper: "#f5fafb", displayFont: "serif", coverStyle: "split", desc: "Airy coastal palette and an editorial split-image cover." },
  { key: "terrace", label: "Terrace bronze", accent: "#b98252", ink: "#211b18", paper: "#fbf7f2", displayFont: "serif", coverStyle: "frame", desc: "Warm bronze accent with refined framed imagery." },
  { key: "monolith", label: "Monolith 3D", accent: "#b9a7ff", ink: "#111126", paper: "#f7f6ff", displayFont: "sans", coverStyle: "solid", desc: "Dimensional dark architecture with beveled-card visual cues." },
];
