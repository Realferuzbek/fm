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
});
