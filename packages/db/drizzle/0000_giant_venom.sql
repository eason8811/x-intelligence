CREATE TYPE "public"."classification_status" AS ENUM('PENDING', 'PROCESSING', 'CLASSIFIED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."feed_run_status" AS ENUM('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."topic" AS ENUM('ai', 'programming', 'product', 'startup', 'finance', 'gaming', 'design', 'science', 'news', 'life', 'other');--> statement-breakpoint
CREATE TABLE "feed_observation" (
	"run_id" uuid NOT NULL,
	"post_id" text NOT NULL,
	"position" integer NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "feed_observation_run_id_post_id_pk" PRIMARY KEY("run_id","post_id"),
	CONSTRAINT "feed_observation_position_positive" CHECK ("feed_observation"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "feed_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "feed_run_status" DEFAULT 'RUNNING' NOT NULL,
	"target_count" integer NOT NULL,
	"collected_count" integer DEFAULT 0 NOT NULL,
	"scroll_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	CONSTRAINT "feed_run_counts_nonnegative" CHECK ("feed_run"."target_count" > 0 AND "feed_run"."collected_count" >= 0 AND "feed_run"."scroll_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "post_classification" (
	"post_id" text PRIMARY KEY NOT NULL,
	"topic" "topic",
	"tags" text[] DEFAULT '{}' NOT NULL,
	"relevance_score" double precision,
	"classifier" text,
	"classifier_version" text,
	"status" "classification_status" DEFAULT 'PENDING' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"classified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classification_relevance_range" CHECK ("post_classification"."relevance_score" >= 0 AND "post_classification"."relevance_score" <= 1),
	CONSTRAINT "classification_retry_nonnegative" CHECK ("post_classification"."retry_count" >= 0),
	CONSTRAINT "classified_result_required" CHECK ("post_classification"."status" <> 'CLASSIFIED' OR ("post_classification"."topic" IS NOT NULL AND "post_classification"."relevance_score" IS NOT NULL AND "post_classification"."classifier" IS NOT NULL AND "post_classification"."classifier_version" IS NOT NULL AND "post_classification"."classified_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "x_post" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text,
	"username" text,
	"author_name" text,
	"text" text NOT NULL,
	"lang" text,
	"published_at" timestamp with time zone,
	"url" text NOT NULL,
	"quoted_post_id" text,
	"quoted_text" text,
	"media_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feed_observation" ADD CONSTRAINT "feed_observation_run_id_feed_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."feed_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_observation" ADD CONSTRAINT "feed_observation_post_id_x_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."x_post"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_classification" ADD CONSTRAINT "post_classification_post_id_x_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."x_post"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feed_observation_post_idx" ON "feed_observation" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "post_classification_status_idx" ON "post_classification" USING btree ("status");