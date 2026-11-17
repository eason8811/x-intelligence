import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { AuthState } from "./state";
import { hasXAuthCookies } from "./state";

const stateVersion = 1;
const maximumStateBytes = 8 * 1024 * 1024;

export interface EncryptedAccountState {
  encryptionVersion: number;
  nonce: string;
  ciphertext: string;
  authTag: string;
}

export class AccountSessionError extends Error {
  constructor(public readonly code:
    | "AUTH_ENCRYPTION_KEY_INVALID"
    | "AUTH_STATE_INVALID"
    | "AUTH_STATE_DECRYPT_FAILED") {
    super(code);
    this.name = "AccountSessionError";
  }
}

function encryptionKey(encodedKey: string): Buffer {
  const normalized = encodedKey.trim();
  const key = Buffer.from(normalized, "base64");
  if (key.length !== 32 || key.toString("base64") !== normalized) {
    throw new AccountSessionError("AUTH_ENCRYPTION_KEY_INVALID");
  }
  return key;
}

function additionalData(userId: string, xUserId: string): Buffer {
  return Buffer.from(
    `x-account:${userId}:${xUserId}:storageState:v${stateVersion}`,
    "utf8",
  );
}

export function encryptAccountState(
  state: AuthState,
  encodedKey: string,
  userId: string,
  xUserId: string,
): EncryptedAccountState {
  if (!hasXAuthCookies(state)) throw new AccountSessionError("AUTH_STATE_INVALID");
  const plaintext = Buffer.from(JSON.stringify(state), "utf8");
  if (plaintext.length > maximumStateBytes) {
    throw new AccountSessionError("AUTH_STATE_INVALID");
  }

  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(encodedKey), nonce);
  cipher.setAAD(additionalData(userId, xUserId));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    encryptionVersion: stateVersion,
    nonce: nonce.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptAccountState(
  encrypted: EncryptedAccountState,
  encodedKey: string,
  userId: string,
  xUserId: string,
): AuthState {
  if (encrypted.encryptionVersion !== stateVersion) {
    throw new AccountSessionError("AUTH_STATE_DECRYPT_FAILED");
  }
  try {
    const nonce = Buffer.from(encrypted.nonce, "base64");
    const ciphertext = Buffer.from(encrypted.ciphertext, "base64");
    const authTag = Buffer.from(encrypted.authTag, "base64");
    if (
      nonce.length !== 12 || authTag.length !== 16 ||
      ciphertext.length > maximumStateBytes ||
      nonce.toString("base64") !== encrypted.nonce ||
      ciphertext.toString("base64") !== encrypted.ciphertext ||
      authTag.toString("base64") !== encrypted.authTag
    ) {
      throw new Error("invalid encryption envelope");
    }
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(encodedKey), nonce);
    decipher.setAAD(additionalData(userId, xUserId));
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
    throw new AccountSessionError("AUTH_STATE_DECRYPT_FAILED");
  }
}

export function credentialsFromAccountState(state: AuthState): {
  authToken: string;
  csrfToken: string;
} {
  if (!hasXAuthCookies(state)) throw new AccountSessionError("AUTH_STATE_INVALID");
  const getCookie = (name: "auth_token" | "ct0"): string => {
    const matching = state.cookies.filter((cookie) =>
      cookie.name === name &&
      (cookie.domain === "x.com" || cookie.domain === ".x.com") &&
      cookie.path === "/" && cookie.secure &&
      (cookie.expires === -1 || cookie.expires * 1000 > Date.now())
    );
    if (matching.length !== 1 || !matching[0]?.value) {
      throw new AccountSessionError("AUTH_STATE_INVALID");
    }
    return matching[0].value;
  };
  return { authToken: getCookie("auth_token"), csrfToken: getCookie("ct0") };
}
