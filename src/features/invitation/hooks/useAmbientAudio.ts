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

    const removeFallback = () => {
      if (!fallbackAttached) return;
      document.removeEventListener("pointerdown", onFirstInteraction, true);
      document.removeEventListener("keydown", onFirstInteraction, true);
      fallbackAttached = false;
    };

    const beginPlayback = () => {
      if (disposed) return;
      // Catch rejection deliberately: autoplay can be blocked even when the
      // element is otherwise healthy. A later natural user action retries it.
      void audio.play().then(removeFallback).catch(attachFallback);
    };

    const onFirstInteraction = () => {
      beginPlayback();
    };

    const attachFallback = () => {
      if (disposed || fallbackAttached) return;
      fallbackAttached = true;
      document.addEventListener("pointerdown", onFirstInteraction, {
        capture: true,
        passive: true,
      });
      document.addEventListener("keydown", onFirstInteraction, true);
    };

    beginPlayback();

    return () => {
      disposed = true;
      removeFallback();
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, [src, volume]);
}
