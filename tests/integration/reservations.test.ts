// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SqlExecutor } from "@/lib/db";
import { saveReservation, getCurrentReservation } from "@/lib/server/reservations";
import { persistEvents } from "@/lib/server/events";
import { deliverNotification, PRIVATE_OPEN_MESSAGE } from "@/lib/server/notifications";

const files = ["0000_existing_schema.sql", "0001_reservation_history.sql", "0002_request_idempotency.sql"];
async function migrate(db: PGlite, names = files) {
  for (const file of names) await db.exec(await readFile(`drizzle/${file}`, "utf8"));
}

describe("real Postgres reservation and delivery transactions", () => {
  let db: PGlite;
  let sql: SqlExecutor;
  let inviteId: string;
  const input = (extra = {}) => ({ inviteId, requestId: randomUUID(), expectedVersion: 0, date: "2099-08-19", time: "19:30", food: "osh" as const, ...extra });

  beforeAll(async () => {
    db = new PGlite();
    await migrate(db);
    sql = async <T>(statement: string, parameters: unknown[] = []) => (await db.query<T>(statement, parameters)).rows;
  }, 30000);
  beforeEach(async () => {
    await db.exec("TRUNCATE invites,reservations,reservation_revisions,reservation_requests,notification_deliveries,notification_outbox,events CASCADE");
    const [invite] = await sql<{ id: string }>("INSERT INTO invites(token_hash) VALUES($1) RETURNING id", ["a".repeat(64)]);
    inviteId = invite.id;
  });
  afterAll(async () => { await db.close(); });

  it("persists one booking, immutable revision and pending notification in one transaction", async () => {
    const result = await saveReservation(inviteId, input(), sql);
    expect(result.status).toBe("created");
    expect(result.reservation?.version).toBe(1);
    expect(result.notificationStatus).toBe("pending");
    expect(await sql("SELECT * FROM reservation_revisions")).toHaveLength(1);
    expect(await getCurrentReservation(inviteId, sql)).toEqual(result.reservation);
  });

  it("deduplicates concurrent retries and unchanged replay without new booking or notification", async () => {
    const request = input();
    const results = await Promise.all(Array.from({ length: 5 }, () => saveReservation(inviteId, request, sql)));
    expect(results.filter((item) => item.status === "created")).toHaveLength(1);
    expect(new Set(results.map((item) => item.reservation?.id)).size).toBe(1);
    const replay = await saveReservation(inviteId, input(), sql);
    expect(replay.status).toBe("unchanged");
    expect(await sql("SELECT * FROM reservations")).toHaveLength(1);
    expect(await sql("SELECT * FROM notification_deliveries")).toHaveLength(1);
  });

  it("retains earlier selections and allows exactly one optimistic revision", async () => {
    await saveReservation(inviteId, input(), sql);
    const change = input({ expectedVersion: 1, time: "20:00" });
    const [first, second] = await Promise.all([
      saveReservation(inviteId, change, sql),
      saveReservation(inviteId, input({ expectedVersion: 1, time: "21:00" }), sql),
    ]);
    expect(first.status).toBe("updated");
    expect(second.status).toBe("conflict");
    expect(second.reservation?.time).toBe("20:00");
    expect((await sql<{ time: string }>("SELECT time FROM reservation_revisions ORDER BY version")).map((row) => row.time)).toEqual(["19:30", "20:00"]);
    expect((await sql<{ kind: string }>("SELECT kind FROM notification_deliveries ORDER BY created_at")).map((row) => row.kind)).toEqual(["reservation_confirmed", "reservation_updated"]);
    expect((await saveReservation(inviteId, change, sql)).status).toBe("replayed");
  });

  it("rejects key reuse with changed data even when original operation was an unchanged replay", async () => {
    await saveReservation(inviteId, input(), sql);
    const replay = input({ expectedVersion: 1 });
    expect((await saveReservation(inviteId, replay, sql)).status).toBe("unchanged");
    expect((await saveReservation(inviteId, { ...replay, time: "20:00" }, sql)).status).toBe("conflict");
    expect((await getCurrentReservation(inviteId, sql))?.version).toBe(1);
  });

  it("rejects past choices and revoked invitations without deleting history", async () => {
    expect((await saveReservation(inviteId, input({ date: "2020-01-01" }), sql)).status).toBe("invalid");
    await saveReservation(inviteId, input(), sql);
    await sql("UPDATE invites SET status='revoked' WHERE id=$1", [inviteId]);
    expect((await saveReservation(inviteId, input({ expectedVersion: 1, time: "20:00" }), sql)).status).toBe("forbidden");
    expect(await sql("SELECT * FROM reservation_revisions")).toHaveLength(1);
  });

  it("rolls the booking back if its notification ledger cannot be written", async () => {
    await db.exec("ALTER TABLE notification_deliveries ADD CONSTRAINT test_reject CHECK(kind='invitation_opened')");
    await expect(saveReservation(inviteId, input(), sql)).rejects.toThrow();
    await db.exec("ALTER TABLE notification_deliveries DROP CONSTRAINT test_reject");
    expect(await sql("SELECT * FROM reservations")).toHaveLength(0);
    expect(await sql("SELECT * FROM reservation_revisions")).toHaveLength(0);
  });

  it("persists public milestones without notifications and deduplicates private opens per visit", async () => {
    const sessionId = randomUUID();
    const event = () => ({ eventId: randomUUID(), name: "visit_started" as const, occurredAt: new Date().toISOString() });
    expect(await persistEvents({ mode: "public", sessionId, events: [event()] }, null, sql)).toBeNull();
    const privateBatch = { mode: "private" as const, inviteId, sessionId, events: [event()] };
    const delivery = await persistEvents(privateBatch, inviteId, sql);
    expect(delivery).toBeTruthy();
    // A lost response before dispatch can safely recover the still-pending delivery.
    expect(await persistEvents(privateBatch, inviteId, sql)).toBe(delivery);
    await persistEvents({ ...privateBatch, events: [event()] }, inviteId, sql);
    expect(await sql("SELECT * FROM notification_deliveries")).toHaveLength(1);
    const send = vi.fn(async () => ({ status: "sent" as const, messageId: "100" }));
    await deliverNotification(delivery!, { sql, send });
    expect(send).toHaveBeenCalledExactlyOnceWith(PRIVATE_OPEN_MESSAGE);
    await persistEvents({ ...privateBatch, sessionId: randomUUID(), events: [event()] }, inviteId, sql);
    expect(await sql("SELECT * FROM notification_deliveries")).toHaveLength(2);
  });

  it("claims once, permits failed-only manual retry, and refuses unknown/sending/sent records", async () => {
    const saved = await saveReservation(inviteId, input(), sql);
    const send = vi.fn(async () => ({ status: "failed" as const, error: "Telegram rejected the request (400)." }));
    const attempts = await Promise.all(Array.from({ length: 4 }, () => deliverNotification(saved.notificationId!, { sql, send })));
    expect(attempts.filter((value) => value === "failed")).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await deliverNotification(saved.notificationId!, { sql, send })).toBe("not_claimed");
    const uncertain = vi.fn(async () => ({ status: "unknown" as const, error: "Timeout" }));
    expect(await deliverNotification(saved.notificationId!, { sql, send: uncertain, retryFailed: true })).toBe("unknown");
    expect(await deliverNotification(saved.notificationId!, { sql, send, retryFailed: true })).toBe("not_claimed");
    for (const status of ["sending", "sent", "pending"]) {
      await sql("UPDATE notification_deliveries SET status=$2 WHERE id=$1", [saved.notificationId!, status]);
      expect(await deliverNotification(saved.notificationId!, { sql, send, retryFailed: true })).toBe("not_claimed");
    }
  });

  it("does not resend if storing the Telegram result fails after actual delivery", async () => {
    const saved = await saveReservation(inviteId, input(), sql);
    const send = vi.fn(async () => ({ status: "sent" as const, messageId: "101" }));
    const failOnWrite: SqlExecutor = (statement, parameters) => {
      if (statement.startsWith("UPDATE notification_deliveries SET status=")) throw new Error("Database offline");
      return sql(statement, parameters);
    };
    await expect(deliverNotification(saved.notificationId!, { sql: failOnWrite, send })).rejects.toThrow();
    expect(await deliverNotification(saved.notificationId!, { sql, send, retryFailed: true })).toBe("not_claimed");
    expect(send).toHaveBeenCalledTimes(1);
  });
});

