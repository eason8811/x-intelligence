import type { Jp5Element, Jp5Property, Jp5Snapshot } from "./state";

/** Limited to complete JP-5 dom_data + dom_ready responses, never executes actions. */
export class Jp5CodecError extends Error {
  constructor(public readonly code: "JP5_VERSION_UNSUPPORTED" | "JP5_INVALID_BYTES" |
    "JP5_LIMIT_EXCEEDED" | "JP5_UNSUPPORTED_TAG" | "JP5_UNSUPPORTED_MESSAGES") { super(code); }
}
type Decode = () => unknown;
const fail = (code: Jp5CodecError["code"] = "JP5_INVALID_BYTES"): never => { throw new Jp5CodecError(code); };
const MAX_BYTES = 1024 * 1024;
const MAX_ITEMS = 100_000;

class Reader {
  offset = 0;
  private items = 0;
  private depth = 0;
  private view: DataView;
  constructor(private bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  private take(n: number): number {
    if (!Number.isSafeInteger(n) || n < 0 || n > this.bytes.length - this.offset) return fail();
    const start = this.offset; this.offset += n; return start;
  }
  u8 = (): number => this.view.getUint8(this.take(1));
  i16 = (): number => this.view.getInt16(this.take(2), true);
  i32 = (): number => this.view.getInt32(this.take(4), true);
  i64 = (): bigint => this.view.getBigInt64(this.take(8), true);
  f64 = (): number => {
    const value = this.view.getFloat64(this.take(8), true);
    if (!Number.isFinite(value)) return fail();
    return value;
  };
  bool = (): boolean => { const value = this.u8(); if (value > 1) return fail(); return value === 1; };
  uint = (): number => {
    let value = 0;
    for (let shift = 0; shift <= 49; shift += 7) {
      const byte = this.u8(); value += (byte & 127) * 2 ** shift;
      if (!Number.isSafeInteger(value)) return fail();
      if (!(byte & 128)) {
        if (shift && byte === 0) return fail();
        return value;
      }
    }
    return fail();
  };
  str = (): string => {
    const length = this.uint(), start = this.take(length);
    try { return new TextDecoder("utf-8", { fatal: true }).decode(this.bytes.subarray(start, start + length)); }
    catch { return fail(); }
  };
  nested<T>(read: () => T): T {
    if (++this.depth > 64) return fail("JP5_LIMIT_EXCEEDED");
    try { return read(); } finally { this.depth--; }
  }
  count(): number {
    const n = this.uint(); this.items += n;
    if (this.items > MAX_ITEMS) return fail("JP5_LIMIT_EXCEEDED");
    return n;
  }
  list = (read: Decode): Decode => () => this.nested(() => {
    const count = this.count(), result: unknown[] = [];
    for (let i = 0; i < count; i++) result.push(read());
    return result;
  });
  map = (key: Decode, value: Decode): Decode => () => this.nested(() => {
    const count = this.count(), result = new Map<unknown, unknown>();
    for (let i = 0; i < count; i++) {
      const k = key(); if (result.has(k)) return fail(); result.set(k, value());
    }
    return result;
  });
  optional = (read: Decode): Decode => () => this.bool() ? read() : null;
  tuple = (...reads: Decode[]): Decode => () => this.nested(() => reads.map((read) => read()));
  object = (fields: Record<string, Decode>): Decode => () => this.nested(() => {
    const result: Record<string, unknown> = {};
    for (const [key, read] of Object.entries(fields)) result[key] = read();
    return result;
  });
  variant = (choices: Record<number, Decode>): Decode => () => this.nested(() => {
    const tag = this.u8(), read = choices[tag];
    if (!read) return fail("JP5_UNSUPPORTED_TAG");
    return [tag, read()];
  });
}

function message(reader: Reader): unknown {
  const r = reader, u = r.uint, i = r.i16, s = r.str, b = r.bool;
  const list = r.list, map = r.map, opt = r.optional, tuple = r.tuple, obj = r.object;
  const reference = r.variant({
    0: obj({ id: r.i64 }), 4: obj({ id: r.i64, root: u }),
    1: obj({ key: i, root: u }), 2: obj({ key: s, root: u }), 3: obj({ key: s, root: u }),
    5: obj({ root: u }), 6: obj({ root: u }), 7: obj({ key: s, root: u }),
    8: obj({ key: s, root: u }), 9: obj({ root: u }), 10: obj({ root: u }), 11: obj({ root: u }),
  });
  const change = r.variant({
    0: reference, 1: tuple(reference, u), 2: tuple(reference, i), 3: tuple(reference, s),
    4: tuple(reference, u, opt(i)), 5: tuple(reference, u), 6: tuple(reference, opt(tuple(u, u))),
    7: tuple(reference, u), 8: tuple(reference, u),
  });
  const readNav = r.variant({
    0: obj({ url: u, preview: opt(u), replace: b }),
    1: obj({ url: u, body: opt(u), preview: opt(u), replace: b }),
    9: obj({ url: u, preview: opt(u), replace: b }),
    2: () => undefined, 3: () => undefined, 4: () => undefined,
    5: () => undefined, 6: () => undefined, 7: obj({ id: u }), 8: obj({ url: u }),
  });
  const nav: Decode = () => {
    const value = readNav() as [number, unknown];
    return [2, 3, 4, 5, 6].includes(value[0]) ? [value[0]] : value;
  };
  const action: Decode = () => readAction();
  const readAction = r.variant({
    0: change, 1: obj({ ref: u, action, cancel: opt(action) }), 2: list(action),
    3: obj({ url: u, body: u, complete: opt(action), error: opt(action), optimistic: opt(action) }),
    4: obj({ action, intensity: i }), 5: obj({ ref: u, type: r.u8 }), 6: nav,
    7: obj({ type: r.u8, id: opt(r.i64) }), 8: s,
    9: obj({ urls: list(s), priority: r.u8 }), 10: obj({ action: s, ref: u }),
    11: obj({ type: r.u8, ref: u }), 12: obj({ action, delaySeconds: i }),
    13: obj({ data: s, secret: s, knownDeviceToken: s }), 14: obj({ text: s, dismissText: opt(s) }),
    15: obj({ ref: u, to: u }), 16: obj({ ref: u, fields: list(s) }),
    17: obj({ ref: u, using: u }), 18: obj({ ref: u, field: s }),
    19: obj({ ref: u, type: r.u8, allowsRotation: b }),
    20: obj({ ref: u, overlay: u, mode: s }), 21: obj({ ref: u, duration: i, animation: b }),
  });
  const predicate: Decode = () => readPredicate();
  const readPredicate = r.variant({
    0: obj({ ref: reference }), 15: obj({ ref: reference }),
    ...Object.fromEntries([1, 2, 5, 6, 7, 8].map((tag) => [tag, obj({ ref: reference, value: u })])),
    3: obj({ ref: reference, value: list(u) }), 4: obj({ ref: reference, value: list(u) }),
    9: obj({ ref: reference, value: s }), 10: obj({ ref: reference, value: s }),
    11: obj({ ref: reference, value: s }), 12: tuple(predicate, predicate),
    13: tuple(predicate, predicate), 14: predicate,
  });
  const mods = list(list(r.i32));
  const property = r.variant({
    0: s, 1: r.i32, 3: mods, 4: r.i64, 5: r.f64, 6: b, 7: u, 8: list(u),
    10: u, 11: s, 12: list(tuple(r.u8, s, opt(s))), 14: r.i64, 15: u,
    16: map(i, u), 17: map(s, s),
    18: obj({ ref: reference, prop_ref: u, is_default: b }), 19: action,
    21: list(u), 22: predicate, 24: list(u), 25: list(tuple(mods, predicate)),
    26: list(s), 27: list(r.i32), 28: list(r.f64), 29: list(b),
    30: tuple(s, map(s, s), map(s, s), s, r.u8), 31: obj({ ref: reference }),
    13: () => undefined,
  });
  return r.variant({
    0: obj({ els: list(obj({ type: i, props: map(i, u), children: list(u), id: opt(r.i64), extend: opt(u) })),
      props: list(property), ts: r.i32 }),
    1: obj({ ref: u, t: opt(r.i32) }),
  })();
}

export function decodeJp5Snapshot(bytes: Uint8Array, version: string): Jp5Snapshot {
  if (version !== "JP-5") return fail("JP5_VERSION_UNSUPPORTED");
  if (bytes.byteLength > MAX_BYTES) return fail("JP5_LIMIT_EXCEEDED");
  const frames: unknown[] = [], view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset < bytes.byteLength) {
    if (frames.length >= 2) return fail("JP5_UNSUPPORTED_MESSAGES");
    if (bytes.byteLength - offset < 4) return fail();
    const length = view.getUint32(offset, true); offset += 4;
    if (!length || length > bytes.byteLength - offset) return fail();
    const reader = new Reader(bytes.subarray(offset, offset + length));
    frames.push(message(reader));
    if (reader.offset !== length) return fail();
    offset += length;
  }
  const [dataFrame, readyFrame] = frames as [number, Record<string, unknown>][];
  if (frames.length !== 2 || dataFrame?.[0] !== 0 || readyFrame?.[0] !== 1)
    return fail("JP5_UNSUPPORTED_MESSAGES");
  const data = dataFrame[1], ready = readyFrame[1];
  const root = ready.ref as number, elements = data.els as Jp5Element[];
  if (root >= elements.length) return fail();
  return { version, root, elements, properties: data.props as Jp5Property[] };
}
