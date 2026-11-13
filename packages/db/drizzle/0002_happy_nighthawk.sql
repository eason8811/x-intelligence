CREATE TYPE "public"."classification_attempt_status" AS ENUM('PROCESSING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TABLE "post_classification_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"provider" text NOT NULL,
	"classifier" text NOT NULL,
	"model_requested" text NOT NULL,
	"model_returned" text,
	"request_snapshot" jsonb NOT NULL,
	"response_snapshot" jsonb,
	"status" "classification_attempt_status" DEFAULT 'PROCESSING' NOT NULL,
	"error_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "classification_attempt_number_positive" CHECK ("post_classification_attempt"."attempt_number" > 0),
	CONSTRAINT "classification_attempt_terminal_fields" CHECK (("post_classification_attempt"."status" = 'PROCESSING' AND "post_classification_attempt"."completed_at" IS NULL AND "post_classification_attempt"."error_code" IS NULL) OR ("post_classification_attempt"."status" = 'SUCCEEDED' AND "post_classification_attempt"."completed_at" IS NOT NULL AND "post_classification_attempt"."response_snapshot" IS NOT NULL AND "post_classification_attempt"."model_returned" IS NOT NULL AND "post_classification_attempt"."error_code" IS NULL) OR ("post_classification_attempt"."status" = 'FAILED' AND "post_classification_attempt"."completed_at" IS NOT NULL AND "post_classification_attempt"."error_code" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "post_classification_attempt" ADD CONSTRAINT "post_classification_attempt_post_id_x_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."x_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "post_classification_attempt_post_attempt_unique_idx" ON "post_classification_attempt" USING btree ("post_id","attempt_number");--> statement-breakpoint
CREATE INDEX "post_classification_attempt_status_started_idx" ON "post_classification_attempt" USING btree ("status","started_at");