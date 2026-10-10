import { validateCredentials } from "./transport";
import type { XCredentials } from "./types";

export class XLoginError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export type LoginPrompt = (label: string, secret?: boolean) => Promise<string>;
export interface LoginDriver {
  start(): Promise<unknown>;
  step(task: string, value?: string): Promise<unknown>;
  viewer(): Promise<unknown>;
}
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}
function checked(value: unknown): Record<string, unknown> {
  const result = object(value);
  if (result.code !== 200)
    throw new XLoginError(
      result.code === 429 ? "AUTH_RATE_LIMITED" : "AUTH_FLOW_FAILED",
    );
  return result;
}
export async function createLoginDriver(): Promise<LoginDriver> {
  const [{ Login }, { getToken, postFlowTask, getJsInstData }] =
    await Promise.all([
      import("./vendor/upstream/libs/core/Core.function.mjs"),
      import("./vendor/upstream/libs/core/Core.fetch.mjs"),
    ]);
  // Avoid GuestToken's automatic retry loop; keep the original HTTP implementation.
  let guest: Record<string, unknown>;
  try { guest = object(await getToken(1, "web")); }
  catch { throw new XLoginError("AUTH_GUEST_FAILED"); }
  if (guest.success !== true) throw new XLoginError("AUTH_GUEST_FAILED");
  const login = new Login({ token: guest });
  return {
    start: () => login.Init(),
    async step(task, value = "") {
      switch (task) {
        case "LoginJsInstrumentationSubtask": {
          const metrics = checked(
            await getJsInstData({ cookie: login.cookie }),
          );
          login.updateItems(metrics);
          const result = await postFlowTask({
            guest_token: false,
            cookie: login.cookie,
            flow_token: login.flow_token,
            sub_task: {
              subtask_id: task,
              js_instrumentation: {
                link: "next_link",
                response: JSON.stringify(
                  object(metrics.flow_data).js_instrumentation,
                ),
              },
            },
          });
          login.updateItems(result);
          return result;
        }
        case "LoginEnterUserIdentifierSSO":
          return login.LoginEnterUserIdentifierSSO(value);
        case "LoginEnterAlternateIdentifierSubtask":
          return login.LoginEnterAlternateIdentifierSubtask(value);
        case "LoginEnterPassword":
          return login.LoginEnterPassword(value);
        case "AccountDuplicationCheck":
          return login.AccountDuplicationCheck();
        case "LoginTwoFactorAuthChallenge":
          return login.LoginTwoFactorAuthChallenge(value);
        case "LoginAcid":
          return login.LoginAcid(value);
        case "LoginTwoFactorAuthChooseMethod": {
          // Upstream class incorrectly reads att._twitter_sess; use its low-level request.
          const result = await postFlowTask({
            guest_token: false,
            cookie: login.cookie,
            flow_token: login.flow_token,
            sub_task: {
              subtask_id: task,
              choice_selection: {
                link: "next_link",
                selected_choices: [value],
              },
            },
          });
          login.updateItems(result);
          return result;
        }
        default:
          throw new XLoginError("AUTH_UNSUPPORTED_TASK");
      }
    },
    viewer: () => login.Viewer(),
  };
}

export async function runLogin(
  driver: LoginDriver,
  prompt: LoginPrompt,
  signal?: AbortSignal,
): Promise<{ credentials: XCredentials; username: string }> {
  const check = () => {
    if (signal?.aborted) throw new XLoginError("AUTH_CANCELLED");
  };
  check();
  let result = checked(await driver.start());
  for (let step = 0; step < 20; step++) {
    check();
    const tasks = object(result.data).subtasks;
    if (!Array.isArray(tasks) || tasks.length !== 1)
      throw new XLoginError("AUTH_UNSUPPORTED_RESPONSE");
    const task = object(tasks[0]);
    const id = task.subtask_id;
    if (id === "LoginSuccessSubtask") {
      const viewer = object(await driver.viewer());
      check();
      const user = object(
        object(object(object(viewer.data).data).viewer).user_results,
      );
      const account = object(user.result);
      const username =
        object(account.legacy).screen_name ?? object(account.core).screen_name;
      const cookie = object(viewer.cookie);
      const credentials = {
        authToken: cookie.auth_token,
        csrfToken: cookie.ct0,
      };
      if (
        typeof credentials.authToken !== "string" ||
        typeof credentials.csrfToken !== "string" ||
        typeof username !== "string" ||
        !username ||
        typeof account.rest_id !== "string"
      )
        throw new XLoginError("AUTH_VIEWER_INVALID");
      validateCredentials(credentials as XCredentials);
      const answer = await prompt(
        `已登录 @${username}。确认保存此账号？输入 yes：`,
      );
      check();
      if (answer.trim() !== "yes") throw new XLoginError("AUTH_CANCELLED");
      return { credentials: credentials as XCredentials, username };
    }
    let value: string | undefined;
    switch (id) {
      case "LoginJsInstrumentationSubtask":
      case "AccountDuplicationCheck":
        break;
      case "LoginEnterUserIdentifierSSO":
        value = await prompt("X 用户名（screen_name）：");
        break;
      case "LoginEnterAlternateIdentifierSubtask":
        value = await prompt("X 要求补充账号标识，请输入用户名：");
        break;
      case "LoginEnterPassword":
        value = await prompt("密码：", true);
        break;
      case "LoginTwoFactorAuthChallenge":
        value = await prompt("二次验证代码：", true);
        break;
      case "LoginAcid":
        value = await prompt(
          "X 额外验证信息（请根据账号验证要求输入）：",
          true,
        );
        break;
      case "LoginTwoFactorAuthChooseMethod": {
        const selection = object(task.choice_selection);
        const choices = selection.choices;
        if (!Array.isArray(choices) || !choices.length)
          throw new XLoginError("AUTH_UNSUPPORTED_RESPONSE");
        const available = choices
          .map(object)
          .filter((c) => typeof c.id === "string");
        value = await prompt(
          `选择验证方式（${available.map((c) => `${c.id}: ${typeof c.label === "string" ? c.label : "验证方式"}`).join("；")}）：`,
        );
        if (!available.some((c) => c.id === value))
          throw new XLoginError("AUTH_INVALID_CHOICE");
        break;
      }
      default:
        throw new XLoginError("AUTH_UNSUPPORTED_TASK");
    }
    check();
    if (value !== undefined && !value.length)
      throw new XLoginError("AUTH_EMPTY_INPUT");
    result = checked(await driver.step(String(id), value));
  }
  throw new XLoginError("AUTH_STEP_LIMIT");
}
