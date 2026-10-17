import type { Jp5LoginState } from "./state";

export type Jp5LoginInput =
  | { kind: "ACCOUNT_REQUIRED"; identifier: string; linkedPassword?: string }
  | { kind: "PASSWORD_REQUIRED"; password: string }
  | { kind: "VERIFICATION_PREPARATION_REQUIRED" }
  | { kind: "CODE_REQUIRED"; code: string };
/** Trusted same-flow runtime output, not captured tokens or generated substitutes.
 * Presence validation cannot authenticate provenance or prove server acceptance. */
export interface Jp5RuntimeFields {
  castleToken: string;
  transactionId: string;
  preludeDispatchId?: string;
}
export class Jp5SubmissionError extends Error {
  constructor(public readonly code: "JP5_SUBMISSION_STATE" | "JP5_SUBMISSION_INPUT" |
    "JP5_SUBMISSION_RUNTIME" | "JP5_SUBMISSION_SIZE") { super(code); }
}
const fail = (code: Jp5SubmissionError["code"]): never => { throw new Jp5SubmissionError(code); };
const definitions = {
  ACCOUNT_REQUIRED: ["begin_login", ["username_or_email"]],
  PASSWORD_REQUIRED: ["login_enter_password", ["username", "password", "session_token"]],
  VERIFICATION_PREPARATION_REQUIRED: ["begin_login_acid", ["prelude_dispatch_id", "from_prelude_gate", "session_token"]],
  CODE_REQUIRED: ["finish_login_acid", ["code", "destination", "session_token"]],
} as const;
function value(input: unknown, code: Jp5SubmissionError["code"], nonempty = true): string {
  if (typeof input !== "string" || (nonempty && !input.length) || input.length > 16_384 ||
    /[\u0000\r\n]/.test(input) || new TextDecoder("utf-8", { ignoreBOM: true }).decode(new TextEncoder().encode(input)) !== input) return fail(code);
  return input;
}
/** Offline only: no HTTP, SDK execution, retries, logging or persistence. */
export function prepareJp5Submission(state: Jp5LoginState, input: Jp5LoginInput) {
  if (state.kind === "LOGIN_COMPLETED_UNVERIFIED" || state.kind !== input.kind ||
    !Object.hasOwn(definitions, state.kind)) return fail("JP5_SUBMISSION_STATE");
  const [action, keys] = definitions[state.kind];
  if (state.action !== `/onboarding/web/actions/${action}` || !(state.fields instanceof Map) ||
    state.fields.size !== keys.length || keys.some((key) => !state.fields.has(key)))
    return fail("JP5_SUBMISSION_STATE");
  const fields = new Map<string, string>();
  for (const [key, item] of state.fields) fields.set(key, value(item, "JP5_SUBMISSION_STATE", false));
  if (state.kind !== "ACCOUNT_REQUIRED" && !fields.get("session_token")) return fail("JP5_SUBMISSION_STATE");
  switch (input.kind) {
    case "ACCOUNT_REQUIRED":
      fields.set("username_or_email", value(input.identifier, "JP5_SUBMISSION_INPUT"));
      if (input.linkedPassword !== undefined)
        fields.set("password", value(input.linkedPassword, "JP5_SUBMISSION_INPUT", false));
      break;
    case "PASSWORD_REQUIRED":
      fields.set("password", value(input.password, "JP5_SUBMISSION_INPUT")); break;
    case "CODE_REQUIRED":
      if (!/^[a-zA-Z0-9]+$/.test(value(input.code, "JP5_SUBMISSION_INPUT"))) return fail("JP5_SUBMISSION_INPUT");
      fields.set("code", input.code); break;
    case "VERIFICATION_PREPARATION_REQUIRED": break;
  }
  const verification = input.kind === "VERIFICATION_PREPARATION_REQUIRED";
  const url = `https://jf.x.com/onboarding/web/actions/${action}`;
  return Object.freeze({
    url, method: "POST" as const,
    // Deliberately conservative requirement until normal runtime and omission semantics are established.
    requiredRuntime: Object.freeze(state.kind === "VERIFICATION_PREPARATION_REQUIRED"
      ? ["castleToken", "transactionId", "preludeDispatchId"] as const : ["castleToken", "transactionId"] as const),
    /** Contains secrets. Only the future trusted HTTP adapter may consume this result. */
    encodeForTransport(runtime: Jp5RuntimeFields) {
      if (!runtime || typeof runtime !== "object") return fail("JP5_SUBMISSION_RUNTIME");
      const castle = value(runtime.castleToken, "JP5_SUBMISSION_RUNTIME");
      const transaction = value(runtime.transactionId, "JP5_SUBMISSION_RUNTIME");
      if (!/^[\x21-\x7e]+$/.test(transaction)) return fail("JP5_SUBMISSION_RUNTIME");
      const outgoing = new Map(fields);
      if (verification)
        outgoing.set("prelude_dispatch_id", value(runtime.preludeDispatchId, "JP5_SUBMISSION_RUNTIME"));
      else if (runtime.preludeDispatchId !== undefined) return fail("JP5_SUBMISSION_RUNTIME");
      outgoing.set("$castle_token", castle);
      const body = new URLSearchParams([...outgoing]).toString();
      if (new TextEncoder().encode(body).length > 65_536) return fail("JP5_SUBMISSION_SIZE");
      return Object.freeze({ body, headers: Object.freeze({
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "x-client-transaction-id": transaction,
      }) });
    },
  });
}
