import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { apiErrorBody, assertSameOrigin, readJsonBody, readInviteSession, PRIVATE_SESSION_COOKIE, ApiError } from "@/lib/server/security";
import { parseEventInput } from "@/lib/server/validation";
import { consumeRateLimit } from "@/lib/server/rate-limit";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);

    const body = await readJsonBody(request);
    const parsed = parseEventInput(body);

    const sessionHash = createHash("sha256").update(parsed.sessionId).digest("hex");
    if (!consumeRateLimit(`events:${sessionHash}`, 60, 60_000)) {
      throw new ApiError(429, "too_many_requests", "Too many requests.");
    }

    const cookieStore = cookies();
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(PRIVATE_SESSION_COOKIE)?.value;
    const session = readInviteSession(sessionCookie);

    const mode = session ? "private" : "public";
    const inviteId = session ? session.inviteId : null;

    const db = getDb();
    await db
      .insert(events)
      .values({
        eventId: parsed.eventId,
        sessionId: parsed.sessionId,
        name: parsed.name,
        mode,
        inviteId,
        occurredAt: new Date(parsed.occurredAt)
      })
      .onConflictDoNothing({ target: events.eventId });

    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const { status, body } = apiErrorBody(error);
    return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  }
}
