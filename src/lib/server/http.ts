import "server-only";
import { cookies } from "next/headers";
import { findActiveInviteFromSession } from "./invites";
import { ApiError, apiErrorBody, PRIVATE_SESSION_COOKIE } from "./security";

export const NO_STORE = { "Cache-Control": "no-store" };
export function errorResponse(error: unknown) {
  const { status, body } = apiErrorBody(error);
  return Response.json(body, { status, headers: NO_STORE });
}
export async function authenticatedInvite() {
  const cookieStore = await cookies();
  const invite = await findActiveInviteFromSession(cookieStore.get(PRIVATE_SESSION_COOKIE)?.value);
  if (!invite) throw new ApiError(403, "forbidden", "Open your private invitation link to continue.");
  return invite;
}
