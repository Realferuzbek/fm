"use client";

import { useCallback, useEffect, useRef } from "react";
import { EVENT_NAMES, isUuidValue, type AnalyticsEventName } from "@/config/invitation";
import type { InvitationEventPayload, VisitorMode } from "../types";

export function useEventTracking(mode: VisitorMode, inviteId: string | null) {
  const queue = useRef<InvitationEventPayload[]>([]);
  const scope = mode === "private" && inviteId ? "private:" + inviteId : "public";
  const session = useRef({ scope: "", id: "" });
  const started = useRef(new Set<string>());
  const ready = mode === "public" || mode === "private";
  const getSessionId = useCallback(() => {
    if (session.current.scope !== scope) {
      let id: string | null = null;
      try { id = sessionStorage.getItem("invitation:visit:" + scope); } catch { /* optional */ }
      if (!isUuidValue(id)) id = crypto.randomUUID();
      try { sessionStorage.setItem("invitation:visit:" + scope, id); } catch { /* optional */ }
      session.current = { scope, id };
    }
    return session.current.id;
  }, [scope]);
  const flush = useCallback((leaving = false) => {
    if (!ready || !queue.current.length) return;
    const events = queue.current.splice(0, 20);
    const body = JSON.stringify({ mode, ...(mode === "private" ? { inviteId } : {}), sessionId: getSessionId(), events });
    if (leaving && navigator.sendBeacon?.("/api/events", new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true })
      .then(response => { if (!response.ok && response.status >= 500) queue.current.unshift(...events); })
      .catch(() => { queue.current.unshift(...events); })
      .finally(() => { queue.current = queue.current.slice(-60); });
  }, [mode, inviteId, ready, getSessionId]);
  const track = useCallback((name: AnalyticsEventName) => {
    if (!ready || !EVENT_NAMES.includes(name)) return;
    queue.current.push({ eventId: crypto.randomUUID(), name, occurredAt: new Date().toISOString() });
    if (name === "telegram_clicked") flush(true);
    else if (name === "visit_started" || queue.current.length >= 12) flush();
  }, [ready, flush]);
  useEffect(() => {
    if (!ready) return;
    if (!started.current.has(scope)) {
      started.current.add(scope);
      track("visit_started");
    }
    const timer = setInterval(flush, 2000);
    const hide = () => { if (document.visibilityState === "hidden") flush(true); };
    const leave = () => flush(true);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", leave); flush(true); };
  }, [scope, ready, flush, track]);
  return { track };
}
