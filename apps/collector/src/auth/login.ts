import { config } from "dotenv";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "patchright";
import { createDatabase } from "@x-intelligence/db";
import {
  AuthStateError,
  getStoredXAuthSession,
  hasXAuthCookies,
  isXHome,
  saveXAuthState,
  type AuthState,
} from "./state";

const envPath = fileURLToPath(
  new URL("../../../../.env", import.meta.url),
);
const loginTimeoutMs = 15 * 60 * 1000;

class AuthCliError extends Error {
  constructor(public readonly code:
    | "AUTH_CANCELLED"
    | "AUTH_INVALID_ARGUMENT"
    | "AUTH_INTERACTIVE_TERMINAL_REQUIRED"
    | "AUTH_DATABASE_CONFIG_MISSING"
    | "AUTH_ENCRYPTION_KEY_MISSING"
    | "AUTH_ACCOUNT_LABEL_INVALID"
    | "AUTH_NOT_CONFIRMED"
    | "AUTH_LOGIN_PAGE_NOT_REACHED") {
    super(code);
  }
}

function ask(
  question: string,
  signal: AbortSignal,
  cancel: () => void,
): Promise<string> {
  if (signal.aborted) throw new AuthCliError("AUTH_CANCELLED");
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
      if (signal.aborted) throw new AuthCliError("AUTH_CANCELLED");
      throw error;
    })
    .finally(() => {
      signal.removeEventListener("abort", close);
      terminal.close();
    });
}

function accountLabel(value: string): string {
  const normalized = value.trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{1,15}$/.test(normalized)) {
    throw new AuthCliError("AUTH_ACCOUNT_LABEL_INVALID");
  }
  return normalized;
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    console.log(
      "pnpm x:auth\n打开 Patchright Chromium，由用户在窗口中手动完成 X 登录。\n验证 x.com 首页及 auth_token/ct0 后，将浏览器 storageState 加密保存到 PostgreSQL。\n密码和验证码只在浏览器中输入，不采集 HAR 或请求正文。",
    );
    return;
  }
  if (process.argv.length > 2) throw new AuthCliError("AUTH_INVALID_ARGUMENT");
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new AuthCliError("AUTH_INTERACTIVE_TERMINAL_REQUIRED");
  }

  config({ path: envPath, quiet: true });
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new AuthCliError("AUTH_DATABASE_CONFIG_MISSING");
  const encryptionKey = process.env.X_AUTH_ENCRYPTION_KEY;
  if (!encryptionKey) throw new AuthCliError("AUTH_ENCRYPTION_KEY_MISSING");

  const { db, pool } = createDatabase(connectionString);
  const controller = new AbortController();
  let browser: Browser | undefined;
  const cancel = () => {
    controller.abort();
    if (browser) void browser.close().catch(() => undefined);
  };
  const timer = setTimeout(cancel, loginTimeoutMs);
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);

  try {
    const existing = await getStoredXAuthSession(db);
    if (existing) {
      const confirmation = await ask(
        `数据库已有 @${existing.username} 会话。新登录成功后覆盖？输入 yes：`,
        controller.signal,
        cancel,
      );
      if (confirmation.trim() !== "yes") {
        throw new AuthCliError("AUTH_CANCELLED");
      }
    }

    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("https://x.com/login", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    console.log(
      "请在浏览器窗口中手动完成 X 登录及页面要求的验证。完成后进入 X 首页，再回到终端按 Enter。",
    );
    await ask(
      "登录完成后按 Enter 继续；取消请按 Ctrl+C：",
      controller.signal,
      cancel,
    );
    if (controller.signal.aborted) throw new AuthCliError("AUTH_CANCELLED");
    if (!isXHome(page.url())) throw new AuthCliError("AUTH_LOGIN_PAGE_NOT_REACHED");

    const state: AuthState = await context.storageState({ indexedDB: true });
    if (!hasXAuthCookies(state)) throw new AuthStateError("AUTH_STATE_INVALID");
    const username = accountLabel(
      await ask(
        "输入浏览器中当前登录账号的用户名（仅作会话标签，不含 @）：",
        controller.signal,
        cancel,
      ),
    );
    const confirmation = await ask(
      `确认将 @${username} 的加密浏览器会话保存到数据库？输入 yes：`,
      controller.signal,
      cancel,
    );
    if (confirmation.trim() !== "yes") {
      throw new AuthCliError("AUTH_NOT_CONFIRMED");
    }
    if (controller.signal.aborted) throw new AuthCliError("AUTH_CANCELLED");

    await saveXAuthState(db, state, username, encryptionKey);
    console.log(
      `@${username} 的浏览器会话已加密保存到 PostgreSQL；未保存 HAR、请求正文或密码。`,
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
  if (error instanceof AuthCliError || error instanceof AuthStateError) {
    console.error(error.code);
  } else {
    console.error(
      "AUTH_FAILED：会话未保存或旧会话未覆盖。原始异常、Cookie 和认证参数未输出；请检查数据库迁移及浏览器安装。",
    );
  }
  process.exitCode = 1;
});
