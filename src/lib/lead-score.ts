import type { LeadStatus } from "@/db/schema";

/**
 * Transparent, deterministic lead scoring (0–100).
 *
 * Deliberately simple and explainable so sales teams trust it:
 *  - status progress
 *  - declared budget signals
 *  - contact richness (phone/WhatsApp)
 *  - target market/project specificity
 *  - source quality
 */
export function computeLeadScore(lead: {
  status?: LeadStatus | string | null;
  budget?: string | null;
  city?: string | null;
  marketId?: number | null;
  projectId?: number | null;
  phone?: string | null;
  whatsapp?: string | null;
  message?: string | null;
  source?: string | null;
  campaign?: string | null;
}): number {
  let score = 0;

  const status = (lead.status ?? "NEW").toString().toUpperCase();
  const statusWeights: Record<string, number> = { NEW: 5, CONTACTED: 15, QUALIFIED: 30, CONVERTED: 50, CLOSED_DEAL: 60, LOST: 0, ARCHIVED: 0 };
  score += statusWeights[status] ?? 5;

  const budget = (lead.budget ?? "").toLowerCase();
  if (budget.includes("custom") || budget.includes("3m") || budget.includes("10m")) score += 25;
  else if (budget.includes("1m") || budget.includes("500k")) score += 18;
  else if (budget.includes("250k")) score += 12;
  else if (budget) score += 8;

  if (lead.projectId) score += 10;
  if (lead.marketId) score += 6;
  if (lead.city) score += 4;
  if (lead.phone || lead.whatsapp) score += 8;
  if ((lead.message ?? "").length > 80) score += 5;

  const source = (lead.source ?? "website").toLowerCase();
  if (source.includes("whatsapp")) score += 8;
  else if (source.includes("referral")) score += 10;
  else if (source.includes("contact") || source.includes("project") || source.includes("market")) score += 6;

  if (lead.campaign) score += 3;

  return Math.min(100, score);
}
