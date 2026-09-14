/**
 * Client-side types for the invitation story.  Authentication remains server
 * authoritative; `isPrivateSession` only controls presentation and whether the
 * client attempts the private reservation endpoint.
 */
export type InvitationStage =
  | "question"
  | "yes-reaction"
  | "surprise"
  | "schedule"
  | "food"
  | "final";

export type ReservationStatus =
  | "idle"
  | "submitting"
  | "confirmed"
  | "failed";

export interface FoodChoice {
  id: string;
  label: string;
  emoji: string;
}

export interface InvitationState {
  stage: InvitationStage;
  date: string;
  time: string;
  foodId: string | null;
  isPrivateSession: boolean;
  reservationStatus: ReservationStatus;
}

export type InvitationAction =
  | { type: "RESTORE"; payload: Partial<InvitationState> }
  | { type: "PRIVATE_SESSION_RESOLVED"; isPrivateSession: boolean }
  | { type: "YES_CLICKED" }
  | { type: "YES_REACTION_COMPLETE" }
  | { type: "OKAY_CLICKED" }
  | { type: "DATE_CHANGED"; date: string }
  | { type: "TIME_CHANGED"; time: string }
  | { type: "SCHEDULE_CONFIRMED" }
  | { type: "FOOD_SELECTED"; foodId: string }
  | { type: "FOOD_TRANSITION_COMPLETE" }
  | { type: "RESERVATION_SUBMITTING" }
  | { type: "RESERVATION_CONFIRMED" }
  | { type: "RESERVATION_FAILED" };

export interface InvitationEventPayload {
  eventId: string;
  sessionId: string;
  name: string;
  occurredAt: string;
}
