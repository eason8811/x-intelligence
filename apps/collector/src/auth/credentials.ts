import { readFile } from "node:fs/promises";
import { XSourceError, type XCredentials } from "@x-intelligence/x";

export async function loadXCredentials(
  path: string,
  now = Date.now(),
): Promise<XCredentials> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    throw new XSourceError(
      (error as NodeJS.ErrnoException).code === "ENOENT"
        ? "AUTH_STATE_MISSING"
        : "AUTH_STATE_INVALID",
    );
  }
  let state: unknown;
  try {
    state = JSON.parse(text);
  } catch {
    throw new XSourceError("AUTH_STATE_INVALID");
  }
  if (
    !state ||
    typeof state !== "object" ||
    !("cookies" in state) ||
    !Array.isArray(state.cookies)
  ) {
    throw new XSourceError("AUTH_STATE_INVALID");
  }
  function find(name: string): string {
    const cookie = (state as { cookies: unknown[] }).cookies.find((value) => {
      if (!value || typeof value !== "object") return false;
      const item = value as Record<string, unknown>;
      return (
        item.name === name &&
        ["x.com", ".x.com"].includes(String(item.domain)) &&
        item.path === "/" &&
        typeof item.value === "string" &&
        /^[^\s;,]+$/.test(item.value) &&
        typeof item.expires === "number" &&
        (item.expires === -1 || item.expires * 1000 > now)
      );
    }) as { value: string } | undefined;
    if (!cookie) throw new XSourceError("AUTH_STATE_INVALID");
    return cookie.value;
  }
  return { authToken: find("auth_token"), csrfToken: find("ct0") };
}
