import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
config({ path: "../../.env", quiet: true });
if (process.argv.includes("migrate") && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to apply migrations");
}
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  ...(process.env.DATABASE_URL
    ? { dbCredentials: { url: process.env.DATABASE_URL } }
    : {}),
});
