-- Private planner items for meetings, tasks and browser-delivered reminders.
CREATE TABLE IF NOT EXISTS "planner_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "owner_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "kind" text DEFAULT 'task' NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone,
  "reminder_at" timestamp with time zone,
  "alarm_enabled" boolean DEFAULT false NOT NULL,
  "sound" text DEFAULT 'chime' NOT NULL,
  "done" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "planner_owner_start_idx" ON "planner_items" USING btree ("owner_id", "starts_at");
