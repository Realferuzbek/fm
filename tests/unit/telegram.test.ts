import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatReservationMessage, sendTelegramMessage } from "@/lib/server/telegram";
import { PRIVATE_OPEN_MESSAGE } from "@/lib/server/notifications";

describe("Telegram formatter and bounded sending", () => {
  beforeEach(() => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token-not-real");
    vi.stubEnv("TELEGRAM_CHAT_ID", "1234");
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("uses the exact opened milestone and booking wording with selected values and timestamp", () => {
    expect(PRIVATE_OPEN_MESSAGE).toBe("👀 Your private invitation was opened.");
    const date = new Date("2026-09-15T10:00:00Z");
    const text = formatReservationMessage("2099-08-19", "19:30", "osh", "LRC", false, date);
    expect(text).toContain("💌 SHE SAID YES.");
    expect(text).toContain("🍚 Osh");
    expect(text).toContain("Time: 19:30");
    expect(text).toContain("Meeting spot: 📍 LRC");
    expect(text).not.toMatch(/\b(?:AM|PM)\b/);
    expect(text).toContain("Tashkent time");
    expect(text).toContain("Status: ✅ Date successfully arranged");
    expect(text).toContain(date.toISOString());
    const update = formatReservationMessage("2099-08-19", "20:00", "lavash", "Sport Hall", true);
    expect(update).toContain("Date plans updated.");
    expect(update).toContain("Meeting spot: 📍 Sport Hall");
  });

  it("sends plain text with a bounded request and captures the message ID", async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true, result: { message_id: 42 } }));
    vi.stubGlobal("fetch", fetch);
    expect(await sendTelegramMessage("hello")).toEqual({ status: "sent", messageId: "42" });
    const options = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(options[1].body as string)).toEqual({ chat_id: "1234", text: "hello", link_preview_options: { is_disabled: true } });
    expect(options[1].signal).toBeInstanceOf(AbortSignal);
  });

  it("marks a definitive rejection failed without storing arbitrary Telegram error text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false, error_code: 400, description: "secret-test-token-not-real" }, { status: 400 })));
    expect(await sendTelegramMessage("hello")).toEqual({ status: "failed", error: "Telegram rejected the request (400)." });
  });

  it.each(["network", "server", "malformed"])("keeps %s outcomes uncertain and redacts request errors", async (kind) => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (kind === "network") throw new Error("https://api.telegram.org/bottest-token-not-real/sendMessage");
      if (kind === "server") return Response.json({ ok: false, error_code: 500 }, { status: 500 });
      return new Response("not-json");
    }));
    const result = await sendTelegramMessage("hello");
    expect(result.status).toBe("unknown");
    expect(result.error).not.toContain("test-token-not-real");
  });

  it("records missing configuration as failed without making a network request", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await sendTelegramMessage("hello")).status).toBe("failed");
    expect(fetch).not.toHaveBeenCalled();
  });
});
