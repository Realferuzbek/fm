import { describe, expect, it } from "vitest";

import {
  createInitialInvitationState,
  invitationReducer,
  isScheduleValid,
} from "@/features/invitation/state";

describe("invitation story reducer", () => {
  it("moves through the complete story only in its intended order", () => {
    let state = createInitialInvitationState();

    expect(state.stage).toBe("question");

    state = invitationReducer(state, { type: "YES_CLICKED" });
    expect(state.stage).toBe("yes-reaction");

    state = invitationReducer(state, { type: "YES_REACTION_COMPLETE" });
    expect(state.stage).toBe("surprise");

    state = invitationReducer(state, { type: "OKAY_CLICKED" });
    expect(state.stage).toBe("schedule");

    state = invitationReducer(state, { type: "DATE_CHANGED", date: "2099-08-19" });
    state = invitationReducer(state, { type: "TIME_CHANGED", time: "19:30" });
    state = invitationReducer(state, { type: "SCHEDULE_CONFIRMED" });
    expect(state.stage).toBe("food");

    state = invitationReducer(state, { type: "FOOD_SELECTED", foodId: "osh" });
    state = invitationReducer(state, { type: "FOOD_TRANSITION_COMPLETE" });
    expect(state.stage).toBe("final");
    expect(state).toMatchObject({
      date: "2099-08-19",
      time: "19:30",
      foodId: "osh",
    });
  });

  it("does not let an incomplete schedule progress to food", () => {
    let state = createInitialInvitationState();
    state = invitationReducer(state, { type: "YES_CLICKED" });
    state = invitationReducer(state, { type: "YES_REACTION_COMPLETE" });
    state = invitationReducer(state, { type: "OKAY_CLICKED" });
    state = invitationReducer(state, { type: "DATE_CHANGED", date: "2099-08-19" });

    expect(invitationReducer(state, { type: "SCHEDULE_CONFIRMED" })).toEqual(state);
  });

  it("does not restore a final screen without the data needed to render it", () => {
    const clean = createInitialInvitationState();
    const restored = invitationReducer(clean, {
      type: "RESTORE",
      payload: { stage: "final", date: "", time: "", foodId: null },
    });

    expect(restored).toEqual(clean);
  });

  it("validates future dates and calendar/time syntax", () => {
    expect(isScheduleValid("2099-08-19", "19:30")).toBe(true);
    expect(isScheduleValid("2099-02-29", "19:30")).toBe(false);
    expect(isScheduleValid("2096-02-29", "19:30")).toBe(true);
    expect(isScheduleValid("2099-08-19", "24:00")).toBe(false);
    expect(isScheduleValid("not-a-date", "19:30")).toBe(false);
  });

  it("restarts a completed story without treating stored state as authority", () => {
    const state = invitationReducer(createInitialInvitationState(), {
      type: "RESTORE",
      payload: { stage: "final", date: "2099-08-19", time: "19:30", foodId: "osh" },
    });
    expect(state).toEqual(createInitialInvitationState());
    expect(state).not.toHaveProperty("isPrivateSession");
  });

  it("moves an expired unfinished schedule back to the date form", () => {
    const state = invitationReducer(createInitialInvitationState(), {
      type: "RESTORE", payload: { stage: "food", date: "2001-01-01", time: "19:00", foodId: "osh" },
    });
    expect(state.stage).toBe("schedule");
  });

  it("can display a server-confirmed historical reservation", () => {
    const state = invitationReducer(createInitialInvitationState(), {
      type: "SHOW_SAVED", reservation: { id: "saved", version: 1, date: "2001-01-01", time: "19:00", food: "osh" },
    });
    expect(state).toMatchObject({ stage: "final", time: "19:00", foodId: "osh" });
  });

  it("keeps an expired unresolved save available for server reconciliation", () => {
    const state = invitationReducer(createInitialInvitationState(), {
      type: "RECOVER_PENDING", date: "2001-01-01", time: "19:00", foodId: "osh",
    });
    expect(state).toMatchObject({ stage: "food", date: "2001-01-01", foodId: "osh" });
    expect(invitationReducer(state, { type: "RECOVER_PENDING", date: "broken", time: "19:00", foodId: "osh" })).toEqual(state);
  });

  it("does not accept form edits from an unrelated story stage", () => {
    const state = createInitialInvitationState();
    expect(invitationReducer(state, { type: "DATE_CHANGED", date: "2099-08-19" })).toEqual(state);
    expect(invitationReducer(state, { type: "FOOD_SELECTED", foodId: "osh" })).toEqual(state);
  });
});
