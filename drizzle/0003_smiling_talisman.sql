CREATE TABLE "brochures" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"filename" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text DEFAULT 'application/pdf' NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea",
	"allow_download" boolean DEFAULT true NOT NULL,
	"downloads" integer DEFAULT 0 NOT NULL,
	"uploaded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"builtin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "news_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"body" text DEFAULT '' NOT NULL,
	"category" text,
	"market_id" integer,
	"country" text,
	"author" text,
	"author_role" text,
	"cover_image" text,
	"cover_image_alt" text,
	"video_url" text,
	"featured" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"seo_title" text,
	"seo_description" text,
	"seo_keywords" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_articles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "page_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_id" integer NOT NULL,
	"user_id" integer,
	"user_name" text,
	"headline" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"nav_label" text,
	"nav_order" integer DEFAULT 0 NOT NULL,
	"nav_visible" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"draft" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"seo_title" text,
	"seo_description" text,
	"no_index" boolean DEFAULT false NOT NULL,
	"og_image" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"purpose" text DEFAULT 'sale' NOT NULL,
	"market_id" integer,
	"country" text,
	"city" text,
	"address" text,
	"property_type" text,
	"price" numeric,
	"currency" text DEFAULT 'USD' NOT NULL,
	"rent_period" text,
	"bedrooms" integer,
	"bathrooms" integer,
	"area_sqm" numeric,
	"furnished" text,
	"availability" text,
	"short_description" text,
	"description" text,
	"amenities" jsonb DEFAULT '[]'::jsonb,
	"featured" boolean DEFAULT false NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"cover_image" text,
	"gallery" jsonb DEFAULT '[]'::jsonb,
	"seo_title" text,
	"seo_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "properties_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "custom_role_id" integer;--> statement-breakpoint
ALTER TABLE "brochures" ADD CONSTRAINT "brochures_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brochures" ADD CONSTRAINT "brochures_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brochures_project_idx" ON "brochures" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "news_published_idx" ON "news_articles" USING btree ("published");--> statement-breakpoint
CREATE INDEX "news_market_idx" ON "news_articles" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "page_revisions_page_idx" ON "page_revisions" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "properties_purpose_idx" ON "properties" USING btree ("purpose");--> statement-breakpoint
CREATE INDEX "properties_published_idx" ON "properties" USING btree ("published");--> statement-breakpoint
CREATE INDEX "properties_market_idx" ON "properties" USING btree ("market_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_custom_role_id_custom_roles_id_fk" FOREIGN KEY ("custom_role_id") REFERENCES "public"."custom_roles"("id") ON DELETE set null ON UPDATE no action;