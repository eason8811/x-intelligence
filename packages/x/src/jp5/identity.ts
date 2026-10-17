/** Candidate identity from a complete X home HTML response; no script execution. */
export interface XHomeIdentity { userId: string; username: string }
export class XIdentityError extends Error {
  constructor(public readonly code: "X_IDENTITY_INVALID" | "X_IDENTITY_MISMATCH" | "X_IDENTITY_LIMIT") { super(code); }
}
const invalid = (): never => { throw new XIdentityError("X_IDENTITY_INVALID"); };
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function own(value: unknown, key: string): unknown {
  const data = record(value);
  if (!Object.hasOwn(data, key)) return invalid();
  return data[key];
}
function identity(value: XHomeIdentity): XHomeIdentity {
  if (typeof value.userId !== "string" || !/^[1-9][0-9]{0,19}$/.test(value.userId) ||
    typeof value.username !== "string" || !/^[A-Za-z0-9_]{1,15}$/.test(value.username)) return invalid();
  return value;
}
function jsonObject(source: string): unknown {
  if (source[0] !== "{") return invalid();
  let depth = 0, quoted = false, escaped = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === "{" || char === "[") {
      if (++depth > 64) throw new XIdentityError("X_IDENTITY_LIMIT");
    } else if (char === "}" || char === "]") {
      if (--depth === 0) {
        const tail = source.slice(i + 1).trimStart();
        if (tail && !tail.startsWith(";")) return invalid();
        try { return JSON.parse(source.slice(0, i + 1)) as unknown; }
        catch { return invalid(); }
      }
    }
  }
  return invalid();
}
export function extractXHomeIdentity(html: string): XHomeIdentity {
  if (html.length > 2 * 1024 * 1024) throw new XIdentityError("X_IDENTITY_LIMIT");
  const candidates: unknown[] = [];
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    const script = match[1]!;
    const assignment = /^\s*window\.__INITIAL_STATE__\s*=\s*/.exec(script);
    if (assignment) candidates.push(jsonObject(script.slice(assignment[0].length)));
  }
  if (candidates.length !== 1) return invalid();
  const state = candidates[0], userId = own(own(state, "session"), "user_id");
  if (typeof userId !== "string") return invalid();
  const users = own(own(own(state, "entities"), "users"), "entities");
  const user = own(users, userId);
  if (own(user, "id_str") !== userId) return invalid();
  return identity({ userId, username: own(user, "screen_name") as string });
}
/** A match is local evidence only. Caller must establish response origin/freshness and HTTP success. */
export function assertXHomeIdentity(actual: XHomeIdentity, expected: XHomeIdentity): void {
  identity(actual); identity(expected);
  if (actual.userId !== expected.userId || actual.username.toLowerCase() !== expected.username.toLowerCase())
    throw new XIdentityError("X_IDENTITY_MISMATCH");
}
