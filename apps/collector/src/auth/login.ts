import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { chromium, type Browser } from "playwright";
import { X_SELECTORS } from "@x-intelligence/x";
import { hasAuthCookies, isXHome, saveAuthState } from "./state";

const statePath = fileURLToPath(
  new URL("../../../../playwright/.auth/x.json", import.meta.url),
);
const timeout = 15 * 60 * 1000;

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    console.log(
      "pnpm x:auth\n打开 Chromium，由你完成 X 登录和 2FA。请使用英文 X 界面。\n进入 /home 后在终端按回车保存，最长等待 15 分钟。Ctrl+C 取消。\n保存位置：playwright/.auth/x.json；已有文件须确认覆盖。\n首次运行：pnpm x:auth:install\n需要可交互终端和图形桌面；远程无桌面环境请在本地电脑运行。",
    );
    return;
  }
  if (process.argv.slice(2).length)
    throw new Error("UNKNOWN_ARGUMENT：使用 --help 查看用法");
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error("INTERACTIVE_TERMINAL_REQUIRED：请在交互终端运行");
  if (process.platform === "linux" && !process.env.DISPLAY)
    throw new Error("DISPLAY_REQUIRED：请在有图形桌面的电脑运行");

  const abort = new AbortController();
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  let browser: Browser | undefined;
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
    abort.abort();
    void browser
      ?.close()
      .catch(() =>
        console.error("AUTH_BROWSER_CLOSE_FAILED：请手动关闭登录浏览器"),
      );
  };
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  terminal.on("SIGINT", cancel);
  const timer = setTimeout(cancel, timeout);
  try {
    let existing = false;
    try {
      await access(statePath);
      existing = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (existing) {
      const answer = await terminal.question(
        "已有登录态。成功登录后覆盖？输入 yes 继续：",
        { signal: abort.signal },
      );
      if (answer.trim() !== "yes") {
        console.log("已取消，原登录态保留。");
        return;
      }
    }
    console.log(
      "请在 Chromium 中人工登录并完成 2FA，确认账号正确并进入首页。工具不读取密码或验证码。浏览器请保持打开。",
    );
    try {
      browser = await chromium.launch({ headless: false });
    } catch {
      throw new Error(
        "BROWSER_LAUNCH_FAILED：检查图形桌面及系统库，先运行 pnpm x:auth:install",
      );
    }
    browser.on("disconnected", () => abort.abort());
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("https://x.com/i/flow/login", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await terminal.question(
      "完成登录并进入 https://x.com/home 后，按回车检查并保存：",
      { signal: abort.signal },
    );
    if (cancelled) throw new Error("AUTH_CANCELLED_OR_TIMEOUT");
    if (!isXHome(page.url()))
      throw new Error(
        "AUTH_NOT_READY：当前页面不是 X 首页，请重新运行并完成登录",
      );
    await page
      .locator(X_SELECTORS.accountMenu)
      .waitFor({ state: "visible", timeout: 15000 });
    await page
      .getByRole(X_SELECTORS.forYouTab.role, X_SELECTORS.forYouTab)
      .waitFor({ state: "visible", timeout: 15000 });
    const state = await context.storageState({ indexedDB: true });
    if (!isXHome(page.url()) || !hasAuthCookies(state))
      throw new Error("AUTH_STATE_INVALID：未检测到完整有效登录态，不保存");
    if (abort.signal.aborted) throw new Error("AUTH_CANCELLED_OR_TIMEOUT");
    await saveAuthState(statePath, state);
    console.log(
      "登录态已保存至 playwright/.auth/x.json。请将此文件视为账号凭证。尚未执行帖子采集。",
    );
  } finally {
    clearTimeout(timer);
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
    terminal.close();
    await browser?.close();
  }
}

main().catch((error) => {
  // Do not log raw browser errors, URLs, cookies, or credential contents.
  const message = error instanceof Error ? error.message : "UNKNOWN";
  const known =
    /^(UNKNOWN_ARGUMENT|INTERACTIVE_TERMINAL_REQUIRED|DISPLAY_REQUIRED|BROWSER_LAUNCH_FAILED|AUTH_)/;
  console.error(
    known.test(message)
      ? message
      : "AUTH_FAILED：登录未完成、已取消或页面校验失败；确认英文界面后重试。原登录态不会被未验证的状态替换。",
  );
  process.exitCode = 1;
});
