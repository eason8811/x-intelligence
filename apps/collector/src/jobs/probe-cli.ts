import { randomUUID } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import {
  TwitterMonitorForYouSource,
  XSourceError,
  type XCredentials,
} from "@x-intelligence/x";
import { createDatabase } from "@x-intelligence/db";
import {
  AuthStateError,
  hasXAuthCookies,
  loadXAuthState,
  type AuthState,
} from "../auth/state";
import { probeForYou } from "./probe";

const envPath = fileURLToPath(
  new URL("../../../../.env", import.meta.url),
);
const outputPath = fileURLToPath(
  new URL("../../../../debug-artifacts/x-probe/", import.meta.url),
);
const upstreamCommit = "dd8de94e3e2853beb7b5e5b785f1908c2cafea4b";
const probeTimeoutMs = 120_000;

class ProbeCliError extends Error {
  constructor(public readonly code:
    | "INVALID_ARGUMENT"
    | "DATABASE_CONFIG_MISSING"
    | "ENCRYPTION_KEY_MISSING"
    | "AUTH_STATE_MISSING"
    | "AUTH_STATE_INVALID") {
    super(code);
  }
}

function parseArguments(args: string[]): { count: number; pages: number } {
  let count = 5;
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
      throw new ProbeCliError("INVALID_ARGUMENT");
    }
    seen.add(option);
    if (option === "--count") count = Number(value);
    else pages = Number(value);
  }
  if (
    !Number.isInteger(count) || count < 1 || count > 20 ||
    !Number.isInteger(pages) || pages < 1 || pages > 3
  ) {
    throw new ProbeCliError("INVALID_ARGUMENT");
  }
  return { count, pages };
}

function credentialsFromState(state: AuthState): XCredentials {
  if (!hasXAuthCookies(state)) {
    throw new ProbeCliError("AUTH_STATE_INVALID");
  }
  const authToken = state.cookies.find((cookie) => cookie.name === "auth_token");
  const csrfToken = state.cookies.find((cookie) => cookie.name === "ct0");
  if (
    typeof authToken?.value !== "string" ||
    typeof csrfToken?.value !== "string"
  ) {
    throw new ProbeCliError("AUTH_STATE_INVALID");
  }
  return { authToken: authToken.value, csrfToken: csrfToken.value };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "pnpm x:collect:probe [--count 5] [--pages 1]\n读取 PostgreSQL 中加密会话，仅在内存中使用 auth_token/ct0，通过固定 twitter-monitor 核心请求授权 For You。count=1..20，pages=1..3；不重试、不写业务数据库、不调用 Jev。结果写入被 Git 忽略的 debug-artifacts/x-probe/，包含帖子内容，请按私有数据保管。推荐顺序保持未验证。",
    );
    return;
  }
  const { count, pages } = parseArguments(args);
  config({ path: envPath, quiet: true });
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new ProbeCliError("DATABASE_CONFIG_MISSING");
  }
  const encryptionKey = process.env.X_AUTH_ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new ProbeCliError("ENCRYPTION_KEY_MISSING");
  }

  const { db, pool } = createDatabase(connectionString);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timer = setTimeout(cancel, probeTimeoutMs);
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);

  try {
    const saved = await loadXAuthState(db, encryptionKey);
    if (!saved) throw new ProbeCliError("AUTH_STATE_MISSING");
    const credentials = credentialsFromState(saved.state);
    const result = await probeForYou(
      new TwitterMonitorForYouSource(credentials),
      count,
      pages,
      controller.signal,
    );

    await mkdir(outputPath, { recursive: true, mode: 0o700 });
    await chmod(outputPath, 0o700);
    const fileName = `${randomUUID()}.json`;
    const outputFile = join(outputPath, fileName);
    await writeFile(
      outputFile,
      `${JSON.stringify({
        source: "twitter-monitor",
        upstreamCommit,
        sessionLabel: saved.username,
        createdAt: new Date().toISOString(),
        requestedCount: count,
        requestedPages: pages,
        orderVerified: false,
        ...result,
      }, null, 2)}\n`,
      { mode: 0o600, flag: "wx" },
    );

    console.log(
      `已获取 ${result.observations.length} 条帖子、${result.pagesFetched} 页；跨页重复 ${result.duplicateCount} 条，停止原因 ${result.stopReason}。`,
    );
    console.log(
      `结果已写入 debug-artifacts/x-probe/${fileName}；推荐顺序仍未验证，未写入业务数据库。`,
    );
    if (!result.observations.length) process.exitCode = 1;
  } finally {
    clearTimeout(timer);
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
    await pool.end();
  }
}

main().catch((error: unknown) => {
  if (error instanceof ProbeCliError || error instanceof AuthStateError) {
    console.error(error.code);
  } else if (error instanceof XSourceError) {
    console.error(
      `FOR_YOU_PROBE_FAILED:${error.code}；不会自动重试，未输出 Cookie 或原始异常。`,
    );
  } else {
    console.error(
      "FOR_YOU_PROBE_FAILED：未输出原始异常或认证参数；请检查数据库、网络及本地文件权限。",
    );
  }
  process.exitCode = 1;
});
