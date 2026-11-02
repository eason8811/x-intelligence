import { assertXHomeIdentity, type XHomeIdentity } from "./identity";
import { prepareJp5Submission, type Jp5LoginInput } from "./submission";
import type { Jp5LoginState } from "./state";

export class Jp5LoginError extends Error {
  constructor(public readonly code: "AUTH_RUNTIME_UNAVAILABLE" | "AUTH_CANCELLED" |
    "AUTH_FLOW_INVALID" | "AUTH_INVALID_ARGUMENT" | "AUTH_INTERACTIVE_TERMINAL_REQUIRED" |
    "AUTH_SESSION_INVALID" | "AUTH_NOT_CONFIRMED") {
    super(code);
  }
}
export type Jp5LoginPrompt = (label: string, secret?: boolean) => Promise<string>;
export interface Jp5LoginSession {
  identity: XHomeIdentity;
  authToken: string;
  csrfToken: string;
}
/** One owned live flow. submit must resolve runtime fields and consume the plan in
 * that same context; verify must independently read the authenticated identity.
 * No captured-token injection or SDK investigation entrypoint is wired here. */
export interface Jp5LoginAdapter {
  assertAvailable(): void;
  start(signal: AbortSignal): Promise<Jp5LoginState>;
  submit(plan: ReturnType<typeof prepareJp5Submission>, signal: AbortSignal): Promise<Jp5LoginState>;
  verify(signal: AbortSignal): Promise<Jp5LoginSession>;
}
const transitions: Record<Jp5LoginState["kind"], readonly Jp5LoginState["kind"][]> = {
  ACCOUNT_REQUIRED: ["PASSWORD_REQUIRED", "VERIFICATION_PREPARATION_REQUIRED", "CODE_REQUIRED", "LOGIN_COMPLETED_UNVERIFIED"],
  PASSWORD_REQUIRED: ["VERIFICATION_PREPARATION_REQUIRED", "CODE_REQUIRED", "LOGIN_COMPLETED_UNVERIFIED"],
  VERIFICATION_PREPARATION_REQUIRED: ["CODE_REQUIRED", "LOGIN_COMPLETED_UNVERIFIED"],
  CODE_REQUIRED: ["LOGIN_COMPLETED_UNVERIFIED"],
  LOGIN_COMPLETED_UNVERIFIED: [],
};
/** State-driven orchestration; no persistence, logging, retry or network of its own. */
export async function runJp5Login(
  adapter: Jp5LoginAdapter,
  prompt: Jp5LoginPrompt,
  signal: AbortSignal,
): Promise<Jp5LoginSession> {
  const check = () => { if (signal.aborted) throw new Jp5LoginError("AUTH_CANCELLED"); };
  check();
  adapter.assertAvailable(); // Before network and before asking for account secrets.
  let state = await adapter.start(signal);
  check();
  if (state.kind !== "ACCOUNT_REQUIRED") throw new Jp5LoginError("AUTH_FLOW_INVALID");
  while (state.kind !== "LOGIN_COMPLETED_UNVERIFIED") {
    check();
    let input: Jp5LoginInput;
    switch (state.kind) {
      case "ACCOUNT_REQUIRED":
        input = { kind: state.kind, identifier: (await prompt("用户名或邮箱：")).trim() }; break;
      case "PASSWORD_REQUIRED":
        input = { kind: state.kind, password: await prompt("密码：", true) }; break;
      case "VERIFICATION_PREPARATION_REQUIRED":
        input = { kind: state.kind }; break;
      case "CODE_REQUIRED":
        input = { kind: state.kind, code: (await prompt("验证码：", true)).trim() }; break;
      default: throw new Jp5LoginError("AUTH_FLOW_INVALID");
    }
    check();
    const next = await adapter.submit(prepareJp5Submission(state, input), signal);
    check();
    if (!transitions[state.kind].includes(next.kind)) throw new Jp5LoginError("AUTH_FLOW_INVALID");
    state = next;
  }
  const expected = { userId: state.account.get("user_id") ?? "", username: state.account.get("username") ?? "" };
  const session = await adapter.verify(signal);
  check();
  assertXHomeIdentity(session.identity, expected);
  if (![session.authToken, session.csrfToken].every((value) => typeof value === "string" && /^[^\s;,]+$/.test(value)))
    throw new Jp5LoginError("AUTH_SESSION_INVALID");
  if ((await prompt(`确认账号 @${session.identity.username}（${session.identity.userId}）？输入 yes：`)).trim() !== "yes")
    throw new Jp5LoginError("AUTH_NOT_CONFIRMED");
  check();
  return session;
}
