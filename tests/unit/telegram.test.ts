import { describe, expect, it } from "vitest";
import { formatReservationMessage } from "@/lib/server/telegram";

describe("telegram formatter", () => {
  it("formats initial reservation messages correctly", () => {
    const msg = formatReservationMessage("2099-08-19", "19:30", "osh", false);
    expect(msg).toContain("New Reservation!");
    expect(msg).toContain("Osh");
    expect(msg).toContain("🍚");
    expect(msg).toContain("Tashkent time");
  });

  it("formats updated reservation messages with an update banner", () => {
    const msg = formatReservationMessage("2099-08-20", "20:00", "lavash", true);
    expect(msg).toContain("Reservation Updated!");
    expect(msg).toContain("Lavash");
    expect(msg).toContain("🌯");
  });
});

