"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReservationSnapshot, VisitorMode } from "../types";
import { fetchJsonWithTimeout } from "../network";

interface SessionState {
  mode: VisitorMode;
  inviteId: string | null;
  reservation: ReservationSnapshot | null;
  error: string | null;
}
export function useInvitationSession(entry: "public" | "private") {
  const [session, setSession] = useState<SessionState>({ mode: "resolving", inviteId: null, reservation: null, error: null });
  const tokenRef = useRef<string | null>(null);
  const retryRef = useRef<() => void>(() => {});
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const start = async () => {
      await Promise.resolve();
      if (disposed) return;
      const url = new URL(window.location.href);
      const token = new URLSearchParams(url.hash.slice(1)).get("invite") ?? url.searchParams.get("invite");
      if (token) {
        tokenRef.current = token;
        // No token in storage, analytics, or subsequent navigation.
        window.history.replaceState(window.history.state, "", "/invite");
      }
      const privateEntry = entry === "private" || Boolean(tokenRef.current) || window.location.pathname === "/invite";
      if (!privateEntry) {
        setSession({ mode: "public", inviteId: null, reservation: null, error: null });
        return;
      }
      setSession(value => ({ ...value, mode: "resolving", error: null }));
      try {
        const { response, data: result } = await fetchJsonWithTimeout<{ inviteId?: string; reservation: ReservationSnapshot | null }>(tokenRef.current ? "/api/invitation/resolve" : "/api/invitation/session", {
          method: tokenRef.current ? "POST" : "GET",
          ...(tokenRef.current ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: tokenRef.current }) } : {}),
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok || !result.inviteId) throw new Error("Invitation unavailable");
        if (!disposed) {
          tokenRef.current = null;
          setSession({ mode: "private", inviteId: result.inviteId, reservation: result.reservation, error: null });
        }
      } catch {
        if (!disposed) setSession({ mode: "error", inviteId: null, reservation: null, error: "This little invitation couldn't open. Try again, or reopen your original invitation link." });
      }
    };
    retryRef.current = () => { void start(); };
    void start();
    return () => { disposed = true; controller.abort(); };
  }, [entry]);
  const setReservation = useCallback((reservation: ReservationSnapshot) => setSession(value => ({ ...value, reservation })), []);
  const retry = useCallback(() => retryRef.current(), []);
  return { ...session, retry, setReservation };
}
