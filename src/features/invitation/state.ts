import type {
  InvitationAction,
  InvitationStage,
  InvitationState,
} from "./types";

export const INVITATION_SESSION_STORAGE_KEY = "date-invitation:story-state";

const STAGES: readonly InvitationStage[] = [
  "question",
  "yes-reaction",
  "surprise",
  "schedule",
  "food",
  "final",
];

/** A clean state is deliberately public until the server resolves a token. */
export function createInitialInvitationState(): InvitationState {
  return {
    stage: "question",
    date: "",
    time: "",
    foodId: null,
    isPrivateSession: false,
    reservationStatus: "idle",
  };
}

function isStage(value: unknown): value is InvitationStage {
  return typeof value === "string" && STAGES.includes(value as InvitationStage);
}

function isDateValue(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimeValue(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function canReachStage(stage: InvitationStage, state: InvitationState): boolean {
  if (stage === "schedule") return true;
  if (stage === "food") return isScheduleValid(state.date, state.time);
  if (stage === "final") {
    return isScheduleValid(state.date, state.time) && Boolean(state.foodId);
  }

  return true;
}

/**
 * Reducer is intentionally strict about forward-only story progress. It makes
 * stale/corrupt sessionStorage values harmless and gives tests a small pure
 * surface to exercise.
 */
export function invitationReducer(
  state: InvitationState,
  action: InvitationAction,
): InvitationState {
  switch (action.type) {
    case "RESTORE": {
      const nextStage = isStage(action.payload.stage)
        ? action.payload.stage
        : state.stage;
      const candidate: InvitationState = {
        ...state,
        stage: nextStage,
        date: isDateValue(action.payload.date) ? action.payload.date : state.date,
        time: isTimeValue(action.payload.time) ? action.payload.time : state.time,
        foodId:
          typeof action.payload.foodId === "string" || action.payload.foodId === null
            ? action.payload.foodId
            : state.foodId,
        isPrivateSession:
          typeof action.payload.isPrivateSession === "boolean"
            ? action.payload.isPrivateSession
            : state.isPrivateSession,
        reservationStatus:
          action.payload.reservationStatus === "confirmed"
            ? "confirmed"
            : "idle",
      };

      return canReachStage(candidate.stage, candidate) ? candidate : state;
    }

    case "PRIVATE_SESSION_RESOLVED":
      return { ...state, isPrivateSession: action.isPrivateSession };

    case "YES_CLICKED":
      return state.stage === "question"
        ? { ...state, stage: "yes-reaction" }
        : state;

    case "YES_REACTION_COMPLETE":
      return state.stage === "yes-reaction"
        ? { ...state, stage: "surprise" }
        : state;

    case "OKAY_CLICKED":
      return state.stage === "surprise"
        ? { ...state, stage: "schedule" }
        : state;

    case "DATE_CHANGED":
      return { ...state, date: action.date };

    case "TIME_CHANGED":
      return { ...state, time: action.time };

    case "SCHEDULE_CONFIRMED":
      return state.stage === "schedule" && isScheduleValid(state.date, state.time)
        ? { ...state, stage: "food" }
        : state;

    case "FOOD_SELECTED":
      return state.stage === "food"
        ? { ...state, foodId: action.foodId }
        : state;

    case "FOOD_TRANSITION_COMPLETE":
      return state.stage === "food" && Boolean(state.foodId)
        ? { ...state, stage: "final" }
        : state;

    case "RESERVATION_SUBMITTING":
      return { ...state, reservationStatus: "submitting" };

    case "RESERVATION_CONFIRMED":
      return { ...state, reservationStatus: "confirmed" };

    case "RESERVATION_FAILED":
      return { ...state, reservationStatus: "failed" };

    default:
      return state;
  }
}

function nowInTimeZone(timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
}

/**
 * Native controls already constrain their syntax; this also guards programmatic
 * values and requires a future moment in the intended date timezone.
 */
export function isScheduleValid(
  date: string,
  time: string,
  timeZone = "Asia/Tashkent",
): boolean {
  if (!isDateValue(date) || !isTimeValue(time)) return false;

  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
    hours > 23 ||
    minutes > 59
  ) {
    return false;
  }

  const now = nowInTimeZone(timeZone);
  return `${date}T${time}` > `${now.date}T${now.time}`;
}

export function getTodayInTimeZone(timeZone = "Asia/Tashkent"): string {
  return nowInTimeZone(timeZone).date;
}

export function restoreInvitationState(): Partial<InvitationState> | null {
  if (typeof window === "undefined") return null;

  try {
    const serialized = window.sessionStorage.getItem(INVITATION_SESSION_STORAGE_KEY);
    if (!serialized) return null;
    const parsed: unknown = JSON.parse(serialized);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Partial<InvitationState>;
  } catch {
    return null;
  }
}

/** Never persist server authority or transient in-flight/error status. */
export function persistInvitationState(state: InvitationState): void {
  if (typeof window === "undefined") return;

  const persistable = {
    stage: state.stage,
    date: state.date,
    time: state.time,
    foodId: state.foodId,
    reservationStatus:
      state.reservationStatus === "confirmed" ? "confirmed" : "idle",
  };

  try {
    window.sessionStorage.setItem(
      INVITATION_SESSION_STORAGE_KEY,
      JSON.stringify(persistable),
    );
  } catch {
    // Storage can be disabled in private browsing. The experience stays usable.
  }
}
