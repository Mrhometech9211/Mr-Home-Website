ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "parent_id" integer;
--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "pages"("id") ON DELETE set null ON UPDATE cascade;
