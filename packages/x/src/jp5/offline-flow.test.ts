import test from "node:test";
import assert from "node:assert/strict";
import { inspectOfflineLoginFlow, OfflineLoginError, type OfflineLoginStep } from "./offline-flow";

const config = { language: "zh-CN", timezone: "Asia/Shanghai", timeoutMs: 15000 };
const account: OfflineLoginStep = {
  state: { kind: "ACCOUNT_REQUIRED", action: "/onboarding/web/actions/begin_login",
    fields: new Map([["username_or_email", ""]]) },
  input: { kind: "ACCOUNT_REQUIRED", identifier: "secret@example.test" },
};
test("offline report exposes missing runtime without disclosing form values", () => {
  const result = inspectOfflineLoginFlow(config, [account]);
  assert.equal(result.fixtureSequenceComplete, false);
  assert.equal(result.liveExecution.status, "BLOCKED_RUNTIME_UNAVAILABLE");
  assert.deepEqual(result.stages[0]?.requiredRuntime, ["castleToken", "transactionId"]);
  assert.equal(JSON.stringify(result).includes("secret@example.test"), false);
  assert.ok(result.remainingGates.includes("HOME_TIMELINE"));
});
test("out of order, empty and invalid configuration fail closed", () => {
  assert.throws(() => inspectOfflineLoginFlow(config, []), OfflineLoginError);
  assert.throws(() => inspectOfflineLoginFlow(config, [account, account]), OfflineLoginError);
  for (const invalid of [{ ...config, timezone: "invalid/zone" }, { ...config, timeoutMs: NaN },
    { ...config, language: "bad\r\nvalue" }])
    assert.throws(() => inspectOfflineLoginFlow(invalid, [account]), OfflineLoginError);
});
test("completion cannot skip the four observed form stages", () => {
  const completion: OfflineLoginStep = { state: { kind: "LOGIN_COMPLETED_UNVERIFIED", account: new Map() } };
  assert.throws(() => inspectOfflineLoginFlow(config, [completion]), OfflineLoginError);
  assert.throws(() => inspectOfflineLoginFlow(config, [account, completion]), OfflineLoginError);
});
