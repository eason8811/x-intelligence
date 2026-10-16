/** JP-5 decoded data only. This module never executes page actions or requests. */
export interface Jp5Element {
  props: ReadonlyMap<number, number>;
  children: readonly number[];
}
export type Jp5Property = readonly [tag: number, value: unknown];
export interface Jp5Snapshot {
  version: string;
  root: number;
  elements: readonly Jp5Element[];
  properties: readonly Jp5Property[];
}
export type Jp5LoginState =
  | { kind: "ACCOUNT_REQUIRED" | "PASSWORD_REQUIRED" | "VERIFICATION_PREPARATION_REQUIRED" | "CODE_REQUIRED";
      action: string; fields: ReadonlyMap<string, string> }
  | { kind: "LOGIN_COMPLETED_UNVERIFIED"; account: ReadonlyMap<string, string> };

export class Jp5StateError extends Error {
  constructor(public readonly code: "JP5_VERSION_UNSUPPORTED" | "JP5_INVALID_STATE" |
    "JP5_UNKNOWN_STATE" | "JP5_AMBIGUOUS_STATE" | "JP5_FORM_ERROR") {
    super(code);
  }
}
function invalid(): never { throw new Jp5StateError("JP5_INVALID_STATE"); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function tuple(value: unknown): unknown[] {
  if (!Array.isArray(value)) return invalid();
  return value;
}
function index(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return invalid();
  return value;
}
function strings(value: unknown): Map<string, string> {
  if (!(value instanceof Map)) return invalid();
  const result = new Map<string, string>();
  for (const [key, item] of value) {
    if (typeof key !== "string" || typeof item !== "string") return invalid();
    result.set(key, item);
  }
  return result;
}

export function extractJp5LoginState(snapshot: Jp5Snapshot): Jp5LoginState {
  if (snapshot.version !== "JP-5") throw new Jp5StateError("JP5_VERSION_UNSUPPORTED");
  const property = (ref: unknown): Jp5Property => {
    const item = snapshot.properties[index(ref)];
    if (!item || item.length !== 2) return invalid();
    return item;
  };
  const element = (ref: unknown): Jp5Element => {
    const item = snapshot.elements[index(ref)];
    if (!item || !(item.props instanceof Map) || !Array.isArray(item.children)) return invalid();
    return item;
  };
  const root = element(snapshot.root);
  if (root.props.size !== 1) throw new Jp5StateError("JP5_UNKNOWN_STATE");
  const [rootTag, rootValue] = property([...root.props.values()][0]);
  // The captured landing is a direct container tree; later steps use navigation previews.
  const directLanding = rootTag === 3 && root.children.length === 1;
  if (!directLanding && (rootTag !== 19 || root.children.length !== 0))
    throw new Jp5StateError("JP5_UNKNOWN_STATE");
  const rootAction = directLanding ? [] : tuple(rootValue);
  if (rootAction[0] === 2) {
    const actions = tuple(rootAction[1]);
    const systems = actions.map(tuple).filter(([tag]) => tag === 11);
    if (systems.length !== 1) throw new Jp5StateError("JP5_UNKNOWN_STATE");
    const system = object(systems[0]![1]);
    if (system.type !== 8) throw new Jp5StateError("JP5_UNKNOWN_STATE");
    // Only the observed change/open_account/scribe completion bundle is admitted.
    if (actions.some((action) => ![0, 10, 11].includes(tuple(action)[0] as number)))
      throw new Jp5StateError("JP5_UNKNOWN_STATE");
    const [tag, value] = property(system.ref);
    if (tag !== 17) return invalid();
    const account = strings(value);
    if (!account.get("user_id") || !account.get("username")) return invalid();
    return { kind: "LOGIN_COMPLETED_UNVERIFIED", account };
  }
  if (!directLanding && rootAction[0] !== 6) throw new Jp5StateError("JP5_UNKNOWN_STATE");
  const navigation = directLanding ? [0, {}] : tuple(rootAction[1]);
  if (navigation[0] !== 0) throw new Jp5StateError("JP5_UNKNOWN_STATE");
  const preview = object(navigation[1]).preview;
  const visited = new Set<string>();
  const active = new Set<string>();
  const forms = new Map<number, unknown[]>();
  function visit(kind: "element" | "property", ref: unknown): void {
    const id = index(ref), key = `${kind}:${id}`;
    if (active.has(key)) return invalid();
    if (visited.has(key)) return;
    // Explicit stack bound before recursive traversal can exhaust the JS stack.
    if (active.size >= 128) return invalid();
    active.add(key);
    if (kind === "element") {
      const value = element(id);
      for (const child of value.children) visit("element", child);
      for (const prop of value.props.values()) visit("property", prop);
    } else {
      const [tag, value] = property(id);
      if (tag === 30) forms.set(id, tuple(value));
      else if (tag === 7) visit("element", value);
      else if (tag === 8) for (const child of tuple(value)) visit("element", child);
      else if (tag === 18) visit("property", object(value).prop_ref);
      else if (tag === 31) {
        const reference = tuple(object(value).ref);
        // Only error/status references observed on the three active forms.
        if (reference[0] !== 8 && reference[0] !== 10)
          throw new Jp5StateError("JP5_UNKNOWN_STATE");
        visit("property", object(reference[1]).root);
      }
      else if (tag === 19) {
        const action = tuple(value);
        if (action[0] === 15) visit("property", object(action[1]).ref);
        // Link navigation previews are inactive, not part of the active form.
        else if (action[0] !== 6 && action[0] !== 0)
          throw new Jp5StateError("JP5_UNKNOWN_STATE");
      } else if (![0, 1, 3, 6, 10, 11, 17, 22].includes(tag))
        throw new Jp5StateError("JP5_UNKNOWN_STATE");
    }
    active.delete(key);
    visited.add(key);
  }
  if (directLanding) visit("element", snapshot.root);
  else visit("property", preview);
  if (forms.size > 1) throw new Jp5StateError("JP5_AMBIGUOUS_STATE");
  if (!forms.size) throw new Jp5StateError("JP5_UNKNOWN_STATE");
  const form = [...forms.values()][0]!;
  if (form.length !== 5 || typeof form[0] !== "string") return invalid();
  const fields = strings(form[1]), errors = strings(form[2]);
  if (errors.size || form[4] !== 0) throw new Jp5StateError("JP5_FORM_ERROR");
  if (directLanding !== (form[0] === "/onboarding/web/actions/begin_login"))
    throw new Jp5StateError("JP5_UNKNOWN_STATE");
  const definitions = {
    "/onboarding/web/actions/begin_login": ["ACCOUNT_REQUIRED", ["username_or_email"]],
    "/onboarding/web/actions/login_enter_password": ["PASSWORD_REQUIRED", ["username", "password", "session_token"]],
    "/onboarding/web/actions/begin_login_acid": ["VERIFICATION_PREPARATION_REQUIRED", ["prelude_dispatch_id", "from_prelude_gate", "session_token"]],
    "/onboarding/web/actions/finish_login_acid": ["CODE_REQUIRED", ["code", "destination", "session_token"]],
  } as const;
  const definition = Object.hasOwn(definitions, form[0])
    ? definitions[form[0] as keyof typeof definitions] : undefined;
  if (!definition) throw new Jp5StateError("JP5_UNKNOWN_STATE");
  if (fields.size !== definition[1].length || definition[1].some((key) => !fields.has(key)) ||
    (form[0] !== "/onboarding/web/actions/begin_login" && !fields.get("session_token"))) return invalid();
  return { kind: definition[0], action: form[0], fields };
}
