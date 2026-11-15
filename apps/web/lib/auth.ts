import "server-only";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as schema from "@x-intelligence/db";
import { getWebDatabase } from "@/lib/database";

type AuthInstance = ReturnType<typeof betterAuth>;

const globalForAuth = globalThis as typeof globalThis & {
  xIntelligenceAuth?: AuthInstance;
};

export function getAuth(): AuthInstance {
  if (globalForAuth.xIntelligenceAuth) return globalForAuth.xIntelligenceAuth;

  const database = getWebDatabase();
  if (!database) throw new Error("DATABASE_URL is required for authentication");

  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
  }

  const configuredBaseURL = process.env.BETTER_AUTH_URL?.trim();
  if (process.env.NODE_ENV === "production" && !configuredBaseURL) {
    throw new Error("BETTER_AUTH_URL is required in production");
  }
  const baseURL = configuredBaseURL || "http://localhost:3000";
  const trustedOrigins = new Set([baseURL]);
  if (process.env.NODE_ENV !== "production") {
    trustedOrigins.add("http://localhost:3000");
    trustedOrigins.add("http://127.0.0.1:3000");
  }
  const options: BetterAuthOptions = {
    appName: "X Intelligence",
    baseURL,
    secret,
    trustedOrigins: [...trustedOrigins],
    database: drizzleAdapter(database.db, {
      provider: "pg",
      schema: {
        user: schema.authUser,
        session: schema.authSession,
        account: schema.authAccount,
        verification: schema.authVerification,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    telemetry: { enabled: false },
  };
  const auth = betterAuth(options);
  globalForAuth.xIntelligenceAuth = auth;
  return auth;
}
