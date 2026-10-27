-- Phase 10 — AI Sales Offer Generator.
-- Additive only. No existing table, row, column or object is dropped or
-- rewritten. Existing projects/leads/media/brochures keep working unchanged.
-- Generated offer PDFs prefer R2 (`pdf_storage_key`); `pdf_data` is a fallback
-- for deployments without R2 so PDF generation never depends on object storage.

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "developer_logo" text;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "project_units" (
  "id" serial PRIMARY KEY,
  "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "unit_no" text NOT NULL,
  "unit_type" text,
  "bedrooms" text,
  "area" numeric,
  "area_unit" text,
  "floor" text,
  "view" text,
  "price" numeric,
  "currency" text NOT NULL DEFAULT 'AED',
  "status" text NOT NULL DEFAULT 'available',
  "notes" text,
  "source" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "project_units_project_unit_unique" UNIQUE ("project_id", "unit_no")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_units_project_idx" ON "project_units" ("project_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sales_offers" (
  "id" serial PRIMARY KEY,
  "reference" text NOT NULL UNIQUE,
  "lead_id" integer REFERENCES "leads"("id") ON DELETE SET NULL,
  "project_id" integer REFERENCES "projects"("id") ON DELETE SET NULL,
  "unit_id" integer REFERENCES "project_units"("id") ON DELETE SET NULL,
  "revised_from" integer,
  "status" text NOT NULL DEFAULT 'draft',
  "title" text,
  "customer" jsonb,
  "unit" jsonb,
  "terms" jsonb,
  "options" jsonb,
  "conversation" jsonb,
  "current_version" integer NOT NULL DEFAULT 0,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_by" integer,
  "approved_by" integer,
  "approved_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_offers_status_idx" ON "sales_offers" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_offers_lead_idx" ON "sales_offers" ("lead_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_offers_project_idx" ON "sales_offers" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_offers_created_idx" ON "sales_offers" ("created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sales_offer_versions" (
  "id" serial PRIMARY KEY,
  "offer_id" integer NOT NULL REFERENCES "sales_offers"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "batch_id" text,
  "status" text NOT NULL DEFAULT 'ready_for_review',
  "snapshot" jsonb NOT NULL,
  "calculations" jsonb NOT NULL,
  "validation" jsonb,
  "pdf_storage_key" text,
  "pdf_filename" text,
  "pdf_mime" text NOT NULL DEFAULT 'application/pdf',
  "pdf_size" integer,
  "pdf_data" bytea,
  "created_by" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "sales_offer_versions_offer_version_unique" UNIQUE ("offer_id", "version")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_offer_versions_offer_idx" ON "sales_offer_versions" ("offer_id");
