import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const PRIVATE_SESSION_COOKIE = "date_invite_session";
export const PRIVATE_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 31;

const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required on the server.`);
  return value;
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function generateInviteToken() {
  // 32 bytes turns into a 43-character, padding-free Base64URL bearer token.
  return randomBytes(32).toString("base64url");
}

export function isValidInviteToken(token: string) {
  return INVITE_TOKEN_PATTERN.test(token);
}

/** HMAC means the database holds no usable invite secret. */
export function hashInviteToken(token: string, pepper = requiredEnvironment("INVITE_TOKEN_PEPPER")) {
  if (!isValidInviteToken(token)) {
    throw new ApiError(400, "invalid_invite_token", "The invitation link is not valid.");
  }

  return createHmac("sha256", pepper).update(token).digest("hex");
}

interface InviteSessionPayload {
  v: 1;
  inviteId: string;
  issuedAt: number;
}

function signSessionPayload(encodedPayload: string, secret = requiredEnvironment("INVITE_SESSION_SECRET")) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

/** The browser only receives a signed invite id, never the raw bearer token. */
export function createInviteSession(inviteId: string, issuedAt = Date.now()) {
  if (!UUID_PATTERN.test(inviteId)) throw new Error("Cannot create a session for an invalid invite id.");

  const payload: InviteSessionPayload = { v: 1, inviteId, issuedAt };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${signSessionPayload(encodedPayload)}`;
}

export function readInviteSession(cookieValue: string | undefined): InviteSessionPayload | null {
  if (!cookieValue) return null;
  const [encodedPayload, suppliedSignature, ...extra] = cookieValue.split(".");
  if (!encodedPayload || !suppliedSignature || extra.length > 0) return null;

  const expectedSignature = signSessionPayload(encodedPayload);
  if (!constantTimeEqual(suppliedSignature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<InviteSessionPayload>;
    if (payload.v !== 1 || typeof payload.issuedAt !== "number" || !UUID_PATTERN.test(payload.inviteId ?? "")) {
      return null;
    }
    // Reject obviously malformed/future cookies. Cookie expiration itself is enforced by the browser.
    if (payload.issuedAt > Date.now() + 60_000) return null;
    return { v: 1, inviteId: payload.inviteId, issuedAt: payload.issuedAt };
    return { v: 1, inviteId: payload.inviteId as string, issuedAt: payload.issuedAt };
  } catch {
    return null;
  }
}

/**
 * Browser API requests must originate from this site. APP_ORIGIN is mandatory
 * in production; request.url supplies a convenient development fallback.
 */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expectedOrigin = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).origin : new URL(request.url).origin;

  if (!origin || origin !== expectedOrigin) {
    throw new ApiError(403, "cross_origin_request", "This request is not allowed from this origin.");
  }
}

export function assertCronAuthorization(request: Request) {
  const expected = `Bearer ${requiredEnvironment("CRON_SECRET")}`;
  const supplied = request.headers.get("authorization") ?? "";
  if (!constantTimeEqual(supplied, expected)) {
    throw new ApiError(401, "unauthorized", "Unauthorized.");
  }
}

export async function readJsonBody(request: Request, maxBytes = 8_192): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new ApiError(415, "unsupported_media_type", "Expected an application/json request body.");
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && (!Number.isFinite(Number(contentLength)) || Number(contentLength) > maxBytes)) {
    throw new ApiError(413, "payload_too_large", "Request body is too large.");
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > maxBytes) {
    throw new ApiError(413, "payload_too_large", "Request body is too large.");
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

export function apiErrorBody(error: unknown) {
  if (error instanceof ApiError) {
    return { status: error.status, body: { error: error.message, code: error.code } };
  }

  // Keep operational details and environment values server-side.
  return { status: 500, body: { error: "Something went wrong. Please try again.", code: "internal_error" } };
}

export const privateSessionCookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: PRIVATE_SESSION_MAX_AGE_SECONDS
};
