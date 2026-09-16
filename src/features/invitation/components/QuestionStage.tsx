"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { assetUrl, INVITATION_CONFIG } from "@/config/invitation";
import { useNoEscape } from "../hooks/useNoEscape";
import styles from "../InvitationExperience.module.css";

export function QuestionStage({ reducedMotion, onYes, onNoAttempt, disabled = false }: {
  reducedMotion: boolean; onYes: () => void; onNoAttempt: () => void; disabled?: boolean;
}) {
  const arenaRef = useRef<HTMLDivElement>(null);
  const yesRef = useRef<HTMLButtonElement>(null);
  const noRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState("");
  const [imageFailed, setImageFailed] = useState(false);
  const escape = useNoEscape({ arenaRef, buttonRef: noRef, obstacleRef: yesRef, enabled: !disabled,
    reducedMotion, onAttempt: onNoAttempt, onStatus: setStatus });
  return <section className={styles.stage} aria-labelledby="question-heading">
    <div className={styles.photoComposition}>
      <span className={styles.photoAnnotation} aria-hidden="true">my very convincing<br />wingman</span>
      <svg className={styles.annotationArrow} viewBox="0 0 60 60" fill="none" aria-hidden="true"><path d="M7 5c25-2 36 16 31 34m-9-8 9 10 9-9" /></svg>
      <div className={styles.photoFrame}>
        {imageFailed ? <span className={styles.petFallback} role="img" aria-label="A little paw, with a very big question">🐾</span> :
          <Image className={styles.petPhoto} src={assetUrl(INVITATION_CONFIG.assetPaths.petImage)}
            alt={INVITATION_CONFIG.petImageAlt} fill sizes="(max-width: 600px) 176px, 216px"
            loading="eager" fetchPriority="high"
            style={{ objectFit: INVITATION_CONFIG.petImageObjectFit, objectPosition: INVITATION_CONFIG.petImageObjectPosition }}
            onError={() => setImageFailed(true)} />}
      </div>
    </div>
    <p className={styles.eyebrow}>a very important tiny question</p>
    <h1 id="question-heading" className={styles.questionHeading} tabIndex={-1} data-stage-heading>
      <span className={styles.headingFlower} aria-hidden="true">🌸</span> Will you go on a<br />
      <em>date with me?</em> <span className={styles.headingFlower} aria-hidden="true">🌸</span>
    </h1>
    <p className={styles.questionSupport}>The face above is part of my strategy.</p>
    <div ref={arenaRef} className={styles.choiceArena} onPointerMove={escape.onArenaPointerMove} data-testid="choice-arena">
      <button ref={yesRef} type="button" disabled={disabled} className={styles.yesButton} onClick={onYes}>YES ♡</button>
      <button ref={noRef} type="button" disabled={disabled} className={styles.noButton} data-testid="no-button"
        aria-describedby="no-button-status" onPointerDown={escape.onNoPointerDown} onClick={escape.onNoClick}
        style={{ transform: `translate3d(${escape.offset.x}px, ${escape.offset.y}px, 0)` }}>NO</button>
    </div>
    <p id="no-button-status" className={styles.escapeStatus} aria-live="polite">{status || "no pressure. just one extremely hopeful pug."}</p>
  </section>;
}
