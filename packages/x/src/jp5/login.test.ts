import test from "node:test";
import assert from "node:assert/strict";
import { runJp5Login, Jp5LoginError, type Jp5LoginAdapter } from "./login";
import type { Jp5LoginState } from "./state";

const states = (): Jp5LoginState[] => [
  { kind: "ACCOUNT_REQUIRED", action: "/onboarding/web/actions/begin_login", fields: new Map([["username_or_email", ""]]) },
  { kind: "PASSWORD_REQUIRED", action: "/onboarding/web/actions/login_enter_password", fields: new Map([["username", "demo"], ["password", ""], ["session_token", "session-1"]]) },
  { kind: "VERIFICATION_PREPARATION_REQUIRED", action: "/onboarding/web/actions/begin_login_acid", fields: new Map([["prelude_dispatch_id", ""], ["from_prelude_gate", "1"], ["session_token", "session-2"]]) },
  { kind: "CODE_REQUIRED", action: "/onboarding/web/actions/finish_login_acid", fields: new Map([["code", ""], ["destination", "masked@example.test"], ["session_token", "session-3"]]) },
  { kind: "LOGIN_COMPLETED_UNVERIFIED", account: new Map([["user_id", "123"], ["username", "demo"]]) },
];
function fixture(sequence = states()) {
  const events: string[] = [];
  const inputs = ["demo", "password-fixture", "123456", "yes"];
  const adapter: Jp5LoginAdapter = {
    assertAvailable() { events.push("available"); },
    async start() { events.push("start"); return sequence.shift()!; },
    async submit(plan) { events.push(plan.url.split("/").at(-1)!); return sequence.shift()!; },
    async verify() { events.push("verify"); return { identity: { userId: "123", username: "demo" }, authToken: "auth-fixture", csrfToken: "csrf-fixture" }; },
  };
  const prompt = async (_label: string, secret = false) => {
    events.push(secret ? "secret" : "prompt"); return inputs.shift()!;
  };
  return { adapter, prompt, events };
}
test("four-step flow verifies identity before confirmation and returns session", async () => {
  const f = fixture();
  assert.equal((await runJp5Login(f.adapter, f.prompt, new AbortController().signal)).identity.userId, "123");
  assert.deepEqual(f.events, ["available", "start", "prompt", "begin_login", "secret", "login_enter_password", "begin_login_acid", "secret", "finish_login_acid", "verify", "prompt"]);
});
test("unavailable runtime fails before network or prompting", async () => {
  const f = fixture();
  f.adapter.assertAvailable = () => { throw new Jp5LoginError("AUTH_RUNTIME_UNAVAILABLE"); };
  await assert.rejects(runJp5Login(f.adapter, f.prompt, new AbortController().signal), /AUTH_RUNTIME_UNAVAILABLE/);
  assert.deepEqual(f.events, []);
});
test("repeated state stops without retry or identity verification", async () => {
  const f = fixture([states()[0]!, states()[0]!]);
  await assert.rejects(runJp5Login(f.adapter, f.prompt, new AbortController().signal), /AUTH_FLOW_INVALID/);
  assert.ok(!f.events.includes("verify"));
});
test("completion candidate requires an independent matching identity", async () => {
  const f = fixture([states()[0]!, states()[4]!]);
  f.adapter.verify = async () => ({ identity: { userId: "456", username: "another" }, authToken: "auth", csrfToken: "csrf" });
  await assert.rejects(runJp5Login(f.adapter, f.prompt, new AbortController().signal), /X_IDENTITY_MISMATCH/);
  assert.equal(f.events.filter(e => e === "prompt").length, 1);
});
test("cancellation during prompt prevents submission", async () => {
  const f = fixture(); const controller = new AbortController();
  await assert.rejects(runJp5Login(f.adapter, async () => { controller.abort(); return "demo"; }, controller.signal), /AUTH_CANCELLED/);
  assert.deepEqual(f.events, ["available", "start"]);
});
test("confirmation refusal and invalid cookies never return a session", async () => {
  const f = fixture([states()[0]!, states()[4]!]);
  await assert.rejects(runJp5Login(f.adapter, async () => "no", new AbortController().signal), /AUTH_NOT_CONFIRMED/);
  const g = fixture([states()[0]!, states()[4]!]);
  g.adapter.verify = async () => ({ identity: { userId: "123", username: "demo" }, authToken: "", csrfToken: "csrf" });
  await assert.rejects(runJp5Login(g.adapter, g.prompt, new AbortController().signal), /AUTH_SESSION_INVALID/);
});
