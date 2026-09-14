import styles from "../InvitationExperience.module.css";

/** Decorative-only elements are hidden from assistive technology. */
export function AmbientDecor() {
  return (
    <div className={styles.ambientDecor} aria-hidden="true">
      <span className={`${styles.petal} ${styles.petalOne}`}>✦</span>
      <span className={`${styles.petal} ${styles.petalTwo}`}>♡</span>
      <span className={`${styles.petal} ${styles.petalThree}`}>✦</span>
      <span className={`${styles.petal} ${styles.petalFour}`}>·</span>
      <span className={`${styles.petal} ${styles.petalFive}`}>♡</span>
      <span className={`${styles.petal} ${styles.petalSix}`}>✦</span>
    </div>
  );
}
