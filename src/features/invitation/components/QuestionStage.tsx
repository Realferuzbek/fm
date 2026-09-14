"use client";

import { useRef, useState } from "react";

import styles from "../InvitationExperience.module.css";
import { useNoEscape } from "../hooks/useNoEscape";

interface QuestionStageProps {
  imageSrc: string;
  imageAlt: string;
  imageObjectPosition: string;
  reducedMotion: boolean;
  onYes: () => void;
  onNoAttempt: () => void;
}

export function QuestionStage({
  imageSrc,
  imageAlt,
  imageObjectPosition,
  reducedMotion,
  onYes,
  onNoAttempt,
}: QuestionStageProps): JSX.Element {
}: QuestionStageProps) {
  const arenaRef = useRef<HTMLDivElement>(null);
  const yesRef = useRef<HTMLButtonElement>(null);
  const noRef = useRef<HTMLButtonElement>(null);
  const [escapeStatus, setEscapeStatus] = useState("");
  const [imgError, setImgError] = useState(false);
  const noEscape = useNoEscape({
    arenaRef,
    buttonRef: noRef,
    obstacleRef: yesRef,
    enabled: true,
    reducedMotion,
    onAttempt: onNoAttempt,
    onStatus: setEscapeStatus,
  });

  return (
    <>
      <div className={styles.photoFrame}>
        <img
          className={styles.petPhoto}
          src={imageSrc}
          alt={imageAlt}
          style={{ objectPosition: imageObjectPosition }}
        />
        {imgError ? (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "2.5rem",
              background: "linear-gradient(135deg, var(--rose-100) 0%, var(--lavender-100) 100%)",
            }}
            aria-label={imageAlt}
          >
            🐾
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            className={styles.petPhoto}
            src={imageSrc}
            alt={imageAlt}
            style={{ objectPosition: imageObjectPosition }}
            onError={() => setImgError(true)}
          />
        )}
      </div>
      <p className={styles.eyebrow}>a very important tiny question</p>
      <h1 className={styles.questionHeading} tabIndex={-1} data-stage-heading>
        <span>🌸 Will you go on a</span>
        <span>date with me? 🌸</span>
      </h1>
      <p className={styles.questionSupport}>
        Please answer carefully. There is a small committee involved.
      </p>

      <div
        ref={arenaRef}
        className={styles.choiceArena}
        onPointerMove={noEscape.onArenaPointerMove}
      >
        <button
          ref={yesRef}
          className={`${styles.button} ${styles.primaryButton} ${styles.yesButton}`}
          type="button"
          onClick={onYes}
        >
          YES <span aria-hidden="true">♡</span>
        </button>
        <button
          ref={noRef}
          className={`${styles.button} ${styles.noButton}`}
          data-testid="no-button"
          type="button"
          aria-describedby="no-button-status"
          onPointerDown={noEscape.onNoPointerDown}
          onClick={noEscape.onNoClick}
          style={{
            transform: `translate3d(${noEscape.offset.x}px, ${noEscape.offset.y}px, 0)`,
          }}
        >
          NO
        </button>
      </div>
      <p id="no-button-status" className={styles.srOnly} aria-live="polite">
        {escapeStatus}
      </p>
    </>
  );
}
