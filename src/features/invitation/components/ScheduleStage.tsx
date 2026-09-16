"use client";
import { useId, type FormEvent } from "react";
import { TIME_OPTIONS } from "@/config/invitation";
import styles from "../InvitationExperience.module.css";

export function ScheduleStage({ date, time, minDate, isValid, onDateChange, onTimeChange, onConfirm }: {
  date: string; time: string; minDate: string; isValid: boolean;
  onDateChange: (date: string) => void; onTimeChange: (time: string) => void; onConfirm: () => void;
}) {
  const dateId = useId(), timeId = useId(), hintId = useId();
  const invalid = Boolean(date && time && !isValid);
  const submit = (event: FormEvent) => { event.preventDefault(); if (isValid) onConfirm(); };
  return <form className={styles.stage} onSubmit={submit} aria-labelledby="schedule-heading">
    <div className={styles.lineIllustration} aria-hidden="true">
      <svg viewBox="0 0 80 80" fill="none"><rect x="15" y="19" width="50" height="47" rx="10"/><path d="M15 34h50M29 12v15M51 12v15"/><path className={styles.filledHeart} d="M40 55s-10-5-10-11c0-5 7-7 10-2 3-5 10-3 10 2 0 6-10 11-10 11Z"/></svg>
    </div>
    <p className={styles.eyebrow}>let&apos;s make a little time for us</p>
    <h1 id="schedule-heading" className={styles.scheduleHeading} tabIndex={-1} data-stage-heading>So... when are<br /><em>you free?</em></h1>
    <p className={styles.scheduleSubtext}>Pick a day &amp; time ♡</p>
    <div className={styles.inputGroup}>
      <div className={styles.inputWrapper}>
        <label htmlFor={dateId} className={styles.inputLabel}>Our day</label>
        <input id={dateId} type="date" value={date} min={minDate} required className={styles.dateInput}
          aria-describedby={invalid ? hintId : undefined} aria-invalid={invalid || undefined} onChange={event => onDateChange(event.target.value)} />
      </div>
      <div className={styles.inputWrapper}>
        <label htmlFor={timeId} className={styles.inputLabel}>Your time</label>
        <select id={timeId} value={time} required className={styles.timeInput}
          aria-describedby={invalid ? hintId : undefined} aria-invalid={invalid || undefined} onChange={event => onTimeChange(event.target.value)}>
          <option value="" disabled>Choose a time</option>
          {TIME_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>
    </div>
    {invalid && <p id={hintId} className={styles.formError} role="status">A little further in the future, please ♡</p>}
    <button type="submit" className={`${styles.confirmButton} ${styles.scheduleConfirm}`} disabled={!isValid}>Set the date ♡</button>
    <p className={styles.littleNote}>I&apos;ll make sure it&apos;s worth getting ready for.</p>
  </form>;
}
