import test from "node:test";
import assert from "node:assert/strict";
import { prepareJp5Submission, Jp5SubmissionError, type Jp5RuntimeFields } from "./submission";
import type { Jp5LoginState } from "./state";
const runtime = { castleToken: "synthetic+castle&token", transactionId: "synthetic-transaction" };
const account = (): Jp5LoginState => ({ kind: "ACCOUNT_REQUIRED", action: "/onboarding/web/actions/begin_login",
  fields: new Map([["username_or_email", ""]]) });
const password = (): Jp5LoginState => ({ kind: "PASSWORD_REQUIRED", action: "/onboarding/web/actions/login_enter_password",
  fields: new Map([["username", "server-username"], ["password", ""], ["session_token", "server-session"]]) });
test("offline account encoding preserves form semantics without leaking inputs in plan JSON", () => {
  const state = account();
  const plan = prepareJp5Submission(state, { kind: "ACCOUNT_REQUIRED", identifier: "a+b@example.test" });
  assert.equal(plan.url, "https://jf.x.com/onboarding/web/actions/begin_login");
  assert.equal(plan.method, "POST");
  assert.equal(JSON.stringify(plan).includes("a+b"), false);
  const encoded = plan.encodeForTransport(runtime), fields = new URLSearchParams(encoded.body);
  assert.equal(fields.get("username_or_email"), "a+b@example.test");
  assert.equal(fields.get("$castle_token"), runtime.castleToken);
  assert.equal(fields.has("password"), false);
  assert.equal(encoded.headers["x-client-transaction-id"], runtime.transactionId);
  assert.equal(state.kind === "ACCOUNT_REQUIRED" && state.fields.get("username_or_email"), "");
  const linked = prepareJp5Submission(account(), { kind: "ACCOUNT_REQUIRED", identifier: "user", linkedPassword: "" });
  assert.equal(new URLSearchParams(linked.encodeForTransport(runtime).body).get("password"), "");
});
test("server fields are copied per plan and password or code alone are replaced", () => {
  const state = password();
  const plan = prepareJp5Submission(state, { kind: "PASSWORD_REQUIRED", password: " p+&=密碼 " });
  if (state.kind === "PASSWORD_REQUIRED") (state.fields as Map<string, string>).set("session_token", "changed");
  const fields = new URLSearchParams(plan.encodeForTransport(runtime).body);
  assert.equal(fields.get("session_token"), "server-session");
  assert.equal(fields.get("username"), "server-username");
  assert.equal(fields.get("password"), " p+&=密碼 ");
  const code = prepareJp5Submission({ kind: "CODE_REQUIRED", action: "/onboarding/web/actions/finish_login_acid",
    fields: new Map([["code", ""], ["destination", "masked"], ["session_token", "new-session"]]) },
    { kind: "CODE_REQUIRED", code: "012345" });
  assert.equal(new URLSearchParams(code.encodeForTransport(runtime).body).get("code"), "012345");
  assert.equal(new URLSearchParams(code.encodeForTransport(runtime).body).get("session_token"), "new-session");
});
test("verification preparation requires explicit same-flow runtime output", () => {
  const plan = prepareJp5Submission({ kind: "VERIFICATION_PREPARATION_REQUIRED", action: "/onboarding/web/actions/begin_login_acid",
    fields: new Map([["prelude_dispatch_id", ""], ["from_prelude_gate", "1"], ["session_token", "server-session"]]) },
    { kind: "VERIFICATION_PREPARATION_REQUIRED" });
  assert.deepEqual(plan.requiredRuntime, ["castleToken", "transactionId", "preludeDispatchId"]);
  assert.throws(() => plan.encodeForTransport(runtime), Jp5SubmissionError);
  const fields = new URLSearchParams(plan.encodeForTransport({ ...runtime, preludeDispatchId: "synthetic-dispatch" }).body);
  assert.equal(fields.get("prelude_dispatch_id"), "synthetic-dispatch");
  assert.equal(fields.get("from_prelude_gate"), "1");
});
test("unknown states, field overrides, bad inputs and incomplete runtime stop with fixed errors", () => {
  for (const state of [{ ...password(), action: "https://example.com/" },
    { ...password(), fields: new Map([["password", ""], ["session_token", "server-session"]]) },
    { kind: "LOGIN_COMPLETED_UNVERIFIED", account: new Map([["user_id", "123"]]) } as Jp5LoginState])
    assert.throws(() => prepareJp5Submission(state, { kind: "PASSWORD_REQUIRED", password: "secret" }), Jp5SubmissionError);
  assert.throws(() => prepareJp5Submission(account(), { kind: "PASSWORD_REQUIRED", password: "secret" }), Jp5SubmissionError);
  for (const identifier of ["", "bad\r\nSECRET", "\ud800", "x".repeat(16_385)])
    assert.throws(() => prepareJp5Submission(account(), { kind: "ACCOUNT_REQUIRED", identifier }),
      (e) => e instanceof Jp5SubmissionError && e.message === "JP5_SUBMISSION_INPUT");
  const plan = prepareJp5Submission(account(), { kind: "ACCOUNT_REQUIRED", identifier: "user" });
  for (const bad of [{}, { ...runtime, castleToken: "" }, { ...runtime, transactionId: "bad\nSECRET" },
    { ...runtime, preludeDispatchId: "unexpected" }])
    assert.throws(() => plan.encodeForTransport(bad as Jp5RuntimeFields), Jp5SubmissionError);
});
test("encoded size limit applies after percent expansion without exposing the body", () => {
  const plan = prepareJp5Submission(account(), { kind: "ACCOUNT_REQUIRED", identifier: "密".repeat(8000) });
  assert.throws(() => plan.encodeForTransport(runtime),
    (e) => e instanceof Jp5SubmissionError && e.message === "JP5_SUBMISSION_SIZE");
});
