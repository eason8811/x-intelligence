import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { chromium, type Browser, type BrowserContext, type Page } from "patchright";
import WebSocket, { WebSocketServer } from "ws";
import {
  createDatabase,
  getConnectedXAccountSessionForUser,
  upsertConnectedXAccount,
} from "@x-intelligence/db";
import {
  identifyXViewer,
  TwitterMonitorForYouSource,
  XSourceError,
  XViewerIdentityError,
} from "@x-intelligence/x";
import type {
  XAccountBindingClientMessage,
  XAccountBindingServerMessage,
} from "@x-intelligence/shared";
import {
  AccountSessionError,
  credentialsFromAccountState,
  decryptAccountState,
  encryptAccountState,
} from "../auth/account-session";
import { hasXAuthCookies, isXHome, type AuthState } from "../auth/state";
import { collectForYouToDatabase, PersistedCollectionError } from "../jobs/collect";

const environmentFile = fileURLToPath(new URL("../../../../.env", import.meta.url));
config({ path: environmentFile, quiet: true });

const port = parsePort(process.env.COLLECTOR_BROWSER_PORT);
const host = process.env.COLLECTOR_BROWSER_HOST?.trim() || "127.0.0.1";
const internalToken = process.env.COLLECTOR_INTERNAL_TOKEN?.trim() || "";
const databaseUrl = process.env.DATABASE_URL?.trim() || "";
const allowedOrigins = (process.env.X_ACCOUNT_BINDING_ALLOWED_ORIGINS || "")
  .split(/[\s,]+/)
  .map((value) => value.trim())
  .filter(Boolean);
const maximumSessionMs = 15 * 60 * 1000;
const ticketLifetimeMs = 2 * 60 * 1000;
const maximumCollectionMs = 120 * 1000;
const collectionJobRetentionMs = 15 * 60 * 1000;
const browserViewport = { width: 1280, height: 800 };

interface PendingIdentity {
  state: AuthState;
  xUserId: string;
  username: string;
}

interface BindingSession {
  id: string;
  userId: string;
  ticketDigest: Buffer;
  ticketExpiresAt: number;
  expiresAt: number;
  status: XAccountBindingServerMessage["status"];
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
  socket?: WebSocket;
  screenshotTimer?: ReturnType<typeof setInterval>;
  expirationTimer?: ReturnType<typeof setTimeout>;
  ticketTimer?: ReturnType<typeof setTimeout>;
  closeTimer?: ReturnType<typeof setTimeout>;
  abortController: AbortController;
  pendingIdentity?: PendingIdentity;
  errorCode?: string;
  authenticated: boolean;
  closed: boolean;
}

interface StartBindingRequest {
  userId: string;
}

interface StartCollectionRequest {
  userId: string;
  accountId: string;
}

interface CollectionJob {
  id: string;
  userId: string;
  accountId: string;
  status: "RUNNING" | "SUCCESS" | "FAILED";
  collectedCount?: number;
  errorCode?: string;
  createdAt: number;
}

function parsePort(value: string | undefined): number {
  const parsed = value ? Number(value) : 3002;
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("COLLECTOR_BROWSER_PORT_INVALID");
  }
  return parsed;
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

function tokenIsValid(request: IncomingMessage): boolean {
  const authorization = request.headers.authorization;
  if (!internalToken || !authorization?.startsWith("Bearer ")) return false;
  const received = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(internalToken);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const contentLength = Number(request.headers["content-length"] || 0);
  if (contentLength > 2_048) throw new Error("REQUEST_TOO_LARGE");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 2_048) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function isStartBindingRequest(value: unknown): value is StartBindingRequest {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const userId = (value as Record<string, unknown>).userId;
  return typeof userId === "string" && userId.length > 0 && userId.length <= 128;
}

function digestTicket(ticket: string): Buffer {
  return createHash("sha256").update(ticket, "utf8").digest();
}

function sendState(
  session: BindingSession,
  status: XAccountBindingServerMessage["status"],
  extra: Omit<XAccountBindingServerMessage, "type" | "status"> = {},
): void {
  session.status = status;
  const message: XAccountBindingServerMessage = { type: "state", status, ...extra };
  if (session.socket?.readyState === WebSocket.OPEN) {
    session.socket.send(JSON.stringify(message));
  }
}

