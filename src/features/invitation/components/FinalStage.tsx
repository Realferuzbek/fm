"use client";

import { FOOD_OPTIONS, INVITATION_CONFIG, formatDateTimeInTashkent } from "@/config/invitation";
import styles from "../InvitationExperience.module.css";

interface FinalStageProps {
  date: string;
  time: string;
  foodId: string | null;
  onTelegramClick: () => void;
}

/**
 * Stage 5: The final reveal.
 * Displays date, time, and food summary with the "Back to him ♡" Telegram CTA.
 */
export function FinalStage({
  date,
  time,
  foodId,
  onTelegramClick,
}: FinalStageProps) {
  const { dateLabel, timeLabel, timeZoneLabel } = formatDateTimeInTashkent(date, time);
  const foodOption = FOOD_OPTIONS.find((f) => f.id === foodId);

  return (
    <div className={styles.stage}>
      <div className={styles.finalEmoji} aria-hidden="true">
        🎉
      </div>
      <p className={styles.eyebrow}>it is officially happening</p>
      <h2 className={styles.finalHeading} tabIndex={-1} data-stage-heading>
        It&apos;s a date! ♡
      </h2>

      <div className={styles.summaryCard}>
        <div className={styles.summaryRow}>
          <span className={styles.summaryIcon} aria-hidden="true">
            📅
          </span>
          <div>
            <div className={styles.summaryLabel}>Date</div>
            <div className={styles.summaryValue}>{dateLabel}</div>
          </div>
        </div>

        <div className={styles.summaryRow}>
          <span className={styles.summaryIcon} aria-hidden="true">
            ⏰
          </span>
          <div>
            <div className={styles.summaryLabel}>Time</div>
            <div className={styles.summaryValue}>
              {timeLabel}{" "}
              <span className={styles.summaryValueSmall}>({timeZoneLabel})</span>
            </div>
          </div>
        </div>

        <div className={styles.summaryRow}>
          <span className={styles.summaryIcon} aria-hidden="true">
            {foodOption ? foodOption.emoji : "🍴"}
          </span>
          <div>
            <div className={styles.summaryLabel}>Menu</div>
            <div className={styles.summaryValue}>
              {foodOption ? foodOption.label : "Chef's Surprise"}
            </div>
            {foodOption && (
              <div className={styles.summaryValueSmall}>{foodOption.detail}</div>
            )}
          </div>
        </div>
      </div>

      <a
        href={INVITATION_CONFIG.telegramUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.telegramButton}
        onClick={onTelegramClick}
      >
        Back to him ♡
      </a>

      <p className={styles.finalFooter}>
        Can&apos;t wait to see you ✨
      </p>
    </div>
  );
}

