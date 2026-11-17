import { getCurrentSession } from "@/lib/auth-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CollectorBindingResponse {
  bindingId: string;
  ticket: string;
  websocketUrl: string;
}

function isCollectorBindingResponse(value: unknown): value is CollectorBindingResponse {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const response = value as Record<string, unknown>;
  return typeof response.bindingId === "string" &&
    typeof response.ticket === "string" &&
    typeof response.websocketUrl === "string";
}

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ code: "INVALID_ORIGIN" }, { status: 403 });
  }

  const session = await getCurrentSession();
  if (!session) return Response.json({ code: "UNAUTHENTICATED" }, { status: 401 });

  const serviceUrl = process.env.COLLECTOR_BROWSER_INTERNAL_URL?.trim();
  const internalToken = process.env.COLLECTOR_INTERNAL_TOKEN?.trim();
  if (!serviceUrl || !internalToken) {
    return Response.json({ code: "BINDING_SERVICE_UNAVAILABLE" }, { status: 503 });
  }

  try {
    const internalUrl = new URL("/internal/bindings", serviceUrl);
    if (internalUrl.protocol !== "http:" && internalUrl.protocol !== "https:") {
      return Response.json({ code: "BINDING_SERVICE_UNAVAILABLE" }, { status: 503 });
    }
    const upstream = await fetch(internalUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${internalToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ userId: session.user.id }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    const payload: unknown = await upstream.json();
    if (!upstream.ok) {
      const code = payload !== null && typeof payload === "object" &&
        typeof (payload as Record<string, unknown>).code === "string"
        ? (payload as Record<string, string>).code
        : "BINDING_SERVICE_UNAVAILABLE";
      const status = upstream.status === 409 ? 409 : upstream.status === 503 ? 503 : 502;
      return Response.json({ code }, { status });
    }
    if (!isCollectorBindingResponse(payload)) {
      return Response.json({ code: "BINDING_SERVICE_UNAVAILABLE" }, { status: 502 });
    }
    const websocketUrl = new URL(payload.websocketUrl);
    if (
      (websocketUrl.protocol !== "ws:" && websocketUrl.protocol !== "wss:") ||
      (process.env.NODE_ENV === "production" && websocketUrl.protocol !== "wss:")
    ) {
      return Response.json({ code: "BINDING_SERVICE_UNAVAILABLE" }, { status: 502 });
    }
    websocketUrl.searchParams.set("binding", payload.bindingId);
    return Response.json({ ...payload, websocketUrl: websocketUrl.toString() }, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ code: "BINDING_SERVICE_UNAVAILABLE" }, { status: 503 });
  }
}
