"use client";

import Link from "next/link";
import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { assetUrl, FOOD_OPTIONS, LOCATION_OPTIONS, INVITATION_CONFIG, formatDateTimeInTashkent, isUuidValue, isValidDateValue, isValidTimeValue, type AnalyticsEventName, type FoodId, type LocationId } from "@/config/invitation";
import { AmbientDecor } from "./components/AmbientDecor";
import { FinalStage } from "./components/FinalStage";
import { FoodStage } from "./components/FoodStage";
import { LocationStage } from "./components/LocationStage";
import { QuestionStage } from "./components/QuestionStage";
import { ScheduleStage } from "./components/ScheduleStage";
import { SurpriseStage } from "./components/SurpriseStage";
import { useAmbientAudio } from "./hooks/useAmbientAudio";
import { useEventTracking } from "./hooks/useEventTracking";
import { useInvitationSession } from "./hooks/useInvitationSession";
import { createInitialInvitationState, getTodayInTimeZone, invitationReducer, isScheduleValid, persistInvitationState, restoreInvitationState } from "./state";
import type { InvitationStage, ReservationSnapshot } from "./types";
import { fetchJsonWithTimeout } from "./network";
import styles from "./InvitationExperience.module.css";

const media = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (callback: () => void) => {
  const query = window.matchMedia(media);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};
const STAGE_EVENTS: Partial<Record<InvitationStage, AnalyticsEventName>> = {
  question: "screen_1_viewed", surprise: "screen_2_viewed", schedule: "date_screen_viewed", food: "food_screen_viewed", location: "location_screen_viewed", final: "final_screen_viewed",
};
const STAGE_NUMBER: Record<InvitationStage, number> = { question: 1, "yes-reaction": 2, surprise: 2, schedule: 3, food: 4, location: 5, final: 6 };
type BookingPhase = "idle" | "saving" | "review" | "error";
interface PendingRequest { inviteId: string; requestId: string; expectedVersion: number; date: string; time: string; food: FoodId; location: LocationId }
type BookingSelection = Pick<PendingRequest, "date" | "time" | "food" | "location">;
const sameSelection = (value: BookingSelection, other: Omit<BookingSelection, "location"> & { location: LocationId | null }) =>
  value.date === other.date && value.time === other.time && value.food === other.food && value.location === other.location;

