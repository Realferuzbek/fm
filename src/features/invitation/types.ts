import type { FoodId, AnalyticsEventName } from "@/config/invitation";

export type InvitationStage = "question" | "yes-reaction" | "surprise" | "schedule" | "food" | "final";
export interface InvitationState {
  stage: InvitationStage;
  date: string;
  time: string;
  foodId: FoodId | null;
}
export type InvitationAction =
  | { type: "RESTORE"; payload: Partial<InvitationState> }
  | { type: "RECOVER_PENDING"; date: string; time: string; foodId: FoodId }
  | { type: "RESET" }
  | { type: "YES_CLICKED" }
  | { type: "YES_REACTION_COMPLETE" }
  | { type: "OKAY_CLICKED" }
  | { type: "DATE_CHANGED"; date: string }
  | { type: "TIME_CHANGED"; time: string }
  | { type: "SCHEDULE_CONFIRMED" }
  | { type: "FOOD_SELECTED"; foodId: FoodId }
  | { type: "FOOD_TRANSITION_COMPLETE" }
  | { type: "EDIT_SCHEDULE" }
  | { type: "SHOW_SAVED"; reservation: ReservationSnapshot };
export interface ReservationSnapshot {
  id: string;
  date: string;
  time: string;
  food: FoodId;
  version: number;
}
export type VisitorMode = "resolving" | "public" | "private" | "error";
export interface InvitationEventPayload {
  eventId: string;
  name: AnalyticsEventName;
  occurredAt: string;
}
