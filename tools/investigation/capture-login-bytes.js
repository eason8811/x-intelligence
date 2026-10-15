/* Run as a Chrome DevTools Snippet on https://x.com/ before submitting login. */
(() => {
  "use strict";
  if (location.origin !== "https://x.com") throw new Error("Open https://x.com/ first");
  if (globalThis.xLoginBytes) throw new Error("Capture already installed");
  const original = globalThis.fetch;
  const actions = new Set(["begin_login", "login_enter_password", "begin_login_acid", "finish_login_acid"]);
  const records = [];
  let sequence = 0;
  const download = (record) => {
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `x-login-bytes-${record.sequence}-${record.action}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  async function wrapped(...args) {
    const request = args[0];
    const url = new URL(typeof request === "string" || request instanceof URL ? String(request) : request.url, location.href);
    const action = url.pathname.split("/").at(-1);
    const selected = url.origin === "https://jf.x.com" &&
      url.pathname === `/onboarding/web/actions/${action}` && actions.has(action);
    const id = selected ? ++sequence : null;
    const response = await Reflect.apply(original, this, args);
    if (!selected) return response;
    const record = {
      schema: "x-login-response-bytes/v1", sequence: id, action,
      captured_at_utc: new Date().toISOString(), status: response.status,
      content_type: response.headers.get("content-type"),
      authority: "browser-fetch-response-body", transport_bytes: false,
    };
    try {
      // Read before delivering to the app, so its success navigation cannot
      // destroy the page while this small response is still being copied.
      const bytes = new Uint8Array(await response.clone().arrayBuffer());
      record.bytes = bytes.length;
      record.sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (value) => value.toString(16).padStart(2, "0")).join("");
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 8192) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      }
      record.body_base64 = btoa(binary);
      records.push(record);
      download(record);
    } catch {
      records.push({ ...record, error: "CAPTURE_FAILED" });
      console.warn("Login response capture failed; original response retained.");
    }
    return response;
  }
  globalThis.fetch = wrapped;
  globalThis.xLoginBytes = Object.freeze({
    status: () => records.map(({ sequence, action, status, bytes, error }) =>
      ({ sequence, action, status, bytes, error })),
    save: (sequence) => {
      const record = records.find((item) => item.sequence === sequence);
      if (!record || !record.body_base64) throw new Error("No captured bytes for that sequence");
      download(record);
    },
    stop: () => {
      if (globalThis.fetch === wrapped) globalThis.fetch = original;
      records.length = 0;
      delete globalThis.xLoginBytes;
    },
  });
  console.info("Login byte capture installed. Only four action responses are saved locally.");
})();
