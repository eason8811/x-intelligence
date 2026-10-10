import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { createLoginDriver, runLogin, XLoginError } from "@x-intelligence/x";
import { saveAuthState, type AuthState } from "./state";

const statePath = fileURLToPath(
  new URL("../../../../playwright/.auth/x.json", import.meta.url),
);
async function main() {
  if (process.argv.includes("--help")) {
    console.log(
      "pnpm x:auth\n使用 twitter-monitor Web HTTP 登录，不打开浏览器。需要交互终端。\n密码和验证码隐藏输入，不保存。成功获取 Viewer 并确认账号后保存 playwright/.auth/x.json。\n已有会话须确认覆盖；失败保留旧会话。15 分钟超时，不自动重试。",
    );
    return;
  }
  if (process.argv.length > 2) throw new XLoginError("AUTH_INVALID_ARGUMENT");
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new XLoginError("AUTH_INTERACTIVE_TERMINAL_REQUIRED");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  const timer = setTimeout(cancel, 15 * 60 * 1000);
  const prompt = async (label: string, secret = false) => {
    if (controller.signal.aborted) throw new XLoginError("AUTH_CANCELLED");
    const output = secret
      ? new Writable({
          write(_chunk, _encoding, callback) {
            callback();
          },
        })
      : process.stdout;
    const terminal = createInterface({
      input: process.stdin,
      output,
      terminal: true,
    });
    terminal.on("SIGINT", cancel);
    try {
      process.stdout.write(label);
      return await terminal.question("", { signal: controller.signal });
    } finally {
      terminal.close();
      if (secret) {
        output.end();
        process.stdout.write("\n");
      }
    }
  };
  try {
    let exists = false;
    try {
      await access(statePath);
      exists = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (
      exists &&
      (await prompt("已有登录态。成功后覆盖？输入 yes：")).trim() !== "yes"
    )
      throw new XLoginError("AUTH_CANCELLED");
    console.log("使用上游登录流程。未知验证任务将停止，不自动重试。");
    const result = await runLogin(
      await createLoginDriver(),
      prompt,
      controller.signal,
    );
    if (controller.signal.aborted) throw new XLoginError("AUTH_CANCELLED");
    // Cookie-only storageState-compatible container, not a full browser state.
    const state: AuthState = {
      cookies: [
        {
          name: "auth_token",
          value: result.credentials.authToken,
          httpOnly: true,
        },
        { name: "ct0", value: result.credentials.csrfToken, httpOnly: false },
      ].map((cookie) => ({
        ...cookie,
        domain: ".x.com",
        path: "/",
        expires: -1,
        secure: true,
        sameSite: "Lax" as const,
      })),
      origins: [],
    };
    await saveAuthState(statePath, state);
    console.log("登录会话已保存至 playwright/.auth/x.json；未执行采集。");
  } finally {
    clearTimeout(timer);
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}
main().catch((error) => {
  console.error(
    error instanceof XLoginError
      ? error.message
      : "AUTH_FAILED：登录失败，原会话保留；原始异常及凭证未输出。",
  );
  process.exitCode = 1;
});
