import { validateCredentials } from "./transport";
import type { XCredentials } from "./types";

export class XLoginError extends Error {
  constructor(
    public readonly code: string,
    detail = "",
  ) {
    super(detail ? `${code}：${detail}` : code);
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
export async function createLoginDriver(guestSource: "api" | "web" = "api"): Promise<LoginDriver> {
  const [{ Login }, { getToken, postFlowTask, getJsInstData }] =
    await Promise.all([
      import("./vendor/upstream/libs/core/Core.function.mjs"),
      import("./vendor/upstream/libs/core/Core.fetch.mjs"),
    ]);
  // Avoid GuestToken's automatic retry loop; keep the original HTTP implementation.
  const { default: axiosFetch } =
    await import("./vendor/upstream/packages/axios-helper/index.node.js");
  const http = axiosFetch();
  let stage = guestSource === "api" ? "X guest activation" : "X 首页",
    status: number | undefined,
    networkCode = "";
  http.interceptors.request.use((config) => {
    stage = config.url?.includes("/1.1/guest/activate.json")
      ? "X guest activation"
      : config.url?.startsWith("https://abs.twimg.com/")
      ? "X 静态资源"
      : "X 首页";
    status = undefined;
    return config;
  });
  http.interceptors.response.use(
    (response) => {
      status = response.status;
      return response;
    },
    (error: unknown) => {
      const value = object(error);
      const candidate = object(value.response).status;
      if (typeof candidate === "number") status = candidate;
      const code = value.code;
      if (
        typeof code === "string" &&
        /^(ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNABORTED|ERR_NETWORK|CERT_HAS_EXPIRED|UNABLE_TO_VERIFY_LEAF_SIGNATURE|DEPTH_ZERO_SELF_SIGNED_CERT)$/.test(
          code,
        )
      )
        networkCode = code;
      return Promise.reject(error);
    },
  );
  const failure = () => {
    const code =
      status === 429
        ? "AUTH_RATE_LIMITED"
        : status !== undefined && status >= 400
          ? "AUTH_GUEST_HTTP_FAILED"
          : networkCode
            ? "AUTH_GUEST_NETWORK_FAILED"
            : "AUTH_GUEST_PARSE_FAILED";
    return new XLoginError(
      code,
      `${stage}${status !== undefined ? ` HTTP ${status}` : ""}${networkCode ? ` ${networkCode}` : ""}；未进入账号密码阶段`,
    );
  };
  let guest: Record<string, unknown>;
  try {
    guest = object(await getToken(1, guestSource, false, { axios: http }));
  } catch (error) {
    const result = object(error);
    // Upstream rejects here but continues scheduling a script request. Attribute
    // the first failure to the homepage; never expose token values or raw errors.
    if (result.token === "invalid guest token or ondemand_s_hex") {
      const fields = object(result.web_ext);
      throw new XLoginError("AUTH_GUEST_PAGE_FIELDS_MISSING",
        `X 首页缺少登录初始化字段：guest_token=${fields.guest_token ? "已识别" : "未识别"}，ondemand_s_hex=${fields.ondemand_s_hex ? "已识别" : "未识别"}；未进入账号密码阶段`);
    }
    if (result.token === "No token") {
      throw new XLoginError("AUTH_GUEST_COOKIE_PARSE_FAILED", "X 首页未识别到上游预期的 cookie 脚本；未进入账号密码阶段");
    }
    throw failure();
  }
  if (guest.success !== true) throw failure();
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
