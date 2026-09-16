import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseReservationInput, parseEventBatch, parseInviteInput, InputValidationError } from "@/lib/server/validation";

describe("strict server inputs", () => {
  const valid = () => ({ inviteId: randomUUID(), requestId: randomUUID(), expectedVersion: 0, date: "2099-08-19", time: "19:30", food: "osh" });
  it("accepts stable request IDs and versioned booking inputs", () => {
    const input = valid(); expect(parseReservationInput(input)).toEqual(input);
  });
  it.each([{ date: "2099-02-31" }, { time: "25:00" }, { food: "invalid" }, { expectedVersion: -1 }, { requestId: "bad" }, { inviteId: "bad" }, { inviteId: undefined }, { private: true }])("rejects invalid booking fields %j", (fields) => {
    expect(() => parseReservationInput({ ...valid(), ...fields })).toThrow(InputValidationError);
  });
  it("allows historical syntax through so Postgres can reconcile retries before future validation", () => {
    expect(parseReservationInput({ ...valid(), date: "2020-01-01" }).date).toBe("2020-01-01");
  });
  it("accepts bounded allowlisted batches without arbitrary personal properties", () => {
    const event = { eventId: randomUUID(), name: "visit_started", occurredAt: new Date().toISOString() };
    const batch = { mode: "private", inviteId: randomUUID(), sessionId: randomUUID(), events: [event] };
    expect(parseEventBatch(batch).events).toHaveLength(1);
    expect(() => parseEventBatch({ ...batch, events: [{ ...event, ip: "1.2.3.4" }] })).toThrow(InputValidationError);
    expect(() => parseEventBatch({ ...batch, events: [{ ...event, name: "untrusted_event" }] })).toThrow(InputValidationError);
    expect(() => parseEventBatch({ ...batch, events: Array(21).fill(event) })).toThrow(InputValidationError);
    expect(() => parseEventBatch({ ...batch, events: [{ ...event, occurredAt: "2000-01-01T00:00:00Z" }] })).toThrow(InputValidationError);
    expect(() => parseEventBatch({ ...batch, inviteId: undefined })).toThrow(InputValidationError);
    expect(() => parseEventBatch({ ...batch, mode: "public" })).toThrow(InputValidationError);
    expect(parseEventBatch({ mode: "public", sessionId: batch.sessionId, events: [event] })).not.toHaveProperty("inviteId");
  });
  it("accepts only an exact strong token object", () => {
    expect(parseInviteInput({ token: "a".repeat(43) }).token).toHaveLength(43);
    expect(() => parseInviteInput({ token: "short" })).toThrow();
    expect(() => parseInviteInput({ token: "a".repeat(43), private: true })).toThrow();
  });
});
