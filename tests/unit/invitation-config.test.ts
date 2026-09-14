import { describe, expect, it } from "vitest";

import {
  EVENT_NAMES,
  FOOD_OPTIONS,
  INVITATION_CONFIG,
  formatDateTimeInTashkent,
  isFutureTashkentDateTime,
  isValidDateValue,
  isValidTimeValue,
} from "@/config/invitation";

describe("invitation configuration", () => {
  it("contains the intentionally personal food choices exactly once", () => {
    expect(FOOD_OPTIONS).toHaveLength(6);
    expect(FOOD_OPTIONS.map((option) => option.id)).toEqual([
      "donar",
      "lavash",
      "shashlik",
      "taco",
      "lagmon",
      "osh",
    ]);
    expect(new Set(FOOD_OPTIONS.map((option) => option.id)).size).toBe(
      FOOD_OPTIONS.length,
    );
  });

  it("keeps analytics to the allowlisted milestones", () => {
    expect(EVENT_NAMES).toContain("visit_started");
    expect(EVENT_NAMES).toContain("no_button_attempted");
    expect(EVENT_NAMES).toContain("telegram_clicked");
    expect(EVENT_NAMES).toHaveLength(14);
  });

  it("keeps personal assets and the destination in one safe configuration entry", () => {
    expect(INVITATION_CONFIG.assetPaths.petImage).toMatch(/^\/assets\/images\//);
    expect(INVITATION_CONFIG.assetPaths.backgroundAudio).toMatch(/^\/assets\/audio\//);
    expect(INVITATION_CONFIG.telegramUrl).toBe("https://t.me/realferuzbek");
    expect(INVITATION_CONFIG.timeZone).toBe("Asia/Tashkent");
  });

  it("formats the planned time without interpreting it in the visitor's browser timezone", () => {
    expect(formatDateTimeInTashkent("2028-05-01", "17:30")).toEqual({
      dateLabel: "Monday, May 1, 2028",
      timeLabel: "5:30 PM",
      timeZoneLabel: "Tashkent time",
    });
  });

  it("rejects impossible control values before they can reach the server", () => {
    expect(isValidDateValue("2028-02-29")).toBe(true);
    expect(isValidDateValue("2027-02-29")).toBe(false);
    expect(isValidTimeValue("23:59")).toBe(true);
    expect(isValidTimeValue("24:00")).toBe(false);
    expect(isFutureTashkentDateTime("bad", "19:30")).toBe(false);
  });
});
