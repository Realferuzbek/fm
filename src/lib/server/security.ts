import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isUuidValue } from "@/config/invitation";

export const PRIVATE_SESSION_COOKIE = "date_invite_session";
export const PRIVATE_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 31;

const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

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
  if (!value || value.length < 32 || value.startsWith("replace-with")) throw new Error(`${name} must be a strong server-only secret.`);
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
  if (!isUuidValue(inviteId)) throw new Error("Cannot create a session for an invalid invite id.");

  const payload: InviteSessionPayload = { v: 1, inviteId, issuedAt };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${signSessionPayload(encodedPayload)}`;
}

export function readInviteSession(cookieValue: string | undefined): InviteSessionPayload | null {
  if (!cookieValue || cookieValue.length > 1024) return null;
  const [encodedPayload, suppliedSignature, ...extra] = cookieValue.split(".");
  if (!encodedPayload || !suppliedSignature || extra.length > 0) return null;

  const expectedSignature = signSessionPayload(encodedPayload);
  if (!constantTimeEqual(suppliedSignature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<InviteSessionPayload>;
    if (payload.v !== 1 || typeof payload.issuedAt !== "number" || !isUuidValue(payload.inviteId)) {
      return null;
    }
    const age = Date.now() - payload.issuedAt;
    if (!Number.isFinite(payload.issuedAt) || age < -60_000 || age >= PRIVATE_SESSION_MAX_AGE_SECONDS * 1000) return null;
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
  if (process.env.NODE_ENV === "production" && !process.env.APP_ORIGIN) {
    throw new Error("APP_ORIGIN is required in production.");
  }
  const expectedOrigin = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).origin : new URL(request.url).origin;

  if (!origin || origin !== expectedOrigin) {
    throw new ApiError(403, "cross_origin_request", "This request is not allowed from this origin.");
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

  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "invalid_json", "Request body must be valid JSON.");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let rawBody = "";
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new ApiError(413, "payload_too_large", "Request body is too large.");
      }
      rawBody += decoder.decode(value, { stream: true });
    }
    rawBody += decoder.decode();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON.");
  } finally {
    reader.releaseLock();
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
