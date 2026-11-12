import { config } from "dotenv";
import { createDatabase, failStaleClassifications } from "@x-intelligence/db";
import { ClassifierError } from "@x-intelligence/classifier";
import {
  DEFAULT_JEV_MODEL,
  JevPostClassifier,
} from "@x-intelligence/classifier/jev-classifier";
import { fileURLToPath } from "node:url";
import { classifyPendingBatch } from "./classify";

const envPath = fileURLToPath(new URL("../../../../.env", import.meta.url));

class ClassificationCliError extends Error {
  constructor(
    public readonly code:
      | "INVALID_ARGUMENT"
      | "DATABASE_CONFIG_MISSING"
      | "JEV_API_KEY_MISSING",
  ) {
    super(code);
  }
}

function parseArguments(args: string[]): {
  count: number;
  retryFailed: boolean;
} {
  let count = 5;
  let retryFailed = false;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const option = args[index];
    if (option === "--retry-failed") {
      if (seen.has(option)) throw new ClassificationCliError("INVALID_ARGUMENT");
      seen.add(option);
      retryFailed = true;
      continue;
    }
    const value = args[index + 1];
    if (
      option !== "--count" ||
      !value ||
      !/^\d+$/.test(value) ||
      seen.has(option)
    ) {
      throw new ClassificationCliError("INVALID_ARGUMENT");
    }
    seen.add(option);
    count = Number(value);
    index++;
  }
  if (!Number.isInteger(count) || count < 1 || count > 20) {
    throw new ClassificationCliError("INVALID_ARGUMENT");
  }
  return { count, retryFailed };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "pnpm x:classify [--count 5] [--retry-failed]\n从 PostgreSQL 读取 PENDING 帖子，通过 TypeSafe Jev 分类并写回；默认最多处理 5 条，单次最多 20 条。失败不会自动重试，--retry-failed 会明确重试 FAILED 记录。",
    );
    return;
  }

  const { count, retryFailed } = parseArguments(args);
  config({ path: envPath, quiet: true });
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new ClassificationCliError("DATABASE_CONFIG_MISSING");
  }
  const apiKey = process.env.JEV_API_KEY;
  if (!apiKey) throw new ClassificationCliError("JEV_API_KEY_MISSING");
  const classifier = new JevPostClassifier(
    apiKey,
    process.env.JEV_MODEL ?? DEFAULT_JEV_MODEL,
  );

  const { db, pool } = createDatabase(connectionString);
  try {
    const staleFailed = await failStaleClassifications(db);
    const result = await classifyPendingBatch(
      db,
      classifier,
      count,
      retryFailed,
    );
    console.log(
      `分类批次完成：认领 ${result.claimed} 条，成功 ${result.classified} 条，失败 ${result.failed} 条；超时遗留记录转为 FAILED：${staleFailed} 条。`,
    );
    if (result.failed > 0) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  if (error instanceof ClassificationCliError) {
    console.error(error.code);
  } else if (error instanceof ClassifierError) {
    console.error(`JEV_CLASSIFICATION_FAILED:${error.code}`);
  } else {
    console.error(
      "JEV_CLASSIFICATION_FAILED:CLASSIFICATION_JOB_FAILED；未输出原始异常或帖子内容。",
    );
  }
  process.exitCode = 1;
});
