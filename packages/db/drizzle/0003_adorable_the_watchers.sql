CREATE TYPE "public"."x_account_status" AS ENUM('LEGACY_UNCLAIMED', 'CONNECTED', 'REAUTH_REQUIRED');--> statement-breakpoint
CREATE TABLE "app_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "app_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "app_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "x_account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"x_user_id" text,
	"username" text NOT NULL,
	"status" "x_account_status" NOT NULL,
	"encryption_version" integer,
	"nonce" text,
	"ciphertext" text,
	"auth_tag" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "x_account_ownership_and_session_state" CHECK (("x_account"."status" = 'LEGACY_UNCLAIMED' AND "x_account"."user_id" IS NULL) OR ("x_account"."status" = 'CONNECTED' AND "x_account"."user_id" IS NOT NULL AND "x_account"."x_user_id" IS NOT NULL AND "x_account"."encryption_version" IS NOT NULL AND "x_account"."nonce" IS NOT NULL AND "x_account"."ciphertext" IS NOT NULL AND "x_account"."auth_tag" IS NOT NULL) OR ("x_account"."status" = 'REAUTH_REQUIRED' AND "x_account"."user_id" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO "x_account" ("id", "username", "status")
SELECT 'x-primary',
	COALESCE((SELECT "username" FROM "x_auth_session" WHERE "account_key" = 'x-primary'), 'legacy'),
	'LEGACY_UNCLAIMED'
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "feed_run" ADD COLUMN "x_account_id" text DEFAULT 'x-primary' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_account" ADD CONSTRAINT "app_account_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_session" ADD CONSTRAINT "app_session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x_account" ADD CONSTRAINT "x_account_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_account_user_id_idx" ON "app_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "app_session_user_id_idx" ON "app_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "app_verification_identifier_idx" ON "app_verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "x_account_user_id_idx" ON "x_account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "x_account_x_user_id_unique_idx" ON "x_account" USING btree ("x_user_id") WHERE "x_account"."x_user_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_run" ADD CONSTRAINT "feed_run_x_account_id_x_account_id_fk" FOREIGN KEY ("x_account_id") REFERENCES "public"."x_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feed_run_x_account_started_idx" ON "feed_run" USING btree ("x_account_id","started_at");
