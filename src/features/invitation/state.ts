import { FOOD_OPTIONS, getTashkentNow, isFutureTashkentDateTime, isValidDateValue, isValidTimeValue } from "@/config/invitation";
import type { InvitationAction, InvitationState } from "./types";

export const INVITATION_SESSION_STORAGE_KEY = "date-invitation:story-v2";
export const isScheduleValid = isFutureTashkentDateTime;
export const getTodayInTimeZone = () => getTashkentNow().date;
export function createInitialInvitationState(): InvitationState {
  return { stage: "question", date: "", time: "", foodId: null };
}
export function invitationReducer(state: InvitationState, action: InvitationAction): InvitationState {
  switch (action.type) {
    case "RESET": return createInitialInvitationState();
    case "RECOVER_PENDING": return isValidDateValue(action.date) && isValidTimeValue(action.time) && FOOD_OPTIONS.some(food => food.id === action.foodId)
      ? { stage: "food", date: action.date, time: action.time, foodId: action.foodId } : state;
    case "RESTORE": {
      const value = action.payload;
      // Completed stories restart; the saved booking remains server-authoritative.
      if (value.stage === "final") return createInitialInvitationState();
      if (!["question", "surprise", "schedule", "food"].includes(value.stage ?? "")) return state;
      const date = typeof value.date === "string" && isValidDateValue(value.date) ? value.date : "";
      const time = typeof value.time === "string" && isValidTimeValue(value.time) ? value.time : "";
      const foodId = FOOD_OPTIONS.some(food => food.id === value.foodId) ? value.foodId! : null;
      return { stage: value.stage === "food" && !isScheduleValid(date, time) ? "schedule" : value.stage!, date, time, foodId };
    }
    case "YES_CLICKED": return state.stage === "question" ? { ...state, stage: "yes-reaction" } : state;
    case "YES_REACTION_COMPLETE": return state.stage === "yes-reaction" ? { ...state, stage: "surprise" } : state;
    case "OKAY_CLICKED": return state.stage === "surprise" ? { ...state, stage: "schedule" } : state;
    case "DATE_CHANGED": return state.stage === "schedule" ? { ...state, date: action.date } : state;
    case "TIME_CHANGED": return state.stage === "schedule" ? { ...state, time: action.time } : state;
    case "SCHEDULE_CONFIRMED": return state.stage === "schedule" && isScheduleValid(state.date, state.time) ? { ...state, stage: "food" } : state;
    case "FOOD_SELECTED": return state.stage === "food" && FOOD_OPTIONS.some(food => food.id === action.foodId) ? { ...state, foodId: action.foodId } : state;
    case "FOOD_TRANSITION_COMPLETE": return state.stage === "food" && state.foodId ? { ...state, stage: "final" } : state;
    case "EDIT_SCHEDULE": return { ...state, stage: "schedule" };
    case "SHOW_SAVED": return { stage: "final", date: action.reservation.date, time: action.reservation.time, foodId: action.reservation.food };
  }
}
export function restoreInvitationState(scope: string): Partial<InvitationState> | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(INVITATION_SESSION_STORAGE_KEY + ":" + scope) ?? "null");
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch { return null; }
}
export function persistInvitationState(state: InvitationState, scope: string): void {
  try { sessionStorage.setItem(INVITATION_SESSION_STORAGE_KEY + ":" + scope, JSON.stringify(state)); }
  catch { /* Storage restrictions must not stop the story. */ }
}
