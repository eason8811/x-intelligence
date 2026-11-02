import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { runJp5Login, Jp5LoginError } from "@x-intelligence/x";
import { createLoginAdapter } from "./adapter";
import { saveAuthState, type AuthState } from "./state";

const statePath = fileURLToPath(
  new URL("../../../../playwright/.auth/x.json", import.meta.url),
);
async function main() {
  if (process.argv.includes("--help")) {
    console.log(
      "pnpm x:auth\n使用自研 JP-5 登录编排。生产运行时尚未接入，当前命令会在输入凭证前停止。\n密码和验证码隐藏输入，不保存。独立验证身份并确认账号后才保存 playwright/.auth/x.json。\n已有会话须确认覆盖；失败保留旧会话。15 分钟超时，不自动重试。",
    );
    return;
  }
  if (process.argv.length > 2) throw new Jp5LoginError("AUTH_INVALID_ARGUMENT");
  const adapter = createLoginAdapter();
  adapter.assertAvailable();
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Jp5LoginError("AUTH_INTERACTIVE_TERMINAL_REQUIRED");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  const timer = setTimeout(cancel, 15 * 60 * 1000);
  const prompt = async (label: string, secret = false) => {
    if (controller.signal.aborted) throw new Jp5LoginError("AUTH_CANCELLED");
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
      throw new Jp5LoginError("AUTH_CANCELLED");
    console.log("使用自研 JP-5 登录流程。未知状态停止，不自动重试。");
    const result = await runJp5Login(
      adapter,
      prompt,
      controller.signal,
    );
    if (controller.signal.aborted) throw new Jp5LoginError("AUTH_CANCELLED");
    // Cookie-only storageState-compatible container, not a full browser state.
    const state: AuthState = {
      cookies: [
        {
          name: "auth_token",
          value: result.authToken,
          httpOnly: true,
        },
        { name: "ct0", value: result.csrfToken, httpOnly: false },
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
    error instanceof Jp5LoginError
      ? error.code === "AUTH_RUNTIME_UNAVAILABLE"
        ? "AUTH_RUNTIME_UNAVAILABLE：自研编排已接管；缺少同会话运行时、POST 与身份/会话适配，未读取凭证或发起登录。"
        : error.message
      : "AUTH_FAILED：登录失败，原会话保留；原始异常及凭证未输出。",
  );
  process.exitCode = 1;
});
