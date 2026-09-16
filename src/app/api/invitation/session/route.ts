import { cookies } from "next/headers";
import { findActiveInviteFromSession } from "@/lib/server/invites";
import { PRIVATE_SESSION_COOKIE } from "@/lib/server/security";
import { getCurrentReservation } from "@/lib/server/reservations";
import { errorResponse, NO_STORE } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const invite = await findActiveInviteFromSession(cookieStore.get(PRIVATE_SESSION_COOKIE)?.value);
    return Response.json({ inviteId: invite?.id ?? null,
      reservation: invite ? await getCurrentReservation(invite.id) : null }, { headers: NO_STORE });
  } catch (error) { return errorResponse(error); }
}
