"use client";

import styles from "../InvitationExperience.module.css";

interface SurpriseStageProps {
  isReaction?: boolean;
  onOkay: () => void;
}

/**
 * Stage 2: The merged yes-reaction + surprise screen.
 * Displays "WAIT YOU ACTUALLY SAID YES??" with a cute emoji pop,
 * a soft italic line, and an "okay okay!" button.
 * Flow:
 * Short ~0.8s reaction ("YAY!! ♡") -> "WAIT YOU ACTUALLY SAID YES?? 😭"
 * -> "I was so ready for you to say no 😭" -> "okay okay! →"
 */
export function SurpriseStage({ onOkay }: SurpriseStageProps): JSX.Element {
export function SurpriseStage({ isReaction = false, onOkay }: SurpriseStageProps) {
  if (isReaction) {
    return (
      <div className={styles.stage} style={{ padding: "30px 0" }}>
        <div className={styles.surpriseEmoji} aria-hidden="true" style={{ fontSize: "3.5rem" }}>
          💖
        </div>
        <h2 className={styles.surpriseHeading} tabIndex={-1} data-stage-heading>
          YAY!! ♡
        </h2>
        <p className={styles.surpriseSubtext}>
          Wait a second...
        </p>
      </div>
    );
  }

  return (
    <>
    <div className={styles.stage}>
      <div className={styles.surpriseEmoji} aria-hidden="true">
        😭
      </div>
      <h2 className={styles.surpriseHeading} tabIndex={-1} data-stage-heading>
        WAIT YOU ACTUALLY SAID YES??
      </h2>
      <p className={styles.surpriseSubtext}>
        I was so ready for you to say no 😭
      </p>
      <button
        className={styles.okayButton}
        type="button"
        onClick={onOkay}
      >
        okay okay! →
      </button>
    </>
    </div>
  );
}
