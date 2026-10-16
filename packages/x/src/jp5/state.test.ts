import test from "node:test";
import assert from "node:assert/strict";
import { extractJp5LoginState, Jp5StateError, type Jp5Snapshot } from "./state";

function fixture(action = "/onboarding/web/actions/login_enter_password"): Jp5Snapshot {
  return {
    version: "JP-5", root: 0,
    elements: [
      { props: new Map([[1, 0]]), children: [] },
      { props: new Map([[2, 2], [3, 4]]), children: [] },
    ],
    properties: [
      [19, [6, [0, { preview: 1 }]]], [7, 1],
      [18, { prop_ref: 3 }],
      [30, [action, new Map([["username", "synthetic"], ["password", ""], ["session_token", "synthetic-session"]]), new Map(), "", 0]],
      [19, [6, [0, { preview: 5 }]]],
      // Inactive recovery navigation must not select its form.
      [30, ["/onboarding/web/actions/begin_password_recovery", new Map(), new Map(), "", 0]],
    ],
  };
}
function rejects(snapshot: Jp5Snapshot, code: string) {
  assert.throws(() => extractJp5LoginState(snapshot), (error) =>
    error instanceof Jp5StateError && error.code === code && !error.message.includes("synthetic-session"));
}
test("active preview resolves atom-backed main form and excludes recovery link", () => {
  const result = extractJp5LoginState(fixture());
  assert.equal(result.kind, "PASSWORD_REQUIRED");
  assert.equal(result.fields.get("session_token"), "synthetic-session");
});
test("version, unknown action, invalid refs, cycles and multiple active forms stop", () => {
  rejects({ ...fixture(), version: "JP-6" }, "JP5_VERSION_UNSUPPORTED");
  rejects(fixture("/unexpected"), "JP5_UNKNOWN_STATE");
  rejects({ ...fixture(), root: 99 }, "JP5_INVALID_STATE");
  const cycle = fixture();
  rejects({ ...cycle, elements: [cycle.elements[0]!, { props: new Map(), children: [1] }] }, "JP5_INVALID_STATE");
  const many = fixture();
  rejects({ ...many, elements: [many.elements[0]!, { props: new Map([[1, 3], [2, 5]]), children: [] }] }, "JP5_AMBIGUOUS_STATE");
  const broken = fixture();
  const properties = [...broken.properties];
  properties[2] = [31, { ref: [8, { root: 99 }] }];
  rejects({ ...broken, properties }, "JP5_INVALID_STATE");
});
test("form errors stop without exposing values", () => {
  const x = fixture();
  const props = [...x.properties];
  const form = [...props[3]![1] as unknown[]];
  form[2] = new Map([["password", "synthetic-session"]]);
  props[3] = [30, form];
  rejects({ ...x, properties: props }, "JP5_FORM_ERROR");
});
test("verification states preserve required fields and reject missing session context", () => {
  for (const [action, kind, fields] of [
    ["begin_login_acid", "VERIFICATION_PREPARATION_REQUIRED", ["prelude_dispatch_id", "from_prelude_gate", "session_token"]],
    ["finish_login_acid", "CODE_REQUIRED", ["code", "destination", "session_token"]],
  ] as const) {
    const x = fixture(`/onboarding/web/actions/${action}`);
    const properties = [...x.properties];
    const form = [...properties[3]![1] as unknown[]];
    const values = new Map(fields.map((key) => [key, key === "session_token" ? "synthetic-session" : ""]));
    form[1] = values;
    properties[3] = [30, form];
    const snapshot = { ...x, properties };
    assert.equal(extractJp5LoginState(snapshot).kind, kind);
    values.delete("session_token");
    rejects(snapshot, "JP5_INVALID_STATE");
  }
});
test("open_account remains unverified and requires an identity map", () => {
  const x: Jp5Snapshot = { version: "JP-5", root: 0,
    elements: [{ props: new Map([[1, 0]]), children: [] }],
    properties: [[19, [2, [[11, { type: 8, ref: 1 }]]]],
      [17, new Map([["user_id", "synthetic-id"], ["username", "synthetic"]])]],
  };
  assert.equal(extractJp5LoginState(x).kind, "LOGIN_COMPLETED_UNVERIFIED");
  rejects({ ...x, properties: [[19, [2, [[11, { type: 8, ref: 99 }]]]]] }, "JP5_INVALID_STATE");
});

test("landing resolves account form in direct root and ignores signup navigation", () => {
  const base = fixture();
  const properties = [...base.properties];
  properties[0] = [3, []];
  properties[3] = [30, ["/onboarding/web/actions/begin_login",
    new Map([["username_or_email", ""]]), new Map(), "", 0]];
  properties[5] = [30, ["/onboarding/web/actions/begin_signup_phone", new Map(), new Map(), "", 0]];
  const snapshot: Jp5Snapshot = { ...base, properties,
    elements: [{ props: new Map([[1, 0]]), children: [1] }, base.elements[1]!] };
  const result = extractJp5LoginState(snapshot);
  assert.equal(result.kind, "ACCOUNT_REQUIRED");
  assert.deepEqual([...result.fields.keys()], ["username_or_email"]);
  const extra = [...properties];
  extra[3] = [30, ["/onboarding/web/actions/begin_login",
    new Map([["username_or_email", ""], ["unexpected", ""]]), new Map(), "", 0]];
  rejects({ ...snapshot, properties: extra }, "JP5_INVALID_STATE");
  rejects({ ...snapshot, elements: [snapshot.elements[0]!,
    { props: new Map([[1, 3], [2, 5]]), children: [] }] }, "JP5_AMBIGUOUS_STATE");
});
