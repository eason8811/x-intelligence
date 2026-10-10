// Local type boundary for the unmodified upstream JavaScript.
export function postHomeTimeLine(input: {
  cookie: { auth_token: string; ct0: string };
  count: number;
  cursor: string;
  isForYou: true;
}): Promise<unknown>;
export function getToken(mode: number, source: string, rateLimitOnly?: boolean, env?: { axios: import("axios").AxiosInstance }): Promise<unknown>;
export function postFlowTask(input: { guest_token: false; cookie: Record<string, string>; flow_token: string; sub_task: unknown }): Promise<unknown>;
export function getJsInstData(input: { cookie: Record<string, string> }): Promise<unknown>;
