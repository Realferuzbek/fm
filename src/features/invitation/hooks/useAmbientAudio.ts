"use client";

import { useCallback, useEffect, useRef } from "react";

const RETURN_STORAGE_KEY = "invitation:audio:await-interaction";

export interface AmbientAudioOptions {
  src: string;
  volume?: number;
}

/**
 * Makes a best-effort, policy-compliant attempt to start a hidden ambient track.
 * Browsers do not expose reliable OS mute information, so this hook only reacts
 * to `HTMLMediaElement.play()` success/failure and never makes false claims.
 */
export function useAmbientAudio({
  src,
  volume = 0.32,
}: AmbientAudioOptions): { resetForNavigation: () => void } {
  const resetRef = useRef<(() => void) | null>(null);
  const resetForNavigation = useCallback(() => resetRef.current?.(), []);

  useEffect(() => {
    if (!src || typeof Audio === "undefined") return;

    const audio = new Audio(src);
    audio.loop = true;
    audio.preload = "metadata";
    audio.volume = Math.min(Math.max(volume, 0), 1);

    let disposed = false;
    let fallbackAttached = false;
    let started = false;
    let unsupported = false;
    let generation = 0;
    let awaitingInteraction = false;
    let resetGesturePending = false;
    let resetGestureTimer: ReturnType<typeof setTimeout> | undefined;
    try { awaitingInteraction = sessionStorage.getItem(RETURN_STORAGE_KEY) === "1"; } catch { /* Storage is optional. */ }
    let restartRequired = awaitingInteraction;
    const interactionEvents = ["pointerdown", "touchend", "click", "keydown"] as const;

    const pauseAndRewind = () => {
      audio.pause();
      // Some engines cannot seek before metadata is available; the metadata
      // listener retries while waiting for the next interaction.
      try { audio.currentTime = 0; } catch { /* Retry when media is ready. */ }
    };

    const attachFallback = () => {
      if (fallbackAttached || unsupported || disposed) return;
      for (const name of interactionEvents) {
        document.addEventListener(name, onFirstInteraction, { capture: true, passive: true });
      }
      fallbackAttached = true;
    };

    const removeFallback = () => {
      if (!fallbackAttached) return;
      for (const name of interactionEvents) {
        document.removeEventListener(name, onFirstInteraction, true);
      }
      fallbackAttached = false;
    };

    const beginPlayback = (fromInteraction = false) => {
      if (disposed || started || unsupported) return;
      if (restartRequired) {
        if (!fromInteraction) return;
        pauseAndRewind();
        awaitingInteraction = false;
      }
      const attemptGeneration = generation;
      // Catch rejection deliberately: autoplay can be blocked even when the
      // element is otherwise healthy. A later natural user action retries it.
      void audio.play().then(() => {
        if (disposed || attemptGeneration !== generation) {
          // A play() promise may resolve after Telegram navigation has paused
          // the element. Never let that stale attempt restart the old track.
          if (disposed || awaitingInteraction) pauseAndRewind();
          return;
        }
        started = true;
        awaitingInteraction = false;
        restartRequired = false;
        try { sessionStorage.removeItem(RETURN_STORAGE_KEY); } catch { /* Storage is optional. */ }
        removeFallback();
      }).catch((error: unknown) => {
        if (disposed || started || attemptGeneration !== generation) return;
        if (restartRequired) awaitingInteraction = true;
        if (error instanceof DOMException && error.name === "NotSupportedError") {
          unsupported = true;
          removeFallback();
        }
      });
    };

    const onFirstInteraction = (event: Event) => {
      if (resetGesturePending || document.visibilityState === "hidden") return;
      if (event instanceof KeyboardEvent &&
        (event.repeat || ["Shift", "Control", "Alt", "Meta", "Escape"].includes(event.key))) return;
      // Call play synchronously inside the gesture: awaiting here would lose
      // user activation on some mobile browsers.
      beginPlayback(true);
    };

    const onMediaError = () => {
      // An unavailable/unsupported file cannot be repaired by another tap.
      unsupported = true;
      removeFallback();
    };

    const keepReset = () => {
      if (awaitingInteraction) pauseAndRewind();
    };
    const reset = () => {
      generation++;
      started = false;
      awaitingInteraction = true;
      restartRequired = true;
      // Ignore the activation that is currently opening Telegram, including
      // any remaining events synchronously dispatched by that activation.
      resetGesturePending = true;
      clearTimeout(resetGestureTimer);
      resetGestureTimer = setTimeout(() => { resetGesturePending = false; }, 0);
      try { sessionStorage.setItem(RETURN_STORAGE_KEY, "1"); } catch { /* The in-memory reset still works. */ }
      pauseAndRewind();
      attachFallback();
    };
    resetRef.current = reset;

    // Listen before the autoplay promise settles so a fast first interaction
    // cannot disappear into the policy-rejection race. touchend/click cover
    // browsers that do not grant activation to touch pointerdown.
    attachFallback();
    audio.addEventListener("error", onMediaError);
    audio.addEventListener("play", keepReset);
    audio.addEventListener("loadedmetadata", keepReset);
    document.addEventListener("visibilitychange", keepReset);
    window.addEventListener("pagehide", keepReset);
    window.addEventListener("pageshow", keepReset);
    if (awaitingInteraction) pauseAndRewind();
    else beginPlayback();

    return () => {
      disposed = true;
      clearTimeout(resetGestureTimer);
      removeFallback();
      audio.removeEventListener("error", onMediaError);
      audio.removeEventListener("play", keepReset);
      audio.removeEventListener("loadedmetadata", keepReset);
      document.removeEventListener("visibilitychange", keepReset);
      window.removeEventListener("pagehide", keepReset);
      window.removeEventListener("pageshow", keepReset);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      if (resetRef.current === reset) resetRef.current = null;
    };
  }, [src, volume]);

  return { resetForNavigation };
}
