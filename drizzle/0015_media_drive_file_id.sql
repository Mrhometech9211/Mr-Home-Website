ALTER TABLE "media" ADD COLUMN "drive_file_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "media_drive_file_idx" ON "media" ("drive_file_id") WHERE "drive_file_id" IS NOT NULL;
