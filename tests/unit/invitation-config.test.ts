import { describe, expect, it } from "vitest";

import {
  EVENT_NAMES,
  FOOD_OPTIONS,
  LOCATION_OPTIONS,
  TIME_OPTIONS,
  INVITATION_CONFIG,
  assetUrl,
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
    expect(EVENT_NAMES).toContain("location_selected");
    expect(EVENT_NAMES).toHaveLength(16);
  });

  it("keeps personal assets and the destination in one safe configuration entry", () => {
    expect(INVITATION_CONFIG.assetPaths.petImage).toMatch(/^\/assets\/images\//);
    expect(INVITATION_CONFIG.assetPaths.backgroundAudio).toMatch(/^\/assets\/audio\//);
    expect(INVITATION_CONFIG.telegramUrl).toBe("https://t.me/realferuzbek");
    expect(INVITATION_CONFIG.timeZone).toBe("Asia/Tashkent");
  });

  it("encodes configured filenames safely without changing their path structure", () => {
    expect(assetUrl("/assets/images/a photo, with (heart).png")).toBe(
      "/assets/images/a%20photo%2C%20with%20(heart).png",
    );
  });

  it("formats the planned time without interpreting it in the visitor's browser timezone", () => {
    expect(formatDateTimeInTashkent("2028-05-01", "17:30")).toEqual({
      dateLabel: "Monday, May 1, 2028",
      timeLabel: "17:30",
      timeZoneLabel: "Tashkent time",
    });
  });

  it("rejects impossible control values before they can reach the server", () => {
    expect(isValidDateValue("2028-02-29")).toBe(true);
    expect(isValidDateValue("2027-02-29")).toBe(false);
    expect(TIME_OPTIONS).toHaveLength(23);
    expect(TIME_OPTIONS[0]).toBe("09:00");
    expect(TIME_OPTIONS.at(-1)).toBe("20:00");
    expect(isValidTimeValue("19:30")).toBe(true);
    expect(isValidTimeValue("19:15")).toBe(false);
    expect(isValidTimeValue("20:30")).toBe(false);
    expect(isValidTimeValue("24:00")).toBe(false);
    expect(isFutureTashkentDateTime("bad", "19:30")).toBe(false);
  });

  it("allowlists exactly the six requested meeting spots", () => {
    expect(LOCATION_OPTIONS).toEqual(["IB", "LRC", "Lyceum", "SHB", "ATB", "Sport Hall"]);
  });
});
