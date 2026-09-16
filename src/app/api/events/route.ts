import { assertSameOrigin, readJsonBody, ApiError } from "@/lib/server/security";
import { parseEventBatch } from "@/lib/server/validation";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { persistEvents } from "@/lib/server/events";
import { dispatchNotification } from "@/lib/server/dispatch";
import { authenticatedInvite, errorResponse, NO_STORE } from "@/lib/server/http";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const batch = parseEventBatch(await readJsonBody(request, 8_192));
    // Explicit public mode never reads the private cookie or sends notifications.
    const invite = batch.mode === "private" ? await authenticatedInvite() : null;
    if (batch.mode === "private" && batch.inviteId !== invite?.id) {
      throw new ApiError(409, "invitation_session_changed", "This private invitation session changed.");
    }
    if (!consumeRateLimit(`events:${invite?.id ?? batch.sessionId}`, 120, 60_000)) {
      throw new ApiError(429, "too_many_requests", "Too many requests.");
    }
    if (!process.env.DATABASE_URL && batch.mode === "public") {
      return Response.json({ accepted: false, disabled: true }, { status: 202, headers: NO_STORE });
    }
    const notificationId = await persistEvents(batch, invite?.id ?? null);
    if (notificationId) await dispatchNotification(notificationId);
    return new Response(null, { status: 204, headers: NO_STORE });
  } catch (error) { return errorResponse(error); }
}
