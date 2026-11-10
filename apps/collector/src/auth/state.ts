import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { BrowserContext } from "patchright";
import {
  getXAuthSession,
  upsertXAuthSession,
  type EncryptedXAuthSession,
} from "@x-intelligence/db";

export type AuthState = Awaited<ReturnType<BrowserContext["storageState"]>>;
type Database = Parameters<typeof getXAuthSession>[0];
const accountKey = "x-primary";
const stateVersion = 1;
const maximumStateBytes = 8 * 1024 * 1024;

export class AuthStateError extends Error {
  constructor(public readonly code:
    | "AUTH_STATE_INVALID"
    | "AUTH_ENCRYPTION_KEY_INVALID"
    | "AUTH_STATE_DECRYPT_FAILED") {
    super(code);
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function isXHome(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "x.com" &&
      (url.pathname === "/home" || url.pathname === "/home/");
  } catch {
    return false;
  }
}

export function hasXAuthCookies(state: unknown, now = Date.now()): state is AuthState {
  const value = record(state);
  if (!value || !Array.isArray(value.cookies) || !Array.isArray(value.origins)) return false;

  const cookies = value.cookies as unknown[];
  return ["auth_token", "ct0"].every((name) => {
    const matching = cookies.filter((rawCookie) => {
      const cookie = record(rawCookie);
      if (!cookie) return false;
      return cookie.name === name &&
        typeof cookie.value === "string" && cookie.value.length > 0 &&
        (cookie.domain === "x.com" || cookie.domain === ".x.com") &&
        cookie.path === "/" && cookie.secure === true &&
        (cookie.expires === -1 ||
          (typeof cookie.expires === "number" && cookie.expires * 1000 > now));
    });
    return matching.length === 1;
  });
}

function encryptionKey(encodedKey: string): Buffer {
  const normalized = encodedKey.trim();
  const key = Buffer.from(normalized, "base64");
  if (key.length !== 32 || key.toString("base64") !== normalized) {
    throw new AuthStateError("AUTH_ENCRYPTION_KEY_INVALID");
  }
  return key;
}

type EncryptedState = {
  encryptionVersion: number;
  nonce: string;
  ciphertext: string;
  authTag: string;
};

function aad(): Buffer {
  return Buffer.from(`${accountKey}:storageState:v${stateVersion}`, "utf8");
}

function encryptState(state: AuthState, encodedKey: string): EncryptedState {
  if (!hasXAuthCookies(state)) throw new AuthStateError("AUTH_STATE_INVALID");
  const plaintext = Buffer.from(JSON.stringify(state), "utf8");
  if (plaintext.length > maximumStateBytes) {
    throw new AuthStateError("AUTH_STATE_INVALID");
  }
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(encodedKey), nonce);
  cipher.setAAD(aad());
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    encryptionVersion: stateVersion,
    nonce: nonce.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptState(encrypted: EncryptedState, encodedKey: string): AuthState {
  if (encrypted.encryptionVersion !== stateVersion) {
    throw new AuthStateError("AUTH_STATE_DECRYPT_FAILED");
  }
  try {
    const nonce = Buffer.from(encrypted.nonce, "base64");
    const ciphertext = Buffer.from(encrypted.ciphertext, "base64");
    const authTag = Buffer.from(encrypted.authTag, "base64");
    if (nonce.length !== 12 || authTag.length !== 16 ||
      ciphertext.length > maximumStateBytes ||
      nonce.toString("base64") !== encrypted.nonce ||
      authTag.toString("base64") !== encrypted.authTag ||
      ciphertext.toString("base64") !== encrypted.ciphertext) {
      throw new Error("invalid envelope");
    }
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(encodedKey), nonce);
    decipher.setAAD(aad());
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    if (plaintext.length > maximumStateBytes) throw new Error("state too large");
    const state: unknown = JSON.parse(plaintext.toString("utf8"));
    if (!hasXAuthCookies(state)) throw new Error("state invalid");
    return state;
  } catch {
    throw new AuthStateError("AUTH_STATE_DECRYPT_FAILED");
  }
}

export async function getStoredXAuthSession(db: Database): Promise<{
  username: string;
  updatedAt: Date;
} | undefined> {
  const row = await getXAuthSession(db, accountKey);
  return row ? { username: row.username, updatedAt: row.updatedAt } : undefined;
}

export async function saveXAuthState(
  db: Database,
  state: AuthState,
  username: string,
  encodedKey: string,
): Promise<void> {
  if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) {
    throw new AuthStateError("AUTH_STATE_INVALID");
  }
  const encrypted = encryptState(state, encodedKey);
  const row: EncryptedXAuthSession = { accountKey, username, ...encrypted };
  await upsertXAuthSession(db, row);
}

export async function loadXAuthState(
  db: Database,
  encodedKey: string,
): Promise<{ username: string; state: AuthState } | undefined> {
  const row = await getXAuthSession(db, accountKey);
  if (!row) return undefined;
  return { username: row.username, state: decryptState(row, encodedKey) };
}