export function InvitationExperience({ entry = "public" }: { entry?: "public" | "private" }) {
  const session = useInvitationSession(entry);
  const scope = session.mode === "private" ? "private:" + session.inviteId : "public";
  const ready = session.mode === "private" || session.mode === "public";
  const [state, dispatch] = useReducer(invitationReducer, undefined, createInitialInvitationState);
  const [hydratedScope, setHydratedScope] = useState<string | null>(null);
  const [phase, setPhase] = useState<BookingPhase>("idle");
  const [error, setError] = useState("");
  const [contentHeight, setContentHeight] = useState<number>();
  const [, tick] = useReducer(value => value + 1, 0);
  const contentRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const pending = useRef<PendingRequest | null>(null);
  const viewed = useRef("");
  const returningFromTelegram = useRef(false);
  const reducedMotion = useSyncExternalStore(subscribeMotion, () => window.matchMedia(media).matches, () => false);
  const { track } = useEventTracking(session.mode, session.inviteId);
  const { resetForNavigation } = useAmbientAudio({ src: assetUrl(INVITATION_CONFIG.assetPaths.backgroundAudio), volume: INVITATION_CONFIG.audioVolume });
  const requestStorageKey = "invitation:pending:" + scope;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!ready || hydratedScope === scope) return;
    let disposed = false;
    void Promise.resolve().then(() => {
      if (disposed) return;
      const draft = restoreInvitationState(scope);
      if (draft) dispatch({ type: "RESTORE", payload: draft });
      if (session.mode === "private") {
        try {
          const saved = JSON.parse(sessionStorage.getItem(requestStorageKey) ?? "null") as PendingRequest | null;
          if (saved && saved.inviteId === session.inviteId && isUuidValue(saved.requestId) &&
            Number.isInteger(saved.expectedVersion) && saved.expectedVersion >= 0 && isValidDateValue(saved.date) && isValidTimeValue(saved.time) &&
            FOOD_OPTIONS.some(food => food.id === saved.food) && LOCATION_OPTIONS.includes(saved.location)) {
            if (session.reservation && sameSelection(saved, session.reservation)) {
              sessionStorage.removeItem(requestStorageKey);
              dispatch({ type: "RESET" });
            } else {
              pending.current = saved;
              dispatch({ type: "RECOVER_PENDING", date: saved.date, time: saved.time, foodId: saved.food, location: saved.location });
              setPhase("error");
              setError("Your choices are safe here. Let's check that our plan saved.");
            }
          } else if (saved !== null) sessionStorage.removeItem(requestStorageKey);
        } catch { /* An unavailable or invalid draft does not establish booking truth. */ }
      }
      setHydratedScope(scope);
    });
    return () => { disposed = true; };
  }, [ready, scope, hydratedScope, session.mode, session.inviteId, session.reservation, requestStorageKey]);
  useEffect(() => {
    if (ready && hydratedScope === scope) persistInvitationState(state, scope);
  }, [state, scope, ready, hydratedScope]);
  useEffect(() => {
    if (!ready || hydratedScope !== scope) return;
    const key = scope + ":" + state.stage;
    if (viewed.current !== key) {
      viewed.current = key;
      const event = STAGE_EVENTS[state.stage];
      if (event) track(event);
    }
    contentRef.current?.querySelector<HTMLElement>("[data-stage-heading]")?.focus({ preventScroll: true });
  }, [state.stage, scope, ready, hydratedScope, track]);
  useEffect(() => {
    if (state.stage !== "yes-reaction") return;
    const timer = setTimeout(() => dispatch({ type: "YES_REACTION_COMPLETE" }), reducedMotion ? 80 : INVITATION_CONFIG.motion.reactionMs);
    return () => clearTimeout(timer);
  }, [state.stage, reducedMotion]);
  useEffect(() => {
    if (state.stage !== "schedule") return;
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, [state.stage]);
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(entries => setContentHeight(entries[0].borderBoxSize?.[0]?.blockSize ?? content.getBoundingClientRect().height));
    observer.observe(content);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (phase === "review") contentRef.current?.querySelector<HTMLElement>("[data-review-heading]")?.focus({ preventScroll: true });
  }, [phase]);
  useEffect(() => {
    const restart = () => {
      if (state.stage === "final" && returningFromTelegram.current) {
        returningFromTelegram.current = false;
        dispatch({ type: "RESET" });
        setPhase("idle");
      }
    };
    const onVisible = () => { if (document.visibilityState === "visible") restart(); };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted && state.stage === "final") dispatch({ type: "RESET" });
      restart();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", restart);
    return () => { document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("pageshow", onPageShow); window.removeEventListener("focus", restart); };
  }, [state.stage]);

  const clearPending = () => {
    pending.current = null;
    try { sessionStorage.removeItem(requestStorageKey); } catch { /* optional */ }
  };
  const reveal = (saved?: ReservationSnapshot) => {
    if (!mounted.current) return;
    clearPending();
    setPhase("idle");
    setError("");
    if (saved) { session.setReservation(saved); dispatch({ type: "SHOW_SAVED", reservation: saved }); }
    else dispatch({ type: "LOCATION_TRANSITION_COMPLETE" });
  };
  const delay = () => new Promise(resolve => setTimeout(resolve, reducedMotion ? 40 : INVITATION_CONFIG.motion.foodSelectionMs));

  const saveReservation = async (location: LocationId) => {
    if (busy.current || !state.foodId || session.mode !== "private") return;
    const selection = { date: state.date, time: state.time, food: state.foodId, location };
    // A prior save may have succeeded before its response was lost. The server
    // must reconcile that request even if the selected time has since passed.
    if (!isScheduleValid(state.date, state.time) && !(pending.current && sameSelection(pending.current, selection))) {
      setPhase("error"); setError("Our time has slipped into the past. Pick a new day or time ♡"); return;
    }
    busy.current = true;
    setPhase("saving");
    setError("");
    if (!pending.current || !sameSelection(pending.current, selection)) {
      pending.current = { ...selection, inviteId: session.inviteId!, requestId: crypto.randomUUID(), expectedVersion: session.reservation?.version ?? 0 };
    }
    try { sessionStorage.setItem(requestStorageKey, JSON.stringify(pending.current)); } catch { /* retry remains stable in memory */ }
    try {
      const { response, data: result } = await fetchJsonWithTimeout<{ code?: string; reservation?: ReservationSnapshot }>("/api/reservation", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pending.current),
      }, 15_000);
      if (!mounted.current) return;
      if (response.status === 409 && result.code === "invitation_session_changed") {
        setError("This tab's private invitation changed. Reopen its original invitation link before saving our plan.");
        setPhase("error");
        return;
      }
      if (response.status === 409 && result.reservation) {
        session.setReservation(result.reservation);
        clearPending();
        setError("Our saved plan changed in another tab. Review these choices before saving.");
        setPhase("review");
        return;
      }
      if (!response.ok || !result.reservation) throw new Error("Could not save");
      reveal(result.reservation);
    } catch {
      if (mounted.current) {
        setPhase("error");
        setError("Our plan didn't quite save. Your choices are still here. Let's try again ♡");
      }
    } finally { busy.current = false; }
  };

  const reconcileReservation = async (selection: BookingSelection) => {
    if (busy.current || !session.inviteId) return;
    busy.current = true;
    setPhase("saving");
    setError("");
    try {
      const query = new URLSearchParams({ inviteId: session.inviteId });
      const { response, data: result } = await fetchJsonWithTimeout<{ code?: string; reservation?: ReservationSnapshot | null }>(`/api/reservation?${query}`, {
        cache: "no-store",
      });
      if (!mounted.current) return;
      if (response.status === 409 && result.code === "invitation_session_changed") {
        setError("This tab's private invitation changed. Reopen its original invitation link before continuing.");
        setPhase("error");
        return;
      }
      if (!response.ok || !result.reservation) throw new Error("Could not check saved plan");
      session.setReservation(result.reservation);
      if (sameSelection(selection, result.reservation)) reveal(result.reservation);
      else {
        setError("Our saved plan changed in another tab. Review these choices before saving.");
        setPhase("review");
      }
    } catch {
      if (mounted.current) {
        setError("I couldn't check our saved plan just yet. Your choices are still here. Let's try again ♡");
        setPhase("error");
      }
    } finally { busy.current = false; }
  };

  const selectFood = async (food: FoodId) => {
    if (busy.current || phase === "saving" || phase === "review") return;
    busy.current = true;
    dispatch({ type: "FOOD_SELECTED", foodId: food });
    track("food_selected");
    setPhase("saving");
    setError("");
    await delay();
    busy.current = false;
    if (!mounted.current) return;
    setPhase("idle");
    dispatch({ type: "FOOD_TRANSITION_COMPLETE" });
  };
  const selectLocation = async (location: LocationId) => {
    if (busy.current || phase === "saving" || phase === "review" || !state.foodId) return;
    busy.current = true;
    dispatch({ type: "LOCATION_SELECTED", location });
    track("location_selected");
    setPhase("saving");
    setError("");
    await new Promise(resolve => setTimeout(resolve, reducedMotion ? 40 : INVITATION_CONFIG.motion.locationSelectionMs));
    busy.current = false;
    if (!mounted.current) return;
    if (session.mode === "public") { reveal(); return; }
    const selection = { date: state.date, time: state.time, food: state.foodId, location };
    if (session.reservation) {
      if (sameSelection(selection, session.reservation)) await reconcileReservation(selection);
      else setPhase("review");
      return;
    }
    await saveReservation(location);
  };
  const okay = () => {
    track("okay_clicked");
    dispatch({ type: "OKAY_CLICKED" });
    if (session.reservation && isScheduleValid(session.reservation.date, session.reservation.time)) {
      dispatch({ type: "DATE_CHANGED", date: session.reservation.date });
      dispatch({ type: "TIME_CHANGED", time: session.reservation.time });
    }
  };
  const replay = () => { setPhase("idle"); setError(""); dispatch({ type: "RESET" }); };
  const proposed = formatDateTimeInTashkent(state.date, state.time);
  const selectedFood = FOOD_OPTIONS.find(food => food.id === state.foodId);
  const oldPlan = session.reservation && formatDateTimeInTashkent(session.reservation.date, session.reservation.time);

  return <main className={styles.experience}>
    <AmbientDecor />
    <div className={styles.masthead} aria-hidden="true"><span>a little invitation</span><i>♡</i></div>
    <div className={styles.card} data-testid="story-card">
      <div className={styles.cardHeader} aria-hidden="true"><span>a tiny story</span><svg viewBox="0 0 44 20" fill="none"><path d="M1 10h12m18 0h12M22 16s-8-4-8-9c0-5 6-6 8-2 2-4 8-3 8 2 0 5-8 9-8 9Z"/></svg><span>just for you</span></div>
      <div className={styles.stageViewport} style={contentHeight ? { height: contentHeight } : undefined}>
        <div ref={contentRef} className={styles.stageContent}>
          {session.mode === "error" ? <section className={styles.errorStage}>
            <h1 tabIndex={-1} data-stage-heading>A little pause ♡</h1><p>{session.error}</p>
            <button className={styles.confirmButton} onClick={session.retry}>Try again ♡</button><Link href="/">Explore the demo</Link>
          </section> : <>
            {state.stage === "question" && <QuestionStage reducedMotion={reducedMotion} disabled={!ready || hydratedScope !== scope}
              onYes={() => { track("yes_clicked"); dispatch({ type: "YES_CLICKED" }); }} onNoAttempt={() => track("no_button_attempted")} />}
            {(state.stage === "yes-reaction" || state.stage === "surprise") && <SurpriseStage isReaction={state.stage === "yes-reaction"} onOkay={okay} />}
            {state.stage === "schedule" && <ScheduleStage date={state.date} time={state.time} minDate={getTodayInTimeZone()}
              isValid={isScheduleValid(state.date, state.time)}
              onDateChange={date => { dispatch({ type: "DATE_CHANGED", date }); if (date) track("date_selected"); }}
              onTimeChange={time => { dispatch({ type: "TIME_CHANGED", time }); if (time) track("time_selected"); }}
              onConfirm={() => { if (isScheduleValid(state.date, state.time)) { track("date_confirmed"); setPhase("idle"); dispatch({ type: "SCHEDULE_CONFIRMED" }); } }} />}
            {state.stage === "food" && <FoodStage selectedFoodId={state.foodId} isTransitioning={phase === "saving"} onFoodSelect={food => { void selectFood(food); }} />}
            {state.stage === "location" && phase !== "review" && <LocationStage selectedLocation={state.location} isTransitioning={phase === "saving"} onLocationSelect={location => { void selectLocation(location); }} />}
            {state.stage === "location" && phase === "review" && <section className={styles.review} aria-labelledby="review-heading">
              <p className={styles.eyebrow}>a little change of plans</p>
              <h1 id="review-heading" tabIndex={-1} data-review-heading>Save this new plan? ♡</h1>
              <p>{proposed.dateLabel}<br />{proposed.timeLabel} · {selectedFood?.emoji} {selectedFood?.label} · 📍 {state.location}</p>
              {oldPlan && <p>Our current plan: {oldPlan.dateLabel}, {oldPlan.timeLabel}, {FOOD_OPTIONS.find(food => food.id === session.reservation?.food)?.label}{session.reservation?.location ? ` · 📍 ${session.reservation.location}` : ""}.</p>}
              {error && <p role="status">{error}</p>}
              <button className={styles.confirmButton} onClick={() => { if (state.location) void saveReservation(state.location); }}>Save these changes ♡</button>
              <button className={styles.secondaryButton} onClick={() => { if (session.reservation) reveal(session.reservation); }}>Keep our original plan</button>
              <button className={styles.replayButton} onClick={() => { setPhase("idle"); dispatch({ type: "EDIT_SCHEDULE" }); }}>Let me choose again</button>
            </section>}
            {state.stage === "location" && phase === "saving" && session.mode === "private" && <p className={styles.savingStatus} role="status">Saving our little plan…</p>}
            {state.stage === "location" && phase === "error" && <div className={styles.errorPanel} role="alert">
              <p>{error}</p><button className={styles.confirmButton} onClick={() => { if (state.location) void saveReservation(state.location); }}>Try saving again ♡</button>
              <button className={styles.replayButton} onClick={() => { setPhase("idle"); dispatch({ type: "EDIT_SCHEDULE" }); }}>Choose another day or time</button>
            </div>}
            {state.stage === "final" && <FinalStage date={state.date} time={state.time} foodId={state.foodId} location={state.location} onReplay={replay}
              onTelegramClick={() => { resetForNavigation(); returningFromTelegram.current = true; track("telegram_clicked"); }} />}
          </>}
        </div>
      </div>
      <div className={styles.progress} role="progressbar" aria-label="Invitation progress" aria-valuemin={1} aria-valuemax={6} aria-valuenow={STAGE_NUMBER[state.stage]} aria-valuetext={`Step ${STAGE_NUMBER[state.stage]} of 6`}>
        {[1, 2, 3, 4, 5, 6].map(number => <span key={number} className={number === STAGE_NUMBER[state.stage] ? styles.progressActive : undefined} aria-hidden="true" />)}
      </div>
    </div>
  </main>;
}
