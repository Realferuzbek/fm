import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEventTracking } from "@/features/invitation/hooks/useEventTracking";
import type { VisitorMode } from "@/features/invitation/types";

describe("milestone tracking", () => {
  const fetchMock = vi.fn();
  const firstInviteId = "b9470b74-8547-476f-b1da-7a019b5e81f9";
  const secondInviteId = "e1b48d54-8962-4d8d-bcea-71737fae5509";
  beforeEach(() => {
    sessionStorage.clear();
    fetchMock.mockReset().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    if (!navigator.sendBeacon) Object.defineProperty(navigator, "sendBeacon", { configurable: true, writable: true, value: () => false });
    vi.spyOn(navigator, "sendBeacon").mockReturnValue(false);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("waits for verified mode and emits opened tracking only once per mount", async () => {
    const { rerender, unmount } = renderHook(({ mode }: { mode: VisitorMode }) => useEventTracking(mode, mode === "private" ? firstInviteId : null), { initialProps: { mode: "resolving" as VisitorMode } });
    expect(fetchMock).not.toHaveBeenCalled();
    rerender({ mode: "private" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.mode).toBe("private");
    expect(body.inviteId).toBe(firstInviteId);
    expect(body.events.map((event: { name: string }) => event.name)).toEqual(["visit_started"]);
    rerender({ mode: "private" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("reuses the private tab-session key after a remount for server deduplication", async () => {
    const first = renderHook(() => useEventTracking("private", firstInviteId));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const firstId = JSON.parse(fetchMock.mock.calls[0][1].body).sessionId;
    first.unmount();
    const second = renderHook(() => useEventTracking("private", firstInviteId));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).sessionId).toBe(firstId);
    second.unmount();
  });

  it("binds each private batch and tab-session key to the resolved invite", async () => {
    const hook = renderHook(({ inviteId }: { inviteId: string }) => useEventTracking("private", inviteId), {
      initialProps: { inviteId: firstInviteId },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    hook.rerender({ inviteId: secondInviteId });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const first = JSON.parse(fetchMock.mock.calls[0][1].body);
    const second = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(first).toMatchObject({ mode: "private", inviteId: firstInviteId });
    expect(second).toMatchObject({ mode: "private", inviteId: secondInviteId });
    expect(second.sessionId).not.toBe(first.sessionId);
    expect(sessionStorage.getItem("invitation:visit:private:" + firstInviteId)).toBe(first.sessionId);
    expect(sessionStorage.getItem("invitation:visit:private:" + secondInviteId)).toBe(second.sessionId);
    hook.unmount();
  });

  it("keeps demo tracking public and flushes the CTA without booking values", async () => {
    const hook = renderHook(() => useEventTracking("public", "old-private-cookie-context"));
    act(() => hook.result.current.track("telegram_clicked"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.mode).toBe("public");
    expect(body).not.toHaveProperty("inviteId");
    expect(Object.keys(body.events[0]).sort()).toEqual(["eventId", "name", "occurredAt"]);
    hook.unmount();
  });
});
