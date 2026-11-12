CREATE TABLE IF NOT EXISTS "media_folders" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"parent_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_folders_parent_idx" ON "media_folders" USING btree ("parent_id");
--> statement-breakpoint
ALTER TABLE "media_folders" ADD CONSTRAINT "media_folders_parent_id_media_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."media_folders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "folder_id" integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_folder_idx" ON "media" USING btree ("folder_id");
