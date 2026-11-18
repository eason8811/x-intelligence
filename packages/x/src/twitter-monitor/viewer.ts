import type { XCredentials } from "./types";
import { getViewer } from "./vendor/upstream/libs/core/Core.fetch.mjs";

export interface XViewerIdentity {
  xUserId: string;
  username: string;
}

export interface XViewerFailureDetails {
  upstreamStatus?: number;
  upstreamCode?: string;
  transportCode?: string;
}

export class XViewerIdentityError extends Error {
  constructor(
    public readonly code: "X_VIEWER_UNAVAILABLE" | "X_VIEWER_IDENTITY_MISSING",
    public readonly failureDetails?: XViewerFailureDetails,
  ) {
    super(code);
    this.name = "XViewerIdentityError";
  }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringValue(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
}

function safeFailureDetails(error: unknown): XViewerFailureDetails {
  const outer = object(error);
  const nested = object(outer?.e);
  const response = object(nested?.response) ?? object(outer?.response);
  const status = response?.status;
  const rawCode = outer?.code;
  const upstreamCode = typeof rawCode === "number" && Number.isInteger(rawCode)
    ? String(rawCode)
    : typeof rawCode === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(rawCode)
      ? rawCode
      : undefined;
  const rawTransportCode = nested?.code ?? outer?.code;
  const allowedTransportCodes = new Set([
    "ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EAI_AGAIN", "ENOTFOUND",
    "ERR_CANCELED", "ERR_NETWORK",
  ]);

  return {
    ...(typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599
      ? { upstreamStatus: status }
      : {}),
    ...(upstreamCode ? { upstreamCode } : {}),
    ...(typeof rawTransportCode === "string" && allowedTransportCodes.has(rawTransportCode)
      ? { transportCode: rawTransportCode }
      : {}),
  };
}

export async function identifyXViewer(
  credentials: XCredentials,
): Promise<XViewerIdentity> {
  let response: unknown;
  try {
    response = await getViewer({
      cookie: {
        auth_token: credentials.authToken,
        ct0: credentials.csrfToken,
      },
      guest_token: {},
    });
  } catch (error) {
    throw new XViewerIdentityError("X_VIEWER_UNAVAILABLE", safeFailureDetails(error));
  }

  const responseObject = object(response);
  const payload = object(responseObject?.data);
  const viewer = object(payload?.viewer);
  const userResults = object(viewer?.user_results);
  const result = object(userResults?.result) ?? object(viewer?.user);
  const legacy = object(result?.legacy);
  const core = object(result?.core);
  const xUserId = stringValue(result?.rest_id, result?.id_str, result?.id);
  const username = stringValue(
    legacy?.screen_name,
    result?.screen_name,
    result?.username,
    core?.screen_name,
  );

  if (!xUserId || !/^\d{1,30}$/.test(xUserId) || !username || !/^[A-Za-z0-9_]{1,15}$/.test(username)) {
    throw new XViewerIdentityError("X_VIEWER_IDENTITY_MISSING");
  }
  return { xUserId, username };
}
