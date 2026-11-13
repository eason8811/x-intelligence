import "server-only";
import { config } from "dotenv";
import { resolve } from "node:path";
import { createDatabase } from "@x-intelligence/db";

if (process.env.NODE_ENV === "development") {
  config({ path: resolve(process.cwd(), "../../.env"), quiet: true });
}

type DatabaseConnection = ReturnType<typeof createDatabase>;

const globalForDatabase = globalThis as typeof globalThis & {
  xIntelligenceDatabase?: DatabaseConnection;
};

export function getWebDatabase(): DatabaseConnection | null {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) return null;

  globalForDatabase.xIntelligenceDatabase ??=
    createDatabase(connectionString);
  return globalForDatabase.xIntelligenceDatabase;
}
