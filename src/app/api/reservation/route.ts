import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { reservations, notificationOutbox } from "@/lib/db/schema";
import { apiErrorBody, assertSameOrigin, readJsonBody, PRIVATE_SESSION_COOKIE, ApiError } from "@/lib/server/security";
import { findActiveInviteFromSession } from "@/lib/server/invites";
import { parseReservationInput } from "@/lib/server/validation";
import { formatReservationMessage, sendTelegramMessage, editTelegramMessage } from "@/lib/server/telegram";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);

    const cookieStore = cookies();
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(PRIVATE_SESSION_COOKIE)?.value;
    const invite = await findActiveInviteFromSession(sessionCookie);

    if (!invite) {
      throw new ApiError(403, "forbidden", "Not authorized.");
    }

    const body = await readJsonBody(request);
    const parsed = parseReservationInput(body);

    const db = getDb();
    
    // Check for existing reservation
    const [existing] = await db.select().from(reservations).where(eq(reservations.inviteId, invite.id)).limit(1);
    
    let reservationId;
    let isUpdate = false;
    
    if (existing) {
      isUpdate = true;
      const [updated] = await db
        .update(reservations)
        .set({
          date: parsed.date,
          time: parsed.time,
          food: parsed.food,
          updatedAt: new Date()
        })
        .where(eq(reservations.id, existing.id))
        .returning({ id: reservations.id });
      reservationId = updated.id;
    } else {
      const [inserted] = await db
        .insert(reservations)
        .values({
          inviteId: invite.id,
          date: parsed.date,
          time: parsed.time,
          food: parsed.food
        })
        .returning({ id: reservations.id });
      reservationId = inserted.id;
    }

    const messageText = formatReservationMessage(parsed.date, parsed.time, parsed.food, isUpdate);
    const payloadHash = createHash("sha256").update(messageText).digest("hex");

    const [outboxEntry] = await db.select().from(notificationOutbox).where(eq(notificationOutbox.reservationId, reservationId)).limit(1);

    let operation: "send" | "edit" = "send";
    let telegramMessageId = outboxEntry?.telegramMessageId;
    const telegramMessageId = outboxEntry?.telegramMessageId;

    if (outboxEntry) {
      if (outboxEntry.payloadHash === payloadHash && outboxEntry.state === "sent") {
        // Idempotent skip
        return Response.json({ confirmed: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
      }
      operation = "edit";
      await db.update(notificationOutbox).set({
        state: "pending",
        operation,
        payloadHash,
        updatedAt: new Date()
      }).where(eq(notificationOutbox.id, outboxEntry.id));
    } else {
      await db.insert(notificationOutbox).values({
        reservationId,
        state: "pending",
        operation,
        payloadHash
      });
    }

    // Try immediate delivery
    let result;
    if (operation === "send") {
      result = await sendTelegramMessage(messageText);
    } else if (operation === "edit" && telegramMessageId) {
      result = await editTelegramMessage(telegramMessageId, messageText);
    }

    if (result) {
      if (result.ok) {
        await db.update(notificationOutbox).set({
          state: "sent",
          telegramMessageId: result.messageId,
          lastAttemptAt: new Date(),
          updatedAt: new Date()
        }).where(eq(notificationOutbox.reservationId, reservationId));
      } else {
        await db.update(notificationOutbox).set({
          lastError: result.error?.slice(0, 500),
          lastAttemptAt: new Date(),
          updatedAt: new Date()
        }).where(eq(notificationOutbox.reservationId, reservationId));
      }
    }

    return Response.json({ confirmed: true }, { status: isUpdate ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { status, body } = apiErrorBody(error);
    return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  }
}
