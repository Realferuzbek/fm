"use client";

import { useId } from "react";
import styles from "../InvitationExperience.module.css";

interface ScheduleStageProps {
  date: string;
  time: string;
  minDate: string;
  isValid: boolean;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  onConfirm: () => void;
}

/**
 * Stage 3: Date and time selection.
 * Native date and time inputs wrapped in accessible, touch-friendly containers.
 */
export function ScheduleStage({
  date,
  time,
  minDate,
  isValid,
  onDateChange,
  onTimeChange,
  onConfirm,
}: ScheduleStageProps) {
  const dateId = useId();
  const timeId = useId();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid) {
      onConfirm();
    }
  };

  return (
    <form className={styles.stage} onSubmit={handleSubmit}>
      <p className={styles.eyebrow}>step 1 of 2: timing</p>
      <h2 className={styles.scheduleHeading} tabIndex={-1} data-stage-heading>
        When are you free? 🗓️
      </h2>
      <p className={styles.scheduleSubtext}>
        Pick a date and time that works best for you (Tashkent time).
      </p>

      <div className={styles.inputGroup}>
        <div className={styles.inputWrapper}>
          <label htmlFor={dateId} className={styles.inputLabel}>
            Date
          </label>
          <input
            id={dateId}
            type="date"
            className={styles.dateInput}
            value={date}
            min={minDate}
            required
            onChange={(e) => onDateChange(e.target.value)}
          />
        </div>

        <div className={styles.inputWrapper}>
          <label htmlFor={timeId} className={styles.inputLabel}>
            Time
          </label>
          <input
            id={timeId}
            type="time"
            className={styles.timeInput}
            value={time}
            required
            onChange={(e) => onTimeChange(e.target.value)}
          />
        </div>
      </div>

      <button
        type="submit"
        className={styles.confirmButton}
        disabled={!isValid}
      >
        Next: Important Food Choices →
      </button>

      {(!date || !time) && (
        <p className={styles.scheduleHint}>
          Please select both a date and time to continue.
        </p>
      )}

      {date && time && !isValid && (
        <p className={styles.scheduleHint} style={{ color: "var(--rose-700)" }}>
          Please pick a future date and time in Tashkent time ♡
        </p>
      )}
    </form>
  );
}

