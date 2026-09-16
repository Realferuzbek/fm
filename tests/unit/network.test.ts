import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJsonWithTimeout } from "@/features/invitation/network";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("bounded invitation requests", () => {
  it("aborts a stalled JSON body even after headers have arrived", async () => {
    vi.useFakeTimers();
    const received = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => ({
      json: () => new Promise((_resolve, reject) => {
        received();
        options.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      }),
    })));
    const request = fetchJsonWithTimeout("/api/reservation", {}, 100);
    const rejected = expect(request).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(100);
    expect(received).toHaveBeenCalledOnce();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns the parsed data and cleans up the deadline on success", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ inviteId: "saved" }))));
    const result = await fetchJsonWithTimeout<{ inviteId: string }>("/api/invitation/session");
    expect(result.response.status).toBe(200);
    expect(result.data.inviteId).toBe("saved");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("forwards component cancellation while reading the body", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => ({
      json: () => new Promise((_resolve, reject) => options.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })),
    })));
    const request = fetchJsonWithTimeout("/api/invitation/session", { signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
});
