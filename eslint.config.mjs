import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";
export default defineConfig([
  globalIgnores([
    "**/.next/**",
    "**/dist/**",
    "**/node_modules/**",
    "**/next-env.d.ts",
    "**/drizzle/meta/**",
  ]),
  ...nextVitals.map((config) => ({
    ...config,
    files: ["apps/**/*.{ts,tsx,js,mjs}"],
  })),
  ...nextTypescript.map((config) => ({
    ...config,
    files: ["apps/**/*.{ts,tsx,js,mjs}"],
  })),
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["packages/**/*.ts"],
  })),
]);
