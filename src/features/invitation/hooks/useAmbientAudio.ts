"use client";

import { useEffect, useRef } from "react";

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
}: AmbientAudioOptions): void {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!src || typeof Audio === "undefined") return;

    const audio = new Audio(src);
    audioRef.current = audio;
    audio.loop = true;
    audio.preload = "metadata";
    audio.volume = Math.min(Math.max(volume, 0), 1);

    let disposed = false;
    let fallbackAttached = false;
    let started = false;
    let unsupported = false;
    const interactionEvents = ["pointerdown", "touchend", "click", "keydown"] as const;

    const removeFallback = () => {
      if (!fallbackAttached) return;
      for (const name of interactionEvents) {
        document.removeEventListener(name, onFirstInteraction, true);
      }
      fallbackAttached = false;
    };

    const beginPlayback = () => {
      if (disposed || started || unsupported) return;
      // Catch rejection deliberately: autoplay can be blocked even when the
      // element is otherwise healthy. A later natural user action retries it.
      void audio.play().then(() => {
        if (disposed) return;
        started = true;
        removeFallback();
      }).catch((error: unknown) => {
        if (disposed || started) return;
        if (error instanceof DOMException && error.name === "NotSupportedError") {
          unsupported = true;
          removeFallback();
        }
      });
    };

    const onFirstInteraction = (event: Event) => {
      if (event instanceof KeyboardEvent &&
        (event.repeat || ["Shift", "Control", "Alt", "Meta", "Escape"].includes(event.key))) return;
      // Call play synchronously inside the gesture: awaiting here would lose
      // user activation on some mobile browsers.
      beginPlayback();
    };

    const onMediaError = () => {
      // An unavailable/unsupported file cannot be repaired by another tap.
      unsupported = true;
      removeFallback();
    };

    // Listen before the autoplay promise settles so a fast first interaction
    // cannot disappear into the policy-rejection race. touchend/click cover
    // browsers that do not grant activation to touch pointerdown.
    fallbackAttached = true;
    for (const name of interactionEvents) {
      document.addEventListener(name, onFirstInteraction, { capture: true, passive: true });
    }
    audio.addEventListener("error", onMediaError);
    beginPlayback();

    return () => {
      disposed = true;
      removeFallback();
      audio.removeEventListener("error", onMediaError);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, [src, volume]);
}
