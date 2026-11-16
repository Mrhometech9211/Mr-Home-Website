CREATE TABLE "site_pages" (
	"slug" text PRIMARY KEY NOT NULL,
	"draft" jsonb DEFAULT '{"sections":{},"seo":{}}'::jsonb NOT NULL,
	"published" jsonb DEFAULT '{"sections":{},"seo":{}}'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "price_checked_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "payment_plan" text;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "payment_plan_source" text;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "handover_source" text;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "developer_approval" text;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "project_approval" text;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "verification_checks" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "verification_source" text;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "verification_reviewer" text;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "verification_checked_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE "market_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"market_id" integer,
	"city" text,
	"metric" text NOT NULL,
	"value" numeric NOT NULL,
	"unit" text,
	"period" text NOT NULL,
	"currency" text,
	"method" text,
	"source_url" text,
	"checked_at" timestamp with time zone NOT NULL,
	"kind" text DEFAULT 'historical' NOT NULL,
	"assumptions" text,
	"limitations" text,
	"published" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "market_metrics" ADD CONSTRAINT "market_metrics_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "market_metrics_market_idx" ON "market_metrics" USING btree ("market_id");
--> statement-breakpoint
CREATE INDEX "market_metrics_published_idx" ON "market_metrics" USING btree ("published");
--> statement-breakpoint
ALTER TABLE "news_articles" ADD COLUMN "sources" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "news_articles" ADD COLUMN "social_image" text;
