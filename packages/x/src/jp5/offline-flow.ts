import type { Jp5LoginState } from "./state";
import { prepareJp5Submission, type Jp5LoginInput } from "./submission";

export interface OfflineLoginConfig {
  language: string;
  timezone: string;
  timeoutMs: number;
}
export class OfflineLoginError extends Error {
  constructor(public readonly code: "OFFLINE_CONFIG_INVALID" | "OFFLINE_FLOW_ORDER" | "OFFLINE_FLOW_INCOMPLETE") {
    super(code);
  }
}
const order = ["ACCOUNT_REQUIRED", "PASSWORD_REQUIRED", "VERIFICATION_PREPARATION_REQUIRED", "CODE_REQUIRED"] as const;
export interface OfflineLoginStep { state: Jp5LoginState; input?: Jp5LoginInput }

/** Synthetic fixtures only. No transport, SDK provider, credentials persistence or token injection. */
export function inspectOfflineLoginFlow(config: OfflineLoginConfig, steps: readonly OfflineLoginStep[]) {
  if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(config.language) ||
      !Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 1 || config.timeoutMs > 60_000)
    throw new OfflineLoginError("OFFLINE_CONFIG_INVALID");
  try { new Intl.DateTimeFormat("en", { timeZone: config.timezone }); }
  catch { throw new OfflineLoginError("OFFLINE_CONFIG_INVALID"); }
  const stages: { stage: string; action?: string; requiredRuntime?: readonly string[] }[] = [];
  for (const [index, step] of steps.entries()) {
    if (index === order.length) {
      if (step.state.kind !== "LOGIN_COMPLETED_UNVERIFIED" || step.input || steps.length !== order.length + 1)
        throw new OfflineLoginError("OFFLINE_FLOW_ORDER");
      stages.push({ stage: step.state.kind });
      continue;
    }
    if (index > order.length || step.state.kind !== order[index] || !step.input)
      throw new OfflineLoginError("OFFLINE_FLOW_ORDER");
    const plan = prepareJp5Submission(step.state, step.input);
    stages.push({ stage: step.state.kind, action: plan.url, requiredRuntime: plan.requiredRuntime });
  }
  if (!steps.length) throw new OfflineLoginError("OFFLINE_FLOW_INCOMPLETE");
  return {
    mode: "OFFLINE_ONLY" as const,
    fixtureSequenceComplete: steps.length === order.length + 1,
    stages,
    liveExecution: {
      status: "BLOCKED_RUNTIME_UNAVAILABLE" as const,
      missingCapabilities: ["castle", "transaction", "prelude"],
    },
    remainingGates: ["HTTP_POST_ADAPTER", "REMOTE_IDENTITY_CHECK", "SESSION_SAVE_AND_REUSE", "HOME_TIMELINE"],
  };
}
