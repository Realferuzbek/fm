"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { INVITATION_CONFIG, type FoodId } from "@/config/invitation";
import { AmbientDecor } from "./components/AmbientDecor";
import { FinalStage } from "./components/FinalStage";
import { FoodStage } from "./components/FoodStage";
import { QuestionStage } from "./components/QuestionStage";
import { ScheduleStage } from "./components/ScheduleStage";
import { SurpriseStage } from "./components/SurpriseStage";
import { useAmbientAudio } from "./hooks/useAmbientAudio";
import { useEventTracking, useInitialInvitationEvents } from "./hooks/useEventTracking";
import {
  createInitialInvitationState,
  getTodayInTimeZone,
  invitationReducer,
  isScheduleValid,
  persistInvitationState,
  restoreInvitationState,
} from "./state";
import styles from "./InvitationExperience.module.css";

export function InvitationExperience() {
  const [state, dispatch] = useReducer(invitationReducer, undefined, createInitialInvitationState);
  const [isFoodTransitioning, setIsFoodTransitioning] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window !== "undefined") {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    return false;
  });
  const cardRef = useRef<HTMLDivElement>(null);

  const { track } = useEventTracking();
  useInitialInvitationEvents(track);
  useAmbientAudio({
    src: INVITATION_CONFIG.assetPaths.backgroundAudio,
    volume: INVITATION_CONFIG.audioVolume,
  });

  // Check prefers-reduced-motion
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const handleChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Restore state from sessionStorage on mount
  useEffect(() => {
    const saved = restoreInvitationState();
    if (saved) {
      dispatch({ type: "RESTORE", payload: saved });
    }
  }, []);

  // Persist state changes
  useEffect(() => {
    persistInvitationState(state);
  }, [state]);

  // Handle invite token from URL fragment (#invite=TOKEN) or query (?invite=TOKEN)
  useEffect(() => {
    if (typeof window === "undefined") return;

    let token: string | null = null;
    try {
      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      const hashParams = new URLSearchParams(hash);
      token = hashParams.get("invite");

      if (!token) {
        const searchParams = new URLSearchParams(window.location.search);
        token = searchParams.get("invite");
      }
    } catch {
      // URL parsing failed
    }

    if (token) {
      // Clean URL immediately
      try {
        window.history.replaceState(null, "", window.location.pathname);
      } catch {
        // History API fallback
      }

      void fetch("/api/invitation/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
        .then((res) => {
          if (res.ok) {
            dispatch({ type: "PRIVATE_SESSION_RESOLVED", isPrivateSession: true });
          }
        })
        .catch(() => {
          // Token resolution failed gracefully, remains in public mode
        });
    }
  }, []);

  // Auto-advance yes-reaction to surprise after short animation
  useEffect(() => {
    if (state.stage === "yes-reaction") {
      const timer = setTimeout(() => {
        dispatch({ type: "YES_REACTION_COMPLETE" });
        track("screen_2_viewed");
      }, 750);
      return () => clearTimeout(timer);
    }
  }, [state.stage, track]);

  // Stage change accessibility: focus stage heading
  useEffect(() => {
    if (!cardRef.current) return;
    const heading = cardRef.current.querySelector<HTMLElement>("[data-stage-heading]");
    if (heading) {
      heading.focus();
    }
  }, [state.stage]);

  // Handlers
  const handleYes = () => {
    track("yes_clicked");
    dispatch({ type: "YES_CLICKED" });
  };

  const handleNoAttempt = () => {
    track("no_button_attempted");
  };

  const handleOkay = () => {
    track("okay_clicked");
    dispatch({ type: "OKAY_CLICKED" });
    track("date_screen_viewed");
  };

  const handleDateChange = (date: string) => {
    dispatch({ type: "DATE_CHANGED", date });
    track("date_selected");
  };

  const handleTimeChange = (time: string) => {
    dispatch({ type: "TIME_CHANGED", time });
    track("time_selected");
  };

  const handleScheduleConfirm = () => {
    track("date_confirmed");
    dispatch({ type: "SCHEDULE_CONFIRMED" });
    track("food_screen_viewed");
  };

  const handleFoodSelect = async (foodId: FoodId) => {
    track("food_selected");
    dispatch({ type: "FOOD_SELECTED", foodId });
    setIsFoodTransitioning(true);

    const minDelay = new Promise((resolve) => setTimeout(resolve, 850));

    // Submit reservation silently if in private mode
    if (state.isPrivateSession) {
      dispatch({ type: "RESERVATION_SUBMITTING" });
      try {
        const response = await fetch("/api/reservation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: state.date,
            time: state.time,
            food: foodId,
          }),
        });

        if (response.ok) {
          dispatch({ type: "RESERVATION_CONFIRMED" });
        } else {
          dispatch({ type: "RESERVATION_FAILED" });
        }
      } catch {
        dispatch({ type: "RESERVATION_FAILED" });
      }
    }

    await minDelay;
    setIsFoodTransitioning(false);
    dispatch({ type: "FOOD_TRANSITION_COMPLETE" });
    track("final_screen_viewed");
  };

  return (
    <main className={styles.experience}>
      <AmbientDecor />
      <div ref={cardRef} className={styles.card}>
        <div className={styles.stageContainer}>
          {state.stage === "question" && (
            <QuestionStage
              imageSrc={INVITATION_CONFIG.assetPaths.petImage}
              imageAlt={INVITATION_CONFIG.petImageAlt}
              imageObjectPosition={INVITATION_CONFIG.petImageObjectPosition}
              reducedMotion={reducedMotion}
              onYes={handleYes}
              onNoAttempt={handleNoAttempt}
            />
          )}

          {state.stage === "yes-reaction" && (
            <SurpriseStage isReaction={true} onOkay={handleOkay} />
          )}

          {state.stage === "surprise" && (
            <SurpriseStage isReaction={false} onOkay={handleOkay} />
          )}

          {state.stage === "schedule" && (
            <ScheduleStage
              date={state.date}
              time={state.time}
              minDate={getTodayInTimeZone()}
              isValid={isScheduleValid(state.date, state.time)}
              onDateChange={handleDateChange}
              onTimeChange={handleTimeChange}
              onConfirm={handleScheduleConfirm}
            />
          )}

          {state.stage === "food" && (
            <FoodStage
              selectedFoodId={state.foodId}
              isTransitioning={isFoodTransitioning}
              onFoodSelect={handleFoodSelect}
            />
          )}

          {state.stage === "final" && (
            <FinalStage
              date={state.date}
              time={state.time}
              foodId={state.foodId}
              onTelegramClick={() => track("telegram_clicked")}
            />
          )}
        </div>
      </div>
    </main>
  );
}

