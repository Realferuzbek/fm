import { z } from "zod";
import { EVENT_NAMES, FOOD_OPTIONS, LOCATION_OPTIONS, isValidDateValue, isValidTimeValue } from "@/config/invitation";
import { ApiError } from "./security";

export class InputValidationError extends ApiError {
  constructor(message: string) { super(422, "invalid_input", message); }
}

export const reservationInputSchema = z.object({
  inviteId: z.uuid(),
  date: z.string().refine(isValidDateValue),
  time: z.string().refine(isValidTimeValue),
  food: z.enum(FOOD_OPTIONS.map((food) => food.id)),
  location: z.enum(LOCATION_OPTIONS),
  requestId: z.uuid(),
  expectedVersion: z.number().int().min(0).max(2147483646),
}).strict();
export type ReservationInput = z.infer<typeof reservationInputSchema>;

// Future-time validation happens atomically in Postgres AFTER checking retries.
export function parseReservationInput(input: unknown): ReservationInput {
  const parsed = reservationInputSchema.safeParse(input);
  if (!parsed.success) throw new InputValidationError("Choose a valid date, time, food, and meeting spot.");
  return parsed.data;
}

const opaqueId = z.uuid();
export const eventInputSchema = z.object({
  eventId: opaqueId,
  name: z.enum(EVENT_NAMES),
  occurredAt: z.string().datetime({ offset: true }),
}).strict();
export type EventInput = z.infer<typeof eventInputSchema>;
const eventBatchFields = {
  sessionId: opaqueId,
  events: z.array(eventInputSchema).min(1).max(20),
};
export const eventBatchSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("public"), ...eventBatchFields }).strict(),
  z.object({ mode: z.literal("private"), inviteId: z.uuid(), ...eventBatchFields }).strict(),
]);
export type EventBatch = z.infer<typeof eventBatchSchema>;

export function parseEventBatch(input: unknown): EventBatch {
  const parsed = eventBatchSchema.safeParse(input);
  if (!parsed.success) throw new InputValidationError("Event payload is not valid.");
  const now = Date.now();
  for (const event of parsed.data.events) {
    const occurredAt = Date.parse(event.occurredAt);
    if (occurredAt < now - 31 * 86400000 || occurredAt > now + 86400000) {
      throw new InputValidationError("Event timestamp is outside the accepted range.");
    }
  }
  return parsed.data;
}

export function parseInviteInput(input: unknown) {
  const parsed = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict().safeParse(input);
  if (!parsed.success) throw new ApiError(400, "invalid_invite_token", "The invitation link is not valid.");
  return parsed.data;
}
