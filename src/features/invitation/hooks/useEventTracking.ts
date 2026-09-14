"use client";

import { EVENT_NAMES } from "@/config/invitation";
import { useCallback, useEffect, useRef } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { InvitationEventPayload } from "../types";

export type InvitationEventName = (typeof EVENT_NAMES)[number];

const ANALYTICS_SESSION_KEY = "date-invitation:analytics-session";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  // This is a pseudonymous, client-only correlation ID—not an identity signal.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function getSessionId(): string {
  if (typeof window === "undefined") return "server-render";

  try {
    const existing = window.sessionStorage.getItem(ANALYTICS_SESSION_KEY);
    if (existing) return existing;
    const created = createId();
    window.sessionStorage.setItem(ANALYTICS_SESSION_KEY, created);
    return created;
  } catch {
    return createId();
  }
}

function isAllowedEvent(name: string): name is InvitationEventName {
  return (EVENT_NAMES as readonly string[]).includes(name);
}

export interface EventTracker {
  track: (name: InvitationEventName) => void;
  sessionId: string;
}

/**
 * Lightweight, allowlisted milestone tracking. It deliberately has no generic
 * properties argument, preventing selection data or device metadata from
 * quietly becoming analytics payloads.
 */
export function useEventTracking(): EventTracker {
  const sessionIdRef = useRef<string>("");
  const [sessionId] = useState(() => getSessionId());

  if (!sessionIdRef.current) sessionIdRef.current = getSessionId();

  const track = useCallback((name: InvitationEventName) => {
    if (!isAllowedEvent(name) || typeof window === "undefined") return;

    const payload: InvitationEventPayload = {
      eventId: createId(),
      sessionId: sessionIdRef.current,
      sessionId,
      name,
      occurredAt: new Date().toISOString(),
    };
    const body = JSON.stringify(payload);

    // Beacon is best for transition/unload-safe telemetry. The fetch fallback
    // covers browsers that do not implement it without exposing credentials.
    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      const accepted = navigator.sendBeacon(
        "/api/events",
        new Blob([body], { type: "application/json" }),
      );
      if (accepted) return;
    }

    void fetch("/api/events", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body,
    }).catch(() => {
      // Tracking must never make the invitation feel broken.
    });
  }, []);
  }, [sessionId]);

  return { track, sessionId: sessionIdRef.current };
  return { track, sessionId };
}

/** Call once per mounted experience; a view is a useful, non-invasive event. */
export function useInitialInvitationEvents(track: (name: InvitationEventName) => void): void {
  const didTrackRef = useRef(false);

  useEffect(() => {
    if (didTrackRef.current) return;
    didTrackRef.current = true;
    track("visit_started");
    track("screen_1_viewed");
  }, [track]);
}
