-- Phase 8: Ready / Off-Plan status filter for the marketplace (Provident parity).
ALTER TABLE "properties" ADD COLUMN "completion" text;
--> statement-breakpoint
-- Backfill previously seeded rows from their availability copy.
UPDATE "properties"
SET "completion" = CASE
  WHEN "availability" ILIKE '%handover%'
    OR "availability" ILIKE '%2026%'
    OR "availability" ILIKE '%2027%'
    OR "availability" ILIKE '%moving in%'
  THEN 'offplan'
  ELSE 'ready'
END
WHERE "completion" IS NULL;
