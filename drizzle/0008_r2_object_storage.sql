-- Phase 9 — R2 object storage for admin uploads (media library + brochures).
-- Additive only: existing rows stay on the Postgres bytea path (storage='db')
-- and continue to be served exactly as before. New uploads go through
-- presigned direct-to-R2 transfers and are recorded alongside the DB payload
-- column so legacy rows and R2 rows coexist without destructive migration.

ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "storage" text NOT NULL DEFAULT 'db';
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "storage_key" text;
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'ready';
--> statement-breakpoint
ALTER TABLE "brochures" ADD COLUMN IF NOT EXISTS "storage" text NOT NULL DEFAULT 'db';
--> statement-breakpoint
ALTER TABLE "brochures" ADD COLUMN IF NOT EXISTS "storage_key" text;
--> statement-breakpoint
ALTER TABLE "brochures" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'ready';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_status_idx" ON "media" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brochures_status_idx" ON "brochures" ("status");
