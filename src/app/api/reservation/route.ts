import { ApiError, assertSameOrigin, readJsonBody } from "@/lib/server/security";
import { parseReservationInput } from "@/lib/server/validation";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { getCurrentReservation, saveReservation } from "@/lib/server/reservations";
import { dispatchNotification } from "@/lib/server/dispatch";
import { authenticatedInvite, errorResponse, NO_STORE } from "@/lib/server/http";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    const invite = await authenticatedInvite();
    if (new URL(request.url).searchParams.get("inviteId") !== invite.id) {
      throw new ApiError(409, "invitation_session_changed", "This private invitation session changed.");
    }
    return Response.json({ reservation: await getCurrentReservation(invite.id) }, { headers: NO_STORE });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const invite = await authenticatedInvite();
    if (!consumeRateLimit(`reservation:${invite.id}`, 30, 60_000)) {
      throw new ApiError(429, "too_many_requests", "Give this a moment, then try again.");
    }
    const parsed = parseReservationInput(await readJsonBody(request));
    if (parsed.inviteId !== invite.id) {
      throw new ApiError(409, "invitation_session_changed", "This tab's private invitation changed. Reopen its original invitation link before saving.");
    }
    const result = await saveReservation(invite.id, parsed);
    if (result.status === "forbidden") throw new ApiError(403, "forbidden", "This invitation is no longer active.");
    if (result.status === "invalid") throw new ApiError(422, "invalid_schedule", "Choose a date and time in the future.");
    if (result.status === "conflict") {
      return Response.json({ error: "Your plans changed in another tab. Review the latest selection.",
        code: "reservation_conflict", reservation: result.reservation }, { status: 409, headers: NO_STORE });
    }
    let notificationStatus = result.notificationStatus ?? null;
    if (result.notificationId && result.notificationStatus === "pending") {
      notificationStatus = await dispatchNotification(result.notificationId);
    }
    return Response.json({ reservation: result.reservation,
      changed: result.status === "created" || result.status === "updated", notificationStatus },
    { status: result.status === "created" ? 201 : 200, headers: NO_STORE });
  } catch (error) { return errorResponse(error); }
}
