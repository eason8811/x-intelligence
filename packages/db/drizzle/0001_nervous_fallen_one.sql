CREATE TABLE "x_auth_session" (
	"account_key" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"encryption_version" integer NOT NULL,
	"nonce" text NOT NULL,
	"ciphertext" text NOT NULL,
	"auth_tag" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
