import styles from "../InvitationExperience.module.css";

export function AmbientDecor() {
  return <div className={styles.ambientDecor} aria-hidden="true">
    <div className={styles.ambientOrb} /><div className={styles.ambientOrbTwo} />
    <svg className={styles.botanicalLeft} viewBox="0 0 180 300" fill="none">
      <path d="M24 300c50-80 40-190 137-272M58 224c-50-12-50-53-44-73 33 12 43 38 44 73ZM84 163c39 0 71-31 71-57-41 7-62 25-71 57ZM112 98c-34-8-40-40-31-57 22 11 32 34 31 57Z" />
    </svg>
    <svg className={styles.botanicalRight} viewBox="0 0 180 300" fill="none">
      <path d="M24 300c50-80 40-190 137-272M58 224c-50-12-50-53-44-73 33 12 43 38 44 73ZM84 163c39 0 71-31 71-57-41 7-62 25-71 57ZM112 98c-34-8-40-40-31-57 22 11 32 34 31 57Z" />
    </svg>
    <span className={styles.sparkleOne}>✧</span><span className={styles.sparkleTwo}>✧</span>
    <span className={styles.ambientHeart}>♡</span>
  </div>;
}
