import "server-only";
import type { LocationId } from "@/config/invitation";
import { executeSql, type SqlExecutor } from "@/lib/db";
import { formatReservationMessage, sendTelegramMessage } from "./telegram";

export const PRIVATE_OPEN_MESSAGE = "👀 Your private invitation was opened.";
export type DeliveryStatus = "pending" | "sending" | "sent" | "failed" | "unknown";
interface ClaimedDelivery {
  id: string;
  kind: string;
  date: string | null;
  time: string | null;
  food: string | null;
  location: LocationId | null;
  submitted_at: string | Date;
}

export async function deliverNotification(id: string, options: {
  retryFailed?: boolean;
  sql?: SqlExecutor;
  send?: typeof sendTelegramMessage;
} = {}): Promise<DeliveryStatus | "not_claimed"> {
  const sql = options.sql ?? executeSql;
  // Never claim sending/unknown records: a prior request may have delivered.
  const [delivery] = await sql<ClaimedDelivery>(`WITH claimed AS (
    UPDATE notification_deliveries n SET status='sending',attempts=attempts+1,
      last_attempt_at=now(),last_error=NULL
    WHERE n.id=$1 AND n.status=$2
      AND EXISTS (SELECT 1 FROM invites i WHERE i.id=n.invite_id AND i.status='active')
    RETURNING n.*
  ) SELECT c.id,c.kind,r.date,r.time,r.food,r.location,COALESCE(r.created_at,c.created_at) AS submitted_at
    FROM claimed c LEFT JOIN reservation_revisions r ON r.id=c.revision_id`,
  [id, options.retryFailed ? "failed" : "pending"]);
  if (!delivery) return "not_claimed";
  const text = delivery.kind === "invitation_opened" ? PRIVATE_OPEN_MESSAGE :
    formatReservationMessage(delivery.date!, delivery.time!, delivery.food!, delivery.location,
      delivery.kind === "reservation_updated", new Date(delivery.submitted_at));
  const result = await (options.send ?? sendTelegramMessage)(text);
  // Failure to persist this result leaves 'sending'; manual retries cannot
  // claim it, preserving safety even if Telegram succeeded before DB failure.
  await sql(`UPDATE notification_deliveries SET status=$2,telegram_message_id=$3,last_error=$4
    WHERE id=$1 AND status='sending'`, [id, result.status, result.messageId ?? null, result.error ?? null]);
  return result.status;
}
