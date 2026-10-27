-- Phase 11 — Universal visual builder.
-- Additive only: existing pages keep their stored section arrays (which still
-- parse under the extended model), and projects keep rendering their legacy
-- detail layout until an administrator saves builder sections.

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "builder_draft" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "builder_published" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "builder_blocks" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "category" text,
  "description" text,
  "section" jsonb NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "builder_blocks_category_idx" ON "builder_blocks" ("category");
