import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const nextCli = require.resolve("next/dist/bin/next");
const tsxCli = require.resolve("tsx/cli");
const children = [];
let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
  const forcedExit = setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  }, 10_000);
  forcedExit.unref();
}

function launch(command, args) {
  const child = spawn(process.execPath, [command, ...args], {
    cwd: appDirectory,
    env: process.env,
    stdio: "inherit",
  });
  children.push(child);
  child.once("error", () => stop(1));
  child.once("exit", (code) => {
    if (!stopping) stop(code ?? 1);
  });
  return child;
}

launch(nextCli, ["start", "--port", process.env.PORT || "3001"]);
launch(tsxCli, [resolve(appDirectory, "src/remote-browser/server.ts")]);

process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));
