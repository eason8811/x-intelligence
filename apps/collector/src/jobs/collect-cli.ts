import { createDatabase } from "@x-intelligence/db";
import {
  TwitterMonitorForYouSource,
  XSourceError,
  type XCredentials,
} from "@x-intelligence/x";
import {
  AuthStateError,
  hasXAuthCookies,
  loadXAuthState,
  type AuthState,
} from "../auth/state";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import {
  collectForYouToDatabase,
  PersistedCollectionError,
} from "./collect";

const envPath = fileURLToPath(
  new URL("../../../../.env", import.meta.url),
);
const collectionTimeoutMs = 120_000;

class CollectCliError extends Error {
  constructor(
    public readonly code:
      | "INVALID_ARGUMENT"
      | "DATABASE_CONFIG_MISSING"
      | "ENCRYPTION_KEY_MISSING"
      | "AUTH_STATE_MISSING"
      | "AUTH_STATE_INVALID",
  ) {
    super(code);
  }
}

function parseArguments(args: string[]): { count: number; pages: number } {
  let count = 20;
  let pages = 1;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (
      !["--count", "--pages"].includes(option) ||
      !value ||
      !/^\d+$/.test(value) ||
      seen.has(option)
    ) {
      throw new CollectCliError("INVALID_ARGUMENT");
    }
    seen.add(option);
    if (option === "--count") count = Number(value);
    else pages = Number(value);
  }
  if (
    !Number.isInteger(count) || count < 1 || count > 20 ||
    !Number.isInteger(pages) || pages < 1 || pages > 3
  ) {
    throw new CollectCliError("INVALID_ARGUMENT");
  }
  return { count, pages };
}

function credentialsFromState(state: AuthState): XCredentials {
  if (!hasXAuthCookies(state)) {
    throw new CollectCliError("AUTH_STATE_INVALID");
  }
  const readCookie = (name: "auth_token" | "ct0"): string => {
    const now = Date.now();
    const matches = state.cookies.filter((cookie) =>
      cookie.name === name &&
      (cookie.domain === "x.com" || cookie.domain === ".x.com") &&
      cookie.path === "/" &&
      cookie.secure &&
      (cookie.expires === -1 || cookie.expires * 1000 > now)
    );
    if (matches.length !== 1 || !matches[0].value) {
      throw new CollectCliError("AUTH_STATE_INVALID");
    }
    return matches[0].value;
  };
  return {
    authToken: readCookie("auth_token"),
    csrfToken: readCookie("ct0"),
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "pnpm x:collect:run [--count 20] [--pages 1]\n读取 PostgreSQL 中的加密 X 会话，手动采集 For You 并持久化到 x_post/feed_run/feed_observation；新帖子创建 PENDING 分类记录。不调用 Jev、不启动 Cron。每次请求最多 count=20、pages=1..3；X 实际返回条数可能超过 count。",
    );
    return;
  }
  const { count, pages } = parseArguments(args);
  config({ path: envPath, quiet: true });
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new CollectCliError("DATABASE_CONFIG_MISSING");
  }
  const encryptionKey = process.env.X_AUTH_ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new CollectCliError("ENCRYPTION_KEY_MISSING");
  }

  const { db, pool } = createDatabase(connectionString);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timer = setTimeout(cancel, collectionTimeoutMs);
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);

  try {
    const saved = await loadXAuthState(db, encryptionKey);
    if (!saved) throw new CollectCliError("AUTH_STATE_MISSING");
    const result = await collectForYouToDatabase(
      db,
      new TwitterMonitorForYouSource(credentialsFromState(saved.state)),
      count,
      pages,
      controller.signal,
    );

    console.log(
      `采集运行 ${result.runId} 已保存：${result.observations.length} 条帖子，${result.pagesFetched} 页，跨页重复 ${result.duplicateCount} 条，跳过条目 ${result.skippedEntries}，停止原因 ${result.stopReason}。`,
    );
  } finally {
    clearTimeout(timer);
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
    await pool.end();
  }
}

main().catch((error: unknown) => {
  if (error instanceof CollectCliError || error instanceof AuthStateError) {
    console.error(error.code);
  } else if (error instanceof PersistedCollectionError) {
    console.error(
      `FOR_YOU_COLLECTION_FAILED:${error.code}; runId=${error.runId}; 未输出凭证、帖子正文或原始异常。`,
    );
  } else if (error instanceof XSourceError) {
    console.error(
      `FOR_YOU_COLLECTION_FAILED:${error.code}; 未输出 Cookie 或原始异常。`,
    );
  } else {
    console.error(
      "FOR_YOU_COLLECTION_FAILED:COLLECTION_FAILED；未输出原始异常或认证参数。",
    );
  }
  process.exitCode = 1;
});
