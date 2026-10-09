CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"price_cents" integer NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"image_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "products_price_positive" CHECK ("products"."price_cents" > 0),
	CONSTRAINT "products_stock_not_negative" CHECK ("products"."stock" >= 0)
);
--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category");