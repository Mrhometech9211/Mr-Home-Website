-- Phase 12 — the universal builder reaches editorial content.
-- Additive only: markets and news articles keep their existing fields and
-- render exactly as before until an administrator publishes builder sections
-- for that record. No row is rewritten or dropped.

ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "builder_draft" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "builder_published" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "news_articles" ADD COLUMN IF NOT EXISTS "builder_draft" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "news_articles" ADD COLUMN IF NOT EXISTS "builder_published" jsonb DEFAULT '[]'::jsonb NOT NULL;
