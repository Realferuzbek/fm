import styles from "../InvitationExperience.module.css";

export function SurpriseStage({ isReaction = false, onOkay }: { isReaction?: boolean; onOkay: () => void }) {
  if (isReaction) return <section className={styles.reactionStage} aria-live="polite" aria-busy="true">
    <div className={styles.reactionHeart} aria-hidden="true">♡</div>
    <h1 className={styles.reactionText}>processing that yes…</h1>
    <span className={styles.reactionLine} aria-hidden="true" />
  </section>;
  return <section className={styles.stage} aria-labelledby="surprise-heading">
    <div className={styles.emotionIllustration} aria-hidden="true"><span>😭</span><i>♡</i><b>✧</b></div>
    <h1 id="surprise-heading" className={styles.surpriseHeading} tabIndex={-1} data-stage-heading>WAIT YOU ACTUALLY<br /><em>SAID YES??</em> <span className={styles.srOnly}>😭</span></h1>
    <p className={styles.surpriseSubtext}>I was so ready for you to say no 😭</p>
    <button type="button" className={styles.okayButton} onClick={onOkay}>okay okay! <span aria-hidden="true">→</span></button>
  </section>;
}
