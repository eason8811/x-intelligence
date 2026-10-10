import test from "node:test";
import assert from "node:assert/strict";
import { runLogin, type LoginDriver } from "./login";
function flow(id: string) {
  return { code: 200, data: { subtasks: [{ subtask_id: id }] } };
}
function driver(tasks: string[], calls: string[]): LoginDriver {
  return {
    async start() {
      return flow(tasks.shift()!);
    },
    async step(id, value) {
      calls.push(`${id}:${value ?? ""}`);
      return flow(tasks.shift()!);
    },
    async viewer() {
      return {
        cookie: { auth_token: "synthetic-token", ct0: "synthetic-csrf" },
        data: {
          data: {
            viewer: {
              user_results: {
                result: { rest_id: "123", legacy: { screen_name: "fixture" } },
              },
            },
          },
        },
      };
    },
  };
}
test("login follows server tasks including alternate identifier, password and OTP; verifies Viewer", async () => {
  const calls: string[] = [],
    secrets: boolean[] = [];
  const values = ["fixture", "fixture", "password", "123456", "yes"];
  const result = await runLogin(
    driver(
      [
        "LoginJsInstrumentationSubtask",
        "LoginEnterUserIdentifierSSO",
        "LoginEnterAlternateIdentifierSubtask",
        "LoginEnterPassword",
        "AccountDuplicationCheck",
        "LoginTwoFactorAuthChallenge",
        "LoginSuccessSubtask",
      ],
      calls,
    ),
    async (_label, secret) => {
      secrets.push(!!secret);
      return values.shift()!;
    },
  );
  assert.equal(result.username, "fixture");
  assert.deepEqual(secrets, [false, false, true, true, false]);
  assert.equal(calls.length, 6);
});
test("unknown tasks, HTTP-200 flow errors and multiple subtasks fail closed", async () => {
  for (const result of [
    flow("Captcha"),
    { code: 429 },
    { code: 200, data: { subtasks: [] } },
  ]) {
    let steps = 0;
    const fake: LoginDriver = {
      async start() {
        return result;
      },
      async step() {
        steps++;
      },
      async viewer() {},
    };
    await assert.rejects(
      runLogin(fake, async () => "secret"),
      /AUTH_/,
    );
    assert.equal(steps, 0);
  }
});
test("invalid Viewer, cancelled confirmation and abort never return credentials", async () => {
  const invalid = driver(["LoginSuccessSubtask"], []);
  invalid.viewer = async () => ({
    cookie: { auth_token: "secret", ct0: "secret" },
  });
  await assert.rejects(
    runLogin(invalid, async () => "yes"),
    /AUTH_VIEWER_INVALID/,
  );
  await assert.rejects(
    runLogin(driver(["LoginSuccessSubtask"], []), async () => "no"),
    /AUTH_CANCELLED/,
  );
  await assert.rejects(
    runLogin(driver([], []), async () => "yes", AbortSignal.abort()),
    /AUTH_CANCELLED/,
  );
});
test("email challenge is secret and repeated tasks have a hard bound", async () => {
  const fake = driver(["LoginAcid", "LoginSuccessSubtask"], []);
  const flags: boolean[] = [];
  await runLogin(fake, async (_label, secret) => {
    flags.push(!!secret);
    return secret ? "code" : "yes";
  });
  assert.deepEqual(flags, [true, false]);
  const loop: LoginDriver = {
    async start() {
      return flow("AccountDuplicationCheck");
    },
    async step() {
      return flow("AccountDuplicationCheck");
    },
    async viewer() {},
  };
  await assert.rejects(
    runLogin(loop, async () => ""),
    /AUTH_STEP_LIMIT/,
  );
});
test("original upstream login module loads and guest failure makes exactly one HTTP attempt", async () => {
  const { default: axios } = await import("axios");
  const { createLoginDriver } = await import("./login");
  const previous = axios.defaults.adapter;
  let calls = 0;
  axios.defaults.adapter = async (config) => {
    calls++;
    assert.equal(config.timeout, 30000);
    throw Object.assign(new Error("synthetic network failure"), {
      code: "ECONNRESET",
    });
  };
  try {
    await assert.rejects(createLoginDriver(), /AUTH_GUEST_FAILED/);
    assert.equal(calls, 1);
  } finally {
    axios.defaults.adapter = previous;
  }
});
