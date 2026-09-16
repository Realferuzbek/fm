import "server-only";
import { executeSql, type SqlExecutor } from "@/lib/db";
import type { EventBatch } from "./validation";

export async function persistEvents(batch: EventBatch, inviteId: string | null, sql: SqlExecutor = executeSql) {
  // Ledger creation and milestone persistence are one statement/transaction.
  // Deduping the delivery separately from event IDs also covers reloads.
  const [result] = await sql<{ notification_id: string | null }>(`WITH accepted AS (
    INSERT INTO events(event_id,session_id,name,mode,invite_id,occurred_at)
    SELECT e."eventId",$2,e.name,$3::event_mode,$4::uuid,e."occurredAt"::timestamptz
    FROM jsonb_to_recordset($1::jsonb) AS e("eventId" text,name text,"occurredAt" text)
    WHERE $3='public' OR EXISTS (SELECT 1 FROM invites WHERE id=$4::uuid AND status='active')
    ON CONFLICT(event_id) DO NOTHING RETURNING name
  ), notification AS (
    INSERT INTO notification_deliveries(invite_id,kind,dedupe_key)
    SELECT $4::uuid,'invitation_opened','visit:'||$2
    WHERE $3='private' AND EXISTS (SELECT 1 FROM accepted WHERE name='visit_started')
    ON CONFLICT(invite_id,kind,dedupe_key) DO NOTHING RETURNING id
  ) SELECT COALESCE((SELECT id FROM notification),
    (SELECT id FROM notification_deliveries WHERE invite_id=$4::uuid
      AND kind='invitation_opened' AND dedupe_key='visit:'||$2 AND status='pending'
      AND $3='private' AND EXISTS (
        SELECT 1 FROM jsonb_to_recordset($1::jsonb) AS e(name text) WHERE e.name='visit_started'
      ) AND EXISTS (SELECT 1 FROM invites WHERE id=$4::uuid AND status='active')
    )) AS notification_id`,
  [JSON.stringify(batch.events), batch.sessionId, batch.mode, inviteId]);
  return result?.notification_id ?? null;
}