function sendError(session: BindingSession, code: string): void {
  session.errorCode = code;
  sendState(session, "error", { code });
}

function closeSocket(session: BindingSession, code = 1000): void {
  if (session.socket && session.socket.readyState < WebSocket.CLOSING) {
    session.socket.close(code);
  }
}

async function closeBinding(session: BindingSession): Promise<void> {
  if (session.closed) return;
  session.closed = true;
  session.abortController.abort();
  if (session.screenshotTimer) clearInterval(session.screenshotTimer);
  if (session.expirationTimer) clearTimeout(session.expirationTimer);
  if (session.ticketTimer) clearTimeout(session.ticketTimer);
  if (session.closeTimer) clearTimeout(session.closeTimer);
  await session.context?.close().catch(() => undefined);
  await session.browser?.close().catch(() => undefined);
  sessions.delete(session.id);
}

const sessions = new Map<string, BindingSession>();
const collectionJobs = new Map<string, CollectionJob>();
const activeCollectionAccountIds = new Set<string>();

async function startBrowser(session: BindingSession): Promise<void> {
  try {
    const browser = await chromium.launch({ headless: false });
    session.browser = browser;
    if (session.closed) {
      await browser.close().catch(() => undefined);
      session.browser = undefined;
      return;
    }
    session.context = await session.browser.newContext({ viewport: browserViewport });
    session.page = await session.context.newPage();
    await session.page.goto("https://x.com/i/flow/login", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    if (!session.closed) sendState(session, "login");
  } catch (error) {
    if (!session.closed) {
      const errorName = error instanceof Error ? error.name : "UnknownError";
      process.stderr.write(`[collector-browser] Browser startup failed (${errorName}).\n`);
      sendError(session, "BROWSER_UNAVAILABLE");
      if (session.socket) closeSocket(session, 1011);
    }
  }
}

function startScreenshotStream(session: BindingSession): void {
  session.screenshotTimer = setInterval(() => {
    if (
      session.closed || !session.page ||
      session.status !== "login" ||
      session.socket?.readyState !== WebSocket.OPEN ||
      session.socket.bufferedAmount > 2 * 1024 * 1024
    ) return;
    void session.page.screenshot({ type: "jpeg", quality: 62 }).then((image) => {
      if (!session.closed && session.socket?.readyState === WebSocket.OPEN) {
        session.socket.send(image, { binary: true });
      }
    }).catch(() => {
      if (!session.closed) {
        sendError(session, "SCREEN_CAPTURE_FAILED");
        closeSocket(session, 1011);
      }
    });
  }, 700);
}

function allowedKey(value: string): boolean {
  return (value.length <= 32 && /^[A-Za-z0-9]+$/.test(value)) || [
    "Enter", "Tab", "Backspace", "Delete", "Escape", "Space",
    "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End",
    "PageUp", "PageDown", "Shift", "Control", "Alt", "Meta", "CapsLock",
  ].includes(value);
}

function isBindingMessage(value: unknown): value is XAccountBindingClientMessage {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  if (["complete", "confirm", "cancel"].includes(String(message.type))) return true;
  if (message.type !== "input" || typeof message.action !== "string") return false;
  if (message.action === "click") {
    return typeof message.x === "number" && Number.isFinite(message.x) &&
      typeof message.y === "number" && Number.isFinite(message.y);
  }
  if (message.action === "wheel") {
    return [message.x, message.y, message.deltaX, message.deltaY]
      .every((part) => typeof part === "number" && Number.isFinite(part));
  }
  if (message.action === "press") {
    return typeof message.key === "string" && allowedKey(message.key);
  }
  return message.action === "insertText" &&
    typeof message.text === "string" &&
    message.text.length > 0 && message.text.length <= 512 &&
    !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(message.text);
}

async function checkLoggedInIdentity(session: BindingSession): Promise<PendingIdentity> {
  const context = session.context;
  const page = session.page;
  if (!context || !page || !isXHome(page.url())) {
    throw new Error("OPEN_X_HOME");
  }
  const state: AuthState = await context.storageState();
  if (!hasXAuthCookies(state)) throw new Error("LOGIN_INCOMPLETE");
  const identity = await identifyXViewer(credentialsFromAccountState(state));
  return { state, ...identity };
}

async function persistAndCollect(
  session: BindingSession,
  candidate: PendingIdentity,
): Promise<void> {
  const latest = await checkLoggedInIdentity(session);
  if (latest.xUserId !== candidate.xUserId) throw new Error("ACCOUNT_CHANGED");
  const encodedKey = process.env.X_AUTH_ENCRYPTION_KEY?.trim();
  if (!encodedKey || !databaseUrl) throw new Error("SERVER_CONFIGURATION_MISSING");

  const encrypted = encryptAccountState(
    latest.state,
    encodedKey,
    session.userId,
    latest.xUserId,
  );
  const connection = createDatabase(databaseUrl);
  let accountId: string | undefined;
  try {
    const connected = await upsertConnectedXAccount(connection.db, {
      id: randomUUID(),
      userId: session.userId,
      xUserId: latest.xUserId,
      username: latest.username,
      status: "CONNECTED",
      ...encrypted,
    });
    accountId = connected?.id;
  } finally {
    await connection.pool.end().catch(() => undefined);
  }
  if (!accountId) throw new Error("X_ACCOUNT_ALREADY_BOUND");

  sendState(session, "connected", { username: latest.username });
  await session.context?.close().catch(() => undefined);
  await session.browser?.close().catch(() => undefined);
  session.context = undefined;
  session.browser = undefined;
  session.page = undefined;

  if (activeCollectionAccountIds.has(accountId)) {
    throw new Error("COLLECTION_ALREADY_RUNNING");
  }
  activeCollectionAccountIds.add(accountId);
  sendState(session, "collecting", { username: latest.username });
  let collectionConnection: ReturnType<typeof createDatabase> | undefined;
  const timeout = setTimeout(() => session.abortController.abort(), maximumCollectionMs);
  try {
    collectionConnection = createDatabase(databaseUrl);
    const result = await collectForYouToDatabase(
      collectionConnection.db,
      new TwitterMonitorForYouSource(credentialsFromAccountState(latest.state)),
      20,
      1,
      session.abortController.signal,
      accountId,
    );
    sendState(session, "complete", {
      username: latest.username,
      collectedCount: result.observations.length,
    });
  } catch (error) {
    const code = error instanceof PersistedCollectionError || error instanceof XSourceError
      ? error.code
      : "COLLECTION_FAILED";
    sendError(session, code);
  } finally {
    clearTimeout(timeout);
    await collectionConnection?.pool.end().catch(() => undefined);
    activeCollectionAccountIds.delete(accountId);
  }
  session.closeTimer = setTimeout(() => closeSocket(session), 5_000);
}

function isStartCollectionRequest(value: unknown): value is StartCollectionRequest {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.userId === "string" && record.userId.length > 0 &&
    record.userId.length <= 128 && typeof record.accountId === "string" &&
    record.accountId.length > 0 && record.accountId.length <= 128;
}

function cleanupExpiredCollectionJobs(): void {
  const oldestTimestamp = Date.now() - collectionJobRetentionMs;
  for (const [jobId, job] of collectionJobs) {
    if (job.createdAt < oldestTimestamp && job.status !== "RUNNING") {
      collectionJobs.delete(jobId);
    }
  }
}

function collectionErrorCode(error: unknown): string {
  if (error instanceof AccountSessionError) return error.code;
  if (error instanceof XViewerIdentityError) return error.code;
  if (error instanceof PersistedCollectionError || error instanceof XSourceError) {
    return error.code;
  }
  if (error instanceof Error && ["ACCOUNT_NOT_FOUND", "ACCOUNT_SESSION_INVALID", "ACCOUNT_IDENTITY_MISMATCH"].includes(error.message)) {
    return error.message;
  }
  return "COLLECTION_FAILED";
}

async function runCollectionJob(job: CollectionJob): Promise<void> {
  if (activeCollectionAccountIds.has(job.accountId)) {
    job.status = "FAILED";
    job.errorCode = "COLLECTION_ALREADY_RUNNING";
    return;
  }
  activeCollectionAccountIds.add(job.accountId);
  const encodedKey = process.env.X_AUTH_ENCRYPTION_KEY?.trim();
  if (!databaseUrl || !encodedKey) {
    job.status = "FAILED";
    job.errorCode = "SERVER_CONFIGURATION_MISSING";
    activeCollectionAccountIds.delete(job.accountId);
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), maximumCollectionMs);
  let connection: ReturnType<typeof createDatabase> | undefined;
  try {
    connection = createDatabase(databaseUrl);
    const account = await getConnectedXAccountSessionForUser(
      connection.db,
      job.userId,
      job.accountId,
    );
    if (!account) throw new Error("ACCOUNT_NOT_FOUND");
    if (
      !account.xUserId || account.encryptionVersion === null ||
      !account.nonce || !account.ciphertext || !account.authTag
    ) {
      throw new Error("ACCOUNT_SESSION_INVALID");
    }
    const state = decryptAccountState({
      encryptionVersion: account.encryptionVersion,
      nonce: account.nonce,
      ciphertext: account.ciphertext,
      authTag: account.authTag,
    }, encodedKey, job.userId, account.xUserId);
    const credentials = credentialsFromAccountState(state);
    const identity = await identifyXViewer(credentials);
    if (identity.xUserId !== account.xUserId) {
      throw new Error("ACCOUNT_IDENTITY_MISMATCH");
    }
    const result = await collectForYouToDatabase(
      connection.db,
      new TwitterMonitorForYouSource(credentials),
      20,
      1,
      controller.signal,
      account.id,
    );
    job.collectedCount = result.observations.length;
    job.status = "SUCCESS";
  } catch (error) {
    job.errorCode = collectionErrorCode(error);
    job.status = "FAILED";
  } finally {
    clearTimeout(timeout);
    activeCollectionAccountIds.delete(job.accountId);
    await connection?.pool.end().catch(() => undefined);
  }
}

