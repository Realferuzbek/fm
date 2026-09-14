import { describe, expect, it } from "vitest";
import { parseReservationInput, parseEventInput, InputValidationError } from "@/lib/server/validation";

describe("validation utilities", () => {
  it("parses valid reservation inputs with future dates", () => {
    const valid = {
      date: "2099-08-19",
      time: "19:30",
      food: "osh",
    };

    const parsed = parseReservationInput(valid);
    expect(parsed).toEqual(valid);
  });

  it("throws InputValidationError on past dates or invalid times", () => {
    expect(() =>
      parseReservationInput({
        date: "2020-01-01",
        time: "12:00",
        food: "donar",
      })
    ).toThrow(InputValidationError);

    expect(() =>
      parseReservationInput({
        date: "2099-08-19",
        time: "25:00",
        food: "donar",
      })
    ).toThrow(InputValidationError);

    expect(() =>
      parseReservationInput({
        date: "2099-08-19",
        time: "12:00",
        food: "invalid_food",
      })
    ).toThrow(InputValidationError);
  });

  it("parses valid allowlisted event payloads", () => {
    const validEvent = {
      eventId: "event-1234567890abcdef",
      sessionId: "session-1234567890abcdef",
      name: "visit_started",
      occurredAt: new Date().toISOString(),
    };

    const parsed = parseEventInput(validEvent);
    expect(parsed.name).toBe("visit_started");
  });

  it("rejects unallowlisted event names", () => {
    expect(() =>
      parseEventInput({
        eventId: "event-1234567890abcdef",
        sessionId: "session-1234567890abcdef",
        name: "malicious_event",
        occurredAt: new Date().toISOString(),
      })
    ).toThrow(InputValidationError);
  });
});

