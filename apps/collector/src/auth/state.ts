import { mkdir, open, rename, unlink, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { BrowserContext } from "playwright";

export type AuthState = Awaited<ReturnType<BrowserContext["storageState"]>>;

export function isXHome(value: string): boolean {
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    url.hostname === "x.com" &&
    (url.pathname === "/home" || url.pathname === "/home/")
  );
}

export function hasAuthCookies(state: AuthState, now = Date.now()): boolean {
  return ["auth_token", "ct0"].every((name) =>
    state.cookies.some(
      (cookie) =>
        cookie.name === name &&
        cookie.value.length > 0 &&
        ["x.com", ".x.com"].includes(cookie.domain) &&
        (cookie.expires === -1 || cookie.expires * 1000 > now),
    ),
  );
}

// Write a private temporary file before replacing the existing credential.
export async function saveAuthState(
  path: string,
  state: AuthState,
): Promise<void> {
  if (!hasAuthCookies(state)) throw new Error("AUTH_STATE_INVALID");
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temporary = join(directory, `.x-${randomUUID()}.tmp`);
  const file = await open(temporary, "wx", 0o600);
  try {
    await file.writeFile(JSON.stringify(state, null, 2) + "\n");
    await file.sync();
    await file.close();
    await rename(temporary, path);
  } finally {
    await file.close();
    await unlink(temporary).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    });
  }
}
