-- Buy/Rent tagging for projects (sale = /buy, rent = /rent).
ALTER TABLE "projects" ADD COLUMN "purpose" text DEFAULT 'sale' NOT NULL;
--> statement-breakpoint
-- Area entered with the admin unit picker; the legacy "area" text column stays for old rows.
ALTER TABLE "projects" ADD COLUMN "area_value" numeric;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "area_unit" text;
--> statement-breakpoint
CREATE INDEX "projects_purpose_idx" ON "projects" USING btree ("purpose");
