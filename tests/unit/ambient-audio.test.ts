import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { useAmbientAudio } from "@/features/invitation/hooks/useAmbientAudio";

describe("ambient audio playback", () => {
  let media: HTMLAudioElement;
  let play: Mock<() => Promise<void>>;
  let createAudio: Mock;
  beforeEach(() => {
    sessionStorage.clear();
    media = document.createElement("audio");
    play = vi.fn<() => Promise<void>>().mockRejectedValue(new DOMException("Blocked", "NotAllowedError"));
    media.play = play;
    media.pause = vi.fn();
    media.load = vi.fn();
    createAudio = vi.fn(function () { return media; });
    vi.stubGlobal("Audio", createAudio);
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  const flush = () => act(async () => { await Promise.resolve(); });

  it("attempts autoplay immediately and catches a gesture before that promise settles", async () => {
    play.mockImplementationOnce(() => new Promise(() => {})).mockResolvedValueOnce(undefined);
    renderHook(() => useAmbientAudio({ src: "/assets/audio/background.mp3" }));
    expect(play).toHaveBeenCalledTimes(1);
    act(() => document.dispatchEvent(new Event("pointerdown")));
    expect(play).toHaveBeenCalledTimes(2);
    await flush();
    act(() => document.dispatchEvent(new Event("click")));
    expect(play).toHaveBeenCalledTimes(2);
  });

  it.each(["click", "touchend", "keydown"])("retries silently on the first eligible %s", async (eventName) => {
    renderHook(() => useAmbientAudio({ src: "/assets/audio/background.mp3" }));
    await flush();
    play.mockResolvedValueOnce(undefined);
    act(() => document.dispatchEvent(eventName === "keydown" ? new KeyboardEvent("keydown", { key: "Enter" }) : new Event(eventName)));
    await flush();
    expect(play).toHaveBeenCalledTimes(2);
    expect(media.controls).toBe(false);
  });

  it("stops gesture retries when the media is unsupported", async () => {
    play.mockRejectedValue(new DOMException("Unsupported", "NotSupportedError"));
    renderHook(() => useAmbientAudio({ src: "/assets/audio/background.mp3" }));
    await flush();
    act(() => document.dispatchEvent(new Event("pointerdown")));
    await flush();
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("stops gesture retries after a missing-file media error", async () => {
    renderHook(() => useAmbientAudio({ src: "/assets/audio/missing.mp3" }));
    await flush();
    act(() => media.dispatchEvent(new Event("error")));
    act(() => document.dispatchEvent(new Event("pointerdown")));
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("does not treat modifier keys or key repeat as a playback gesture", async () => {
    renderHook(() => useAmbientAudio({ src: "/assets/audio/background.mp3" }));
    await flush();
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" })));
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", repeat: true })));
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("keeps one audio element across renders and resets before a new interaction", async () => {
    vi.useFakeTimers();
    play.mockResolvedValue(undefined);
    const hook = renderHook(() => useAmbientAudio({ src: "/assets/audio/background.mp3" }));
    await flush();
    media.currentTime = 37;
    hook.rerender();
    expect(createAudio).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);

    act(() => hook.result.current.resetForNavigation());
    expect(media.pause).toHaveBeenCalledTimes(1);
    expect(media.currentTime).toBe(0);
    act(() => document.dispatchEvent(new Event("click")));
    expect(play).toHaveBeenCalledTimes(1);
    act(() => vi.runAllTimers());

    for (const name of ["pagehide", "pageshow"]) {
      media.currentTime = 37;
      act(() => window.dispatchEvent(new PageTransitionEvent(name, { persisted: true })));
      expect(media.currentTime).toBe(0);
    }
    media.currentTime = 37;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(media.currentTime).toBe(0);
    expect(play).toHaveBeenCalledTimes(1);

    act(() => document.dispatchEvent(new Event("pointerdown")));
    await flush();
    expect(play).toHaveBeenCalledTimes(2);
    expect(media.currentTime).toBe(0);
    act(() => document.dispatchEvent(new Event("click")));
    expect(play).toHaveBeenCalledTimes(2);
    expect(createAudio).toHaveBeenCalledTimes(1);
  });

  it("waits for a new interaction after navigation remount and a blocked retry", async () => {
    play.mockResolvedValue(undefined);
    const first = renderHook(() => useAmbientAudio({ src: "/assets/audio/background.mp3" }));
    await flush();
    act(() => first.result.current.resetForNavigation());
    first.unmount();

    const returned = renderHook(() => useAmbientAudio({ src: "/assets/audio/background.mp3" }));
    await flush();
    expect(play).toHaveBeenCalledTimes(1);
    play.mockRejectedValueOnce(new DOMException("Blocked", "NotAllowedError"));
    act(() => document.dispatchEvent(new Event("pointerdown")));
    await flush();
    media.currentTime = 17;
    act(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    expect(media.currentTime).toBe(0);
    expect(play).toHaveBeenCalledTimes(2);
    act(() => document.dispatchEvent(new Event("touchend")));
    await flush();
    expect(play).toHaveBeenCalledTimes(3);
    returned.unmount();

    // A successful new gesture consumes the navigation reset marker.
    renderHook(() => useAmbientAudio({ src: "/assets/audio/background.mp3" }));
    await flush();
    expect(play).toHaveBeenCalledTimes(4);
  });

  it("does not let an outstanding play promise resume after navigation", async () => {
    let finishPlayback: (() => void) | undefined;
    play.mockImplementationOnce(() => new Promise(resolve => { finishPlayback = resolve; }));
    const hook = renderHook(() => useAmbientAudio({ src: "/assets/audio/background.mp3" }));
    act(() => hook.result.current.resetForNavigation());
    media.currentTime = 37;
    await act(async () => { finishPlayback?.(); });
    expect(media.currentTime).toBe(0);
    expect(media.pause).toHaveBeenCalledTimes(2);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("blocks browser media resume while waiting after Telegram", async () => {
    play.mockResolvedValue(undefined);
    const hook = renderHook(() => useAmbientAudio({ src: "/assets/audio/background.mp3" }));
    await flush();
    act(() => hook.result.current.resetForNavigation());
    media.currentTime = 37;
    act(() => media.dispatchEvent(new Event("play")));
    expect(media.currentTime).toBe(0);
    expect(media.pause).toHaveBeenCalledTimes(2);
  });

  it("cleans up playback and every fallback listener on unmount", async () => {
    const hook = renderHook(() => useAmbientAudio({ src: "/assets/audio/background.mp3" }));
    await flush();
    hook.unmount();
    for (const name of ["pointerdown", "click", "touchend", "keydown"]) document.dispatchEvent(new Event(name));
    expect(play).toHaveBeenCalledTimes(1);
    expect(media.pause).toHaveBeenCalledTimes(1);
    expect(media.getAttribute("src")).toBeNull();
    const pauses = vi.mocked(media.pause).mock.calls.length;
    for (const name of ["pagehide", "pageshow"]) window.dispatchEvent(new Event(name));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(media.pause).toHaveBeenCalledTimes(pauses);
  });
});
