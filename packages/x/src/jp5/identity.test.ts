import test from "node:test";
import assert from "node:assert/strict";
import { assertXHomeIdentity, extractXHomeIdentity, XIdentityError } from "./identity";
const expected = { userId: "1234567890123456789", username: "synthetic" };
function html(id = expected.userId, username = expected.username) {
  return `<script>window.__INITIAL_STATE__=${JSON.stringify({ session: { user_id: id },
    entities: { users: { entities: { [id]: { id_str: id, screen_name: username,
      description: 'braces } [ and escaped " quotes' } } } } })};globalThis.DO_NOT_EXECUTE();</script>`;
}
test("home identity is parsed without executing scripts and preserves string id", () => {
  const actual = extractXHomeIdentity(html());
  assert.deepEqual(actual, expected);
  assertXHomeIdentity(actual, { ...expected, username: "SYNTHETIC" });
  assert.throws(() => assertXHomeIdentity(actual, { ...expected, userId: "9" }), XIdentityError);
  assert.throws(() => assertXHomeIdentity(actual, { ...expected, username: "another" }), XIdentityError);
});
test("missing, ambiguous, malformed or inconsistent identity stops", () => {
  for (const source of ["", html() + html(), html().replace('"id_str":"1234567890123456789"', '"id_str":"9"'),
    html().replace('"user_id":"1234567890123456789"', '"user_id":1234567890123456789'),
    html().replace('window.__INITIAL_STATE__=', 'window.__INITIAL_STATE__=run('),
    '<script>const text="window.__INITIAL_STATE__={}";</script>', html("1", "bad-name")]) {
    assert.throws(() => extractXHomeIdentity(source), (e) =>
      e instanceof XIdentityError && e.message === e.code && !e.message.includes("synthetic"));
  }
});
test("size and JSON depth limits stop before unbounded parsing", () => {
  assert.throws(() => extractXHomeIdentity(" ".repeat(2 * 1024 * 1024 + 1)), XIdentityError);
  assert.throws(() => extractXHomeIdentity('<script>window.__INITIAL_STATE__={"x":' + '['.repeat(70) +
    '0' + ']'.repeat(70) + '};</script>'), XIdentityError);
});
