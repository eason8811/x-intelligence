import test from "node:test";
import assert from "node:assert/strict";
import { decodeJp5Snapshot, Jp5CodecError } from "./codec";
import { extractJp5LoginState } from "./state";

const u = (value: number): number[] => {
  const bytes: number[] = [];
  do { const part = value % 128; value = Math.floor(value / 128); bytes.push(part | (value ? 128 : 0)); } while (value);
  return bytes;
};
const str = (text: string): number[] => {
  const bytes = [...new TextEncoder().encode(text)]; return [...u(bytes.length), ...bytes];
};
const frame = (payload: number[]): number[] => {
  const header = new Uint8Array(4); new DataView(header.buffer).setUint32(0, payload.length, true);
  return [...header, ...payload];
};
// Synthetic direct landing root -> child -> account form, no recorded private data.
const data = (): number[] => [0, 2,
  0, 0, 1, 1, 0, 0, 1, 1, 0, 0,
  0, 0, 1, 1, 0, 1, 0, 0, 0,
  2, 3, 0,
  30, ...str("/onboarding/web/actions/begin_login"), 1, ...str("username_or_email"), ...str(""),
  0, ...str(""), 0,
  0, 0, 0, 0];
const ready = [1, 0, 0];
const response = (payload = data()): Uint8Array => Uint8Array.from([...frame(payload), ...frame(ready)]);
function rejects(bytes: Uint8Array, code: string) {
  assert.throws(() => decodeJp5Snapshot(bytes, "JP-5"), (e) =>
    e instanceof Jp5CodecError && e.code === code && e.message === code);
}
test("synthetic frames decode into account state, including nonzero byteOffset", () => {
  const bytes = response(), padded = new Uint8Array(bytes.length + 9);
  padded.set(bytes, 5);
  const snapshot = decodeJp5Snapshot(padded.subarray(5, 5 + bytes.length), "JP-5");
  assert.equal(extractJp5LoginState(snapshot).kind, "ACCOUNT_REQUIRED");
  assert.throws(() => decodeJp5Snapshot(bytes, "JP-6"), Jp5CodecError);
});
test("every truncation and trailing data is rejected", () => {
  const bytes = response();
  for (let i = 0; i < bytes.length; i++) assert.throws(() => decodeJp5Snapshot(bytes.subarray(0, i), "JP-5"), Jp5CodecError);
  rejects(Uint8Array.from([...bytes, 0]), "JP5_UNSUPPORTED_MESSAGES");
  rejects(response([...data(), 0]), "JP5_INVALID_BYTES");
  rejects(Uint8Array.from([...frame(ready), ...frame(data())]), "JP5_UNSUPPORTED_MESSAGES");
});
test("unknown tags, invalid root and flags stop", () => {
  rejects(response([255]), "JP5_UNSUPPORTED_TAG");
  // Empty element table and no properties, followed by root index zero.
  rejects(response([0, 0, 0, 0, 0, 0, 0]), "JP5_INVALID_BYTES");
  rejects(Uint8Array.from([...frame(data()), ...frame([1, 0, 2])]), "JP5_INVALID_BYTES");
  rejects(response([0, 0, 1, 255]), "JP5_UNSUPPORTED_TAG");
});
test("unsafe/noncanonical integers, invalid UTF-8 and resource expansion stop", () => {
  rejects(response([0, 0x80, 0]), "JP5_INVALID_BYTES");
  rejects(response([0, ...Array<number>(8).fill(255)]), "JP5_INVALID_BYTES");
  rejects(response([0, ...u(100_001)]), "JP5_LIMIT_EXCEEDED");
  rejects(response([0, 0, 1, 0, 1, 255]), "JP5_INVALID_BYTES");
  rejects(new Uint8Array(1024 * 1024 + 1), "JP5_LIMIT_EXCEEDED");
  // Nested predicate NOT operators cannot exhaust the JavaScript stack.
  rejects(response([0, 0, 1, 22, ...Array<number>(100).fill(14)]), "JP5_LIMIT_EXCEEDED");
});
test("duplicate map keys stop instead of silently overwriting", () => {
  rejects(response([0, 0, 1, 17, 2, ...str("synthetic"), ...str("one"),
    ...str("synthetic"), ...str("two")]), "JP5_INVALID_BYTES");
});
