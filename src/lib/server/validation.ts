import { z } from "zod";

import {
  EVENT_NAMES,
  FOOD_OPTIONS,
  INVITATION_CONFIG,
  isFutureTashkentDateTime,
  isValidDateValue,
  isValidTimeValue,
  type AnalyticsEventName,
  type FoodId
} from "@/config/invitation";

export const foodOptions = FOOD_OPTIONS.map((option) => option.id) as [FoodId, ...FoodId[]];
export const eventNames = EVENT_NAMES as [AnalyticsEventName, ...AnalyticsEventName[]];
export const eventNames = EVENT_NAMES as unknown as [AnalyticsEventName, ...AnalyticsEventName[]];

export class InputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputValidationError";
  }
}

export const reservationInputSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    food: z.enum(foodOptions)
  })
  .strict();

export type ReservationInput = z.infer<typeof reservationInputSchema>;

export function parseReservationInput(input: unknown): ReservationInput {
  const parsed = reservationInputSchema.safeParse(input);
  if (!parsed.success || !isValidDateValue(parsed.data.date) || !isValidTimeValue(parsed.data.time)) {
    throw new InputValidationError("Choose a valid date, time, and food option.");
  }

  if (!isFutureTashkentDateTime(parsed.data.date, parsed.data.time)) {
    throw new InputValidationError(`Please choose a future date and time in ${INVITATION_CONFIG.timeZone}.`);
  }

  return parsed.data;
}

export const eventInputSchema = z
  .object({
    eventId: z.string().min(16).max(64).regex(/^[A-Za-z0-9_-]+$/),
    sessionId: z.string().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/),
    name: z.enum(eventNames),
    occurredAt: z.string().datetime({ offset: true })
  })
  .strict();

export type EventInput = z.infer<typeof eventInputSchema>;

export function parseEventInput(input: unknown): EventInput {
  const parsed = eventInputSchema.safeParse(input);
  if (!parsed.success) throw new InputValidationError("Event payload is not valid.");

  const occurredAt = new Date(parsed.data.occurredAt).getTime();
  const now = Date.now();
  // A generous client-clock tolerance prevents accidental bad analytics while
  // still rejecting arbitrary historical/future timestamp payloads.
  if (!Number.isFinite(occurredAt) || occurredAt < now - 31 * 24 * 60 * 60 * 1_000 || occurredAt > now + 24 * 60 * 60 * 1_000) {
    throw new InputValidationError("Event timestamp is outside the accepted range.");
  }

  return parsed.data;
}
