import { getCurrentSession } from "@/lib/auth-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ accountId: string }>;
}

function validAccountId(value: string): boolean {
  return value.length > 0 && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value);
}

async function collectorRequest(path: string, body: unknown): Promise<Response> {
  const serviceUrl = process.env.COLLECTOR_BROWSER_INTERNAL_URL?.trim();
  const internalToken = process.env.COLLECTOR_INTERNAL_TOKEN?.trim();
  if (!serviceUrl || !internalToken) {
    return Response.json({ code: "COLLECTION_SERVICE_UNAVAILABLE" }, { status: 503 });
  }
  try {
    const internalUrl = new URL(path, serviceUrl);
    if (!(["http:", "https:"].includes(internalUrl.protocol))) {
      return Response.json({ code: "COLLECTION_SERVICE_UNAVAILABLE" }, { status: 503 });
    }
    const upstream = await fetch(internalUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${internalToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    const payload: unknown = await upstream.json();
    const status = upstream.status === 404 ? 404 :
      upstream.status === 409 ? 409 : upstream.status === 503 ? 503 :
        upstream.ok ? upstream.status : 502;
    return Response.json(payload, {
      status,
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ code: "COLLECTION_SERVICE_UNAVAILABLE" }, { status: 503 });
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ code: "INVALID_ORIGIN" }, { status: 403 });
  }
  const session = await getCurrentSession();
  if (!session) return Response.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const { accountId } = await context.params;
  if (!validAccountId(accountId)) {
    return Response.json({ code: "ACCOUNT_NOT_FOUND" }, { status: 404 });
  }
  return collectorRequest("/internal/collections", {
    userId: session.user.id,
    accountId,
  });
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const session = await getCurrentSession();
  if (!session) return Response.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const { accountId } = await context.params;
  if (!validAccountId(accountId)) {
    return Response.json({ code: "ACCOUNT_NOT_FOUND" }, { status: 404 });
  }
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId || jobId.length > 128) {
    return Response.json({ code: "COLLECTION_JOB_NOT_FOUND" }, { status: 400 });
  }
  return collectorRequest("/internal/collections/status", {
    userId: session.user.id,
    accountId,
    jobId,
  });
}
