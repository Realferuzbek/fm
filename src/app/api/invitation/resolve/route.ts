import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { apiErrorBody, assertSameOrigin, createInviteSession, isValidInviteToken, privateSessionCookieOptions, PRIVATE_SESSION_COOKIE, readJsonBody, ApiError } from "@/lib/server/security";
import { findActiveInviteByToken } from "@/lib/server/invites";
import { consumeRateLimit } from "@/lib/server/rate-limit";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);

    const ipHash = createHash("sha256")
      .update(request.headers.get("x-forwarded-for") ?? request.headers.get("user-agent") ?? "unknown")
      .digest("hex");

    if (!consumeRateLimit(`resolve:${ipHash}`, 10, 60_000)) {
      throw new ApiError(429, "too_many_requests", "Too many requests.");
    }

    const body = await readJsonBody(request) as { token?: unknown };
    if (!body || typeof body.token !== "string" || !isValidInviteToken(body.token)) {
      throw new ApiError(400, "invalid_invite_token", "The invitation link is not valid.");
    }

    const invite = await findActiveInviteByToken(body.token);
    if (!invite) {
      return Response.json({ error: "Invitation not found or expired.", code: "invite_not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    const sessionValue = createInviteSession(invite.id);
    cookies().set(PRIVATE_SESSION_COOKIE, sessionValue, privateSessionCookieOptions);
    const cookieStore = await cookies();
    cookieStore.set(PRIVATE_SESSION_COOKIE, sessionValue, privateSessionCookieOptions);

    return Response.json({ resolved: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { status, body } = apiErrorBody(error);
    return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  }
}
