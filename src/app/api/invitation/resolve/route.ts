import { cookies } from "next/headers";
import { assertSameOrigin, createInviteSession, hashInviteToken, privateSessionCookieOptions, PRIVATE_SESSION_COOKIE, readJsonBody, ApiError } from "@/lib/server/security";
import { findActiveInviteByToken } from "@/lib/server/invites";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { parseInviteInput } from "@/lib/server/validation";
import { getCurrentReservation } from "@/lib/server/reservations";
import { errorResponse, NO_STORE } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { token } = parseInviteInput(await readJsonBody(request, 1024));
    if (!consumeRateLimit(`resolve:${hashInviteToken(token)}`, 30, 60_000)) {
      throw new ApiError(429, "too_many_requests", "Give this a moment, then try again.");
    }
    const invite = await findActiveInviteByToken(token);
    if (!invite) throw new ApiError(404, "invite_not_found", "This invitation is not available. Ask for a fresh link.");
    const reservation = await getCurrentReservation(invite.id);
    const cookieStore = await cookies();
    cookieStore.set(PRIVATE_SESSION_COOKIE, createInviteSession(invite.id), privateSessionCookieOptions);
    return Response.json({ inviteId: invite.id, reservation }, { headers: NO_STORE });
  } catch (error) { return errorResponse(error); }
}
