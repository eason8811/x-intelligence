import { fileURLToPath } from "node:url";
import { mkdir, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { TwitterMonitorForYouSource, XSourceError } from "@x-intelligence/x";
import { loadXCredentials } from "../auth/credentials";
import { probeForYou } from "./probe";

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "pnpm x:collect:probe [--count 10] [--pages 1]\ncount=1..20，pages=1..3。读取 playwright/.auth/x.json，使用授权 Web GraphQL。\n不重试，不写数据库，不调用 AI。结果写入被 Git 忽略的 debug-artifacts/x-probe/，不输出登录凭证。\n推荐顺序需人工对照 X 首页验证；queryId/features 尚需真实账号验证。",
    );
    return;
  }
  let count = 10,
    pages = 1;
  const seenOptions = new Set<string>();
  for (let i = 0; i < args.length; i += 2) {
    if (
      !["--count", "--pages"].includes(args[i]) ||
      !/^\d+$/.test(args[i + 1] ?? "") ||
      seenOptions.has(args[i])
    ) {
      throw new Error("INVALID_ARGUMENT：使用 --help 查看用法");
    }
    seenOptions.add(args[i]);
    if (args[i] === "--count") count = Number(args[i + 1]);
    else pages = Number(args[i + 1]);
  }
  if (count < 1 || count > 20 || pages < 1 || pages > 3)
    throw new Error("INVALID_ARGUMENT：count=1..20，pages=1..3");
  const credentials = await loadXCredentials(
    fileURLToPath(
      new URL("../../../../playwright/.auth/x.json", import.meta.url),
    ),
  );
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  const timer = setTimeout(cancel, 90000);
  try {
    const result = await probeForYou(
      new TwitterMonitorForYouSource(credentials),
      count,
      pages,
      controller.signal,
    );
    const directory = fileURLToPath(
      new URL("../../../../debug-artifacts/x-probe/", import.meta.url),
    );
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    const name = `${randomUUID()}.json`;
    await writeFile(
      join(directory, name),
      JSON.stringify(
        {
          source: "twitter-monitor",
          upstreamCommit: "dd8de94e3e2853beb7b5e5b785f1908c2cafea4b",
          createdAt: new Date().toISOString(),
          requestedCount: count,
          requestedPages: pages,
          orderVerified: false,
          ...result,
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600, flag: "wx" },
    );
    console.log(
      `获取 ${result.observations.length} 条帖子，${result.pagesFetched} 页，跨页重复 ${result.duplicateCount} 条；停止原因 ${result.stopReason}。`,
    );
    console.log(
      `结果：debug-artifacts/x-probe/${name}；推荐顺序未验证，未写数据库。`,
    );
    if (!result.observations.length) process.exitCode = 1;
  } finally {
    clearTimeout(timer);
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}
main().catch((error) => {
  if (error instanceof XSourceError)
    console.error(
      `采集验证失败：${error.code}。缺少或失效的登录态请重新人工登录；访问限制不自动重试。`,
    );
  else if (
    error instanceof Error &&
    error.message.startsWith("INVALID_ARGUMENT")
  )
    console.error(error.message);
  else
    console.error(
      "PROBE_FAILED：检查本地文件权限与配置。原始异常及凭证未输出。",
    );
  process.exitCode = 1;
});
