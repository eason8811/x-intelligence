import { config } from "dotenv";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "patchright";
import { createDatabase } from "@x-intelligence/db";
import {
  AuthStateError,
  hasXAuthCookies,
  isXHome,
  loadXAuthState,
} from "./state";

const envPath = fileURLToPath(
  new URL("../../../../.env", import.meta.url),
);
const verifyTimeoutMs = 15 * 60 * 1000;

class AuthVerifyError extends Error {
  constructor(public readonly code:
    | "AUTH_VERIFY_INVALID_ARGUMENT"
    | "AUTH_VERIFY_INTERACTIVE_TERMINAL_REQUIRED"
    | "AUTH_VERIFY_DATABASE_CONFIG_MISSING"
    | "AUTH_VERIFY_ENCRYPTION_KEY_MISSING"
    | "AUTH_VERIFY_SESSION_NOT_FOUND"
    | "AUTH_VERIFY_SESSION_COOKIES_NOT_RESTORED"
    | "AUTH_VERIFY_X_HOME_NOT_REACHED"
    | "AUTH_VERIFY_ACCOUNT_NOT_CONFIRMED"
    | "AUTH_VERIFY_CANCELLED") {
    super(code);
  }
}

function ask(
  question: string,
  signal: AbortSignal,
  cancel: () => void,
): Promise<string> {
  if (signal.aborted) throw new AuthVerifyError("AUTH_VERIFY_CANCELLED");
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  terminal.once("SIGINT", cancel);
  const close = () => terminal.close();
  signal.addEventListener("abort", close, { once: true });
  return terminal
    .question(question, { signal })
    .catch((error: unknown) => {
      if (signal.aborted) throw new AuthVerifyError("AUTH_VERIFY_CANCELLED");
      throw error;
    })
    .finally(() => {
      signal.removeEventListener("abort", close);
      terminal.close();
    });
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    console.log(
      "pnpm x:auth:verify\n从 PostgreSQL 读取并解密已保存的 X 浏览器会话，在隔离的 Chrome 上下文中打开 X 首页供你核对账号。此命令不会修改数据库或将明文会话写入文件。",
    );
    return;
  }
  if (process.argv.length > 2) {
    throw new AuthVerifyError("AUTH_VERIFY_INVALID_ARGUMENT");
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new AuthVerifyError("AUTH_VERIFY_INTERACTIVE_TERMINAL_REQUIRED");
  }

  config({ path: envPath, quiet: true });
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new AuthVerifyError("AUTH_VERIFY_DATABASE_CONFIG_MISSING");
  }
  const encryptionKey = process.env.X_AUTH_ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new AuthVerifyError("AUTH_VERIFY_ENCRYPTION_KEY_MISSING");
  }

  const { db, pool } = createDatabase(connectionString);
  const controller = new AbortController();
  let browser: Browser | undefined;
  const cancel = () => {
    controller.abort();
    if (browser) void browser.close().catch(() => undefined);
  };
  const timer = setTimeout(cancel, verifyTimeoutMs);
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);

  try {
    const saved = await loadXAuthState(db, encryptionKey);
    if (!saved) throw new AuthVerifyError("AUTH_VERIFY_SESSION_NOT_FOUND");

    browser = await chromium.launch({ channel: "chrome", headless: false });
    const context = await browser.newContext({ storageState: saved.state });
    if (!hasXAuthCookies(await context.storageState())) {
      throw new AuthVerifyError("AUTH_VERIFY_SESSION_COOKIES_NOT_RESTORED");
    }
    const page = await context.newPage();
    await page.goto("https://x.com/home", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(5_000);
    if (!isXHome(page.url())) {
      throw new AuthVerifyError("AUTH_VERIFY_X_HOME_NOT_REACHED");
    }

    console.log(
      `Chrome 已使用数据库中的会话打开 X 首页。请在浏览器中核对当前账号是否为 @${saved.username}。`,
    );
    const confirmation = await ask(
      "确认浏览器中显示的是目标账号？输入 yes：",
      controller.signal,
      cancel,
    );
    if (confirmation.trim() !== "yes") {
      throw new AuthVerifyError("AUTH_VERIFY_ACCOUNT_NOT_CONFIRMED");
    }
    console.log(
      `@${saved.username} 的数据库会话已在独立浏览器上下文中复用；数据库未修改。`,
    );
  } finally {
    clearTimeout(timer);
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
    if (browser) await browser.close().catch(() => undefined);
    await pool.end();
  }
}

main().catch((error: unknown) => {
  if (error instanceof AuthVerifyError || error instanceof AuthStateError) {
    console.error(error.code);
  } else {
    console.error(
      "AUTH_VERIFY_FAILED：未能验证数据库会话复用；未输出会话、Cookie 或原始异常。",
    );
  }
  process.exitCode = 1;
});
