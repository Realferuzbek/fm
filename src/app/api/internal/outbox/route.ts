import { inArray, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { notificationOutbox, reservations } from "@/lib/db/schema";
import { apiErrorBody, assertCronAuthorization } from "@/lib/server/security";
import { formatReservationMessage, sendTelegramMessage, editTelegramMessage } from "@/lib/server/telegram";

export async function POST(request: Request) {
  try {
    assertCronAuthorization(request);

    const db = getDb();
    const now = new Date();
    
    const entries = await db
      .select({
        outbox: notificationOutbox,
        reservation: reservations
      })
      .from(notificationOutbox)
      .innerJoin(reservations, eq(notificationOutbox.reservationId, reservations.id))
      .where(inArray(notificationOutbox.state, ["pending", "failed"]))
      .limit(10);

    let processedCount = 0;

    for (const { outbox, reservation } of entries) {
      if (outbox.nextAttemptAt && outbox.nextAttemptAt > now) {
        continue;
      }

      const isUpdate = outbox.operation === "edit";
      const messageText = formatReservationMessage(reservation.date, reservation.time, reservation.food, isUpdate);
      
      let result;
      if (outbox.operation === "send") {
        result = await sendTelegramMessage(messageText);
      } else if (outbox.operation === "edit" && outbox.telegramMessageId) {
        result = await editTelegramMessage(outbox.telegramMessageId, messageText);
      } else {
        // Edit but no message ID, fallback to send
        result = await sendTelegramMessage(messageText);
      }

      const attemptTime = new Date();
      
      if (result?.ok) {
        await db.update(notificationOutbox).set({
          state: "sent",
          telegramMessageId: result.messageId || outbox.telegramMessageId,
          lastAttemptAt: attemptTime,
          updatedAt: attemptTime
        }).where(eq(notificationOutbox.id, outbox.id));
      } else {
        const attempts = outbox.attempts + 1;
        const state = attempts >= 5 ? "ambiguous" : "failed";
        const delay = Math.min(60 * 1000 * Math.pow(2, attempts - 1), 60 * 60 * 1000);
        const nextAttemptAt = new Date(attemptTime.getTime() + delay);
        
        await db.update(notificationOutbox).set({
          state,
          attempts,
          lastError: result?.error?.slice(0, 500) || "Unknown error",
          lastAttemptAt: attemptTime,
          nextAttemptAt,
          ambiguousAt: state === "ambiguous" ? attemptTime : null,
          updatedAt: attemptTime
        }).where(eq(notificationOutbox.id, outbox.id));
      }
      processedCount++;
    }

    return Response.json({ processed: processedCount }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { status, body } = apiErrorBody(error);
    return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  }
}