it("migrates existing bookings and sent/unsent history without scheduling historical messages", async () => {
  const db = new PGlite();
  try {
    await migrate(db, [files[0]]);
    await db.exec(`INSERT INTO invites(id,token_hash) VALUES ('00000000-0000-4000-8000-000000000001','hash');
      INSERT INTO reservations(id,invite_id,date,time,food) VALUES
      ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','2020-01-01','19:30','osh');
      INSERT INTO notification_outbox(reservation_id,payload_hash,state,telegram_message_id) VALUES
      ('00000000-0000-4000-8000-000000000002','old-hash','sent','42');
      INSERT INTO invites(id,token_hash) VALUES ('00000000-0000-4000-8000-000000000003','hash2');
      INSERT INTO reservations(id,invite_id,date,time,food) VALUES
      ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000003','2020-01-01','19:30','osh');
      INSERT INTO notification_outbox(reservation_id,payload_hash,state) VALUES
      ('00000000-0000-4000-8000-000000000004','old-hash','failed');`);
    await migrate(db, files.slice(1));
    const { rows } = await db.query<{ status: string; telegram_message_id: string }>("SELECT status,telegram_message_id FROM notification_deliveries ORDER BY status");
    expect(rows).toEqual([{ status: "sent", telegram_message_id: "42" }, { status: "unknown", telegram_message_id: null }]);
    expect((await db.query("SELECT * FROM notification_outbox")).rows).toHaveLength(2);
    expect((await db.query("SELECT * FROM reservation_revisions")).rows).toHaveLength(2);
    await migrate(db, files.slice(1));
    expect((await db.query("SELECT * FROM notification_deliveries")).rows).toHaveLength(2);
  } finally { await db.close(); }
}, 30000);