async function handleClientMessage(
  session: BindingSession,
  data: WebSocket.RawData,
  isBinary: boolean,
): Promise<void> {
  if (!session.authenticated) {
    if (isBinary || !session.socket) {
      closeSocket(session, 1008);
      return;
    }
    try {
      const authentication = JSON.parse(data.toString()) as Record<string, unknown>;
      if (
        authentication.type !== "authenticate" ||
        authentication.bindingId !== session.id ||
        typeof authentication.ticket !== "string" ||
        Date.now() > session.ticketExpiresAt
      ) {
        closeSocket(session, 1008);
        return;
      }
      const providedDigest = digestTicket(authentication.ticket);
      if (!timingSafeEqual(providedDigest, session.ticketDigest)) {
        closeSocket(session, 1008);
        return;
      }
      session.authenticated = true;
      if (session.ticketTimer) clearTimeout(session.ticketTimer);
      startScreenshotStream(session);
      sendState(
        session,
        session.status,
        session.status === "error" && session.errorCode
          ? { code: session.errorCode }
          : {},
      );
      if (session.status === "error") {
        session.closeTimer = setTimeout(() => closeSocket(session), 5_000);
      }
      return;
    } catch {
      closeSocket(session, 1008);
      return;
    }
  }
  if (isBinary) {
    closeSocket(session, 1008);
    return;
  }

  let message: unknown;
  try {
    message = JSON.parse(data.toString()) as unknown;
  } catch {
    closeSocket(session, 1008);
    return;
  }
  if (!isBindingMessage(message)) {
    closeSocket(session, 1008);
    return;
  }
  if (message.type === "cancel") {
    sendState(session, "error", { code: "CANCELLED" });
    closeSocket(session);
    return;
  }
  if (message.type === "complete") {
    if (session.status !== "login") return;
    sendState(session, "checking");
    try {
      session.pendingIdentity = await checkLoggedInIdentity(session);
      sendState(session, "confirm", { username: session.pendingIdentity.username });
    } catch (error) {
      if (error instanceof XViewerIdentityError) {
        const details = error.failureDetails;
        const diagnostic = [
          details?.upstreamStatus ? `http=${details.upstreamStatus}` : undefined,
          details?.upstreamCode ? `x_code=${details.upstreamCode}` : undefined,
          details?.transportCode ? `transport=${details.transportCode}` : undefined,
        ].filter(Boolean).join(" ");
        process.stderr.write(
          `[collector-browser] X Viewer check failed${diagnostic ? ` (${diagnostic})` : ""}.\n`,
        );
      }
      const code = error instanceof XViewerIdentityError
        ? error.code
        : error instanceof AccountSessionError
          ? error.code
          : error instanceof Error && ["OPEN_X_HOME", "LOGIN_INCOMPLETE"].includes(error.message)
            ? error.message
            : "X_ACCOUNT_CHECK_FAILED";
      sendError(session, code);
    }
    return;
  }
  if (message.type === "confirm") {
    if (session.status !== "confirm" || !session.pendingIdentity) return;
    try {
      await persistAndCollect(session, session.pendingIdentity);
    } catch (error) {
      const code = error instanceof XViewerIdentityError
        ? error.code
        : error instanceof AccountSessionError
          ? error.code
          : error instanceof Error && ["OPEN_X_HOME", "LOGIN_INCOMPLETE", "ACCOUNT_CHANGED", "SERVER_CONFIGURATION_MISSING", "X_ACCOUNT_ALREADY_BOUND", "COLLECTION_ALREADY_RUNNING"].includes(error.message)
            ? error.message
            : "X_ACCOUNT_SAVE_FAILED";
      sendError(session, code);
      session.closeTimer = setTimeout(() => closeSocket(session), 5_000);
    }
    return;
  }

  if (message.type !== "input") return;

  const page = session.page;
  if (!page || session.status !== "login") return;
  if (message.action === "click") {
    const x = clamp(message.x, 0, browserViewport.width);
    const y = clamp(message.y, 0, browserViewport.height);
    await page.mouse.click(x, y).catch(() => undefined);
  } else if (message.action === "wheel") {
    await page.mouse.move(clamp(message.x, 0, browserViewport.width), clamp(message.y, 0, browserViewport.height));
    await page.mouse.wheel(clamp(message.deltaX, -1_000, 1_000), clamp(message.deltaY, -1_000, 1_000)).catch(() => undefined);
  } else if (message.action === "press") {
    await page.keyboard.press(message.key).catch(() => undefined);
  } else if (message.action === "insertText") {
    await page.keyboard.insertText(message.text).catch(() => undefined);
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function allowedOrigin(value: string | undefined): boolean {
  return typeof value === "string" && allowedOrigins.includes(value);
}

async function handleInternalRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (url.pathname === "/health" && request.method === "GET") {
    sendJson(response, 200, { status: "ok" });
    return;
  }
  if (!url.pathname.startsWith("/internal/")) {
    sendJson(response, 404, { code: "NOT_FOUND" });
    return;
  }
  if (!tokenIsValid(request)) {
    sendJson(response, 401, { code: "UNAUTHORIZED" });
    return;
  }
  if (!databaseUrl || !process.env.X_AUTH_ENCRYPTION_KEY) {
    sendJson(response, 503, { code: "SERVER_CONFIGURATION_MISSING" });
    return;
  }

  if (url.pathname === "/internal/collections/status" && request.method === "POST") {
    let body: unknown;
    try {
      body = await readJsonBody(request);
    } catch {
      sendJson(response, 400, { code: "INVALID_REQUEST" });
      return;
    }
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      sendJson(response, 400, { code: "INVALID_REQUEST" });
      return;
    }
    const input = body as Record<string, unknown>;
    if (
      typeof input.userId !== "string" || input.userId.length < 1 || input.userId.length > 128 ||
      typeof input.jobId !== "string" || input.jobId.length < 1 || input.jobId.length > 128 ||
      typeof input.accountId !== "string" || input.accountId.length < 1 || input.accountId.length > 128
    ) {
      sendJson(response, 400, { code: "INVALID_REQUEST" });
      return;
    }
    cleanupExpiredCollectionJobs();
    const job = collectionJobs.get(input.jobId);
    if (!job || job.userId !== input.userId || job.accountId !== input.accountId) {
      sendJson(response, 404, { code: "COLLECTION_JOB_NOT_FOUND" });
      return;
    }
    sendJson(response, 200, {
      jobId: job.id,
      status: job.status,
      collectedCount: job.collectedCount,
      errorCode: job.errorCode,
    });
    return;
  }

  if (url.pathname === "/internal/collections" && request.method === "POST") {
    let body: unknown;
    try {
      body = await readJsonBody(request);
    } catch {
      sendJson(response, 400, { code: "INVALID_REQUEST" });
      return;
    }
    if (!isStartCollectionRequest(body)) {
      sendJson(response, 400, { code: "INVALID_REQUEST" });
      return;
    }
    cleanupExpiredCollectionJobs();
    if (activeCollectionAccountIds.has(body.accountId)) {
      sendJson(response, 409, { code: "COLLECTION_ALREADY_RUNNING" });
      return;
    }
    const job: CollectionJob = {
      id: randomUUID(),
      userId: body.userId,
      accountId: body.accountId,
      status: "RUNNING",
      createdAt: Date.now(),
    };
    collectionJobs.set(job.id, job);
    void runCollectionJob(job);
    sendJson(response, 202, { jobId: job.id, status: job.status });
    return;
  }

  if (url.pathname !== "/internal/bindings" || request.method !== "POST" || !allowedOrigins.length) {
    sendJson(response, url.pathname === "/internal/bindings" ? 503 : 404, {
      code: url.pathname === "/internal/bindings" ? "SERVER_CONFIGURATION_MISSING" : "NOT_FOUND",
    });
    return;
  }
  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch {
    sendJson(response, 400, { code: "INVALID_REQUEST" });
    return;
  }
  if (!isStartBindingRequest(body)) {
    sendJson(response, 400, { code: "INVALID_REQUEST" });
    return;
  }
  if ([...sessions.values()].some((session) => session.userId === body.userId && !session.closed)) {
    sendJson(response, 409, { code: "BINDING_ALREADY_ACTIVE" });
    return;
  }

  const now = Date.now();
  const ticket = randomBytes(32).toString("base64url");
  const session: BindingSession = {
    id: randomUUID(),
    userId: body.userId,
    ticketDigest: digestTicket(ticket),
    ticketExpiresAt: now + ticketLifetimeMs,
    expiresAt: now + maximumSessionMs,
    status: "starting",
    abortController: new AbortController(),
    authenticated: false,
    closed: false,
  };
  session.expirationTimer = setTimeout(() => {
    sendError(session, "BINDING_EXPIRED");
    closeSocket(session, 1008);
    void closeBinding(session);
  }, maximumSessionMs);
  session.ticketTimer = setTimeout(() => {
    if (!session.authenticated && !session.closed) {
      sendError(session, "BINDING_EXPIRED");
      closeSocket(session, 1008);
      void closeBinding(session);
    }
  }, ticketLifetimeMs);
  sessions.set(session.id, session);
  void startBrowser(session);

  const publicWebSocketUrl = process.env.COLLECTOR_BROWSER_WS_URL?.trim() ||
    `ws://${host}:${port}/ws`;
  sendJson(response, 201, {
    bindingId: session.id,
    ticket,
    websocketUrl: publicWebSocketUrl,
  });
}

