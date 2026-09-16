import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { useAmbientAudio } from "@/features/invitation/hooks/useAmbientAudio";

describe("ambient audio playback", () => {
  let media: HTMLAudioElement;
  let play: Mock<() => Promise<void>>;
  beforeEach(() => {
    media = document.createElement("audio");
    play = vi.fn<() => Promise<void>>().mockRejectedValue(new DOMException("Blocked", "NotAllowedError"));
    media.play = play;
    media.pause = vi.fn();
    media.load = vi.fn();
    vi.stubGlobal("Audio", function () { return media; });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
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

  it("cleans up playback and every fallback listener on unmount", async () => {
    const hook = renderHook(() => useAmbientAudio({ src: "/assets/audio/background.mp3" }));
    await flush();
    hook.unmount();
    for (const name of ["pointerdown", "click", "touchend", "keydown"]) document.dispatchEvent(new Event(name));
    expect(play).toHaveBeenCalledTimes(1);
    expect(media.pause).toHaveBeenCalledTimes(1);
    expect(media.getAttribute("src")).toBeNull();
  });
});
