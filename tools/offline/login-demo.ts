import { inspectOfflineLoginFlow, type OfflineLoginStep } from "../../packages/x/src/jp5/offline-flow";

// All values are synthetic. Never load captures, account credentials or SDK outputs here.
const steps: OfflineLoginStep[] = [
  { state: { kind: "ACCOUNT_REQUIRED", action: "/onboarding/web/actions/begin_login",
    fields: new Map([["username_or_email", ""]]) }, input: { kind: "ACCOUNT_REQUIRED", identifier: "demo@example.test" } },
  { state: { kind: "PASSWORD_REQUIRED", action: "/onboarding/web/actions/login_enter_password",
    fields: new Map([["username", "demo"], ["password", ""], ["session_token", "synthetic-session-1"]]) },
    input: { kind: "PASSWORD_REQUIRED", password: "synthetic-password" } },
  { state: { kind: "VERIFICATION_PREPARATION_REQUIRED", action: "/onboarding/web/actions/begin_login_acid",
    fields: new Map([["prelude_dispatch_id", ""], ["from_prelude_gate", "1"], ["session_token", "synthetic-session-2"]]) },
    input: { kind: "VERIFICATION_PREPARATION_REQUIRED" } },
  { state: { kind: "CODE_REQUIRED", action: "/onboarding/web/actions/finish_login_acid",
    fields: new Map([["code", ""], ["destination", "masked@example.test"], ["session_token", "synthetic-session-3"]]) },
    input: { kind: "CODE_REQUIRED", code: "000000" } },
  { state: { kind: "LOGIN_COMPLETED_UNVERIFIED", account: new Map([["user_id", "123"], ["username", "demo"]]) } },
];
try {
  const result = inspectOfflineLoginFlow({
    language: process.env.X_OFFLINE_LANGUAGE ?? "zh-CN",
    timezone: process.env.X_OFFLINE_TIMEZONE ?? "Asia/Shanghai",
    timeoutMs: Number(process.env.X_OFFLINE_TIMEOUT_MS ?? 15000),
  }, steps);
  console.log(JSON.stringify(result, null, 2));
} catch {
  console.error("OFFLINE_DEMO_FAILED: configuration or synthetic sequence invalid");
  process.exitCode = 1;
}