if (!internalToken || internalToken.length < 32) {
  throw new Error("COLLECTOR_INTERNAL_TOKEN_MUST_BE_AT_LEAST_32_CHARACTERS");
}

const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

function attachBindingSocket(session: BindingSession, webSocket: WebSocket): void {
  webSocket.on("message", (data: WebSocket.RawData, isBinary: boolean) => {
    void handleClientMessage(session, data, isBinary).catch(() => {
      if (!session.closed) {
        sendError(session, "BROWSER_INTERACTION_FAILED");
        closeSocket(session, 1011);
      }
    });
  });
  webSocket.once("close", () => {
    void closeBinding(session);
  });
  webSocket.once("error", () => {
    void closeBinding(session);
  });
}

const server = createServer((request, response) => {
  void handleInternalRequest(request, response).catch(() => {
    if (!response.headersSent) sendJson(response, 500, { code: "INTERNAL_ERROR" });
    else response.destroy();
  });
});

server.on("upgrade", (request, socket, head) => {
  let url: URL;
  try {
    url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  } catch {
    socket.destroy();
    return;
  }

  const bindingId = url.searchParams.get("binding");
  const session = bindingId ? sessions.get(bindingId) : undefined;
  if (
    url.pathname !== "/ws" ||
    !allowedOrigin(request.headers.origin) ||
    !session ||
    session.closed ||
    Date.now() > session.expiresAt ||
    session.socket
  ) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
    session.socket = webSocket;
    attachBindingSocket(session, webSocket);
  });
});

server.listen(port, host, () => {
  process.stdout.write(`Collector browser service listening on ${host}:${port}\n`);
});
