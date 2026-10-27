import type { OfferAssets, OfferDesign, OfferPlanInput } from "./types";

export const DEFAULT_DESIGN: OfferDesign = {
  theme: "premium",
  accent: "#1f8f3a",
  ink: "#0b1b12",
  paper: "#ffffff",
  showPriceBreakdown: true,
  showGallery: true,
  showFloorPlans: true,
  showContact: true,
  showDisclaimer: true,
  showScheduleSummary: true,
  coverStyle: "photo",
  coverOverlay: 52,
  eyebrow: "Prestigious living at",
  displayFont: "sans",
  density: "comfortable",
  showUnitStrip: true,
  showPlanImages: true,
  pageNumbers: true,
  watermark: "",
  ctaText: "Ready to invest?",
  ctaNote: "Let's get you started.",
  disclaimer:
    "All prices, payment terms and handover dates are indicative and subject to the developer's final confirmation. Availability and currency conversion may change without notice.",
  tagline: "Invest Wise. Live Better.",
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
];
