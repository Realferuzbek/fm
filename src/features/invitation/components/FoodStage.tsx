import { FOOD_OPTIONS, type FoodId } from "@/config/invitation";
import styles from "../InvitationExperience.module.css";

export function FoodStage({ selectedFoodId, isTransitioning, onFoodSelect }: {
  selectedFoodId: FoodId | null; isTransitioning: boolean; onFoodSelect: (food: FoodId) => void;
}) {
  return <section className={styles.stage} aria-labelledby="food-heading">
    <p className={styles.eyebrow}>an important part of the plot</p>
    <h1 id="food-heading" className={styles.foodHeading} tabIndex={-1} data-stage-heading>What are we<br /><em>feeling?</em> <span className={styles.foodHeadingEmoji}>🍽️✨</span></h1>
    <p className={styles.foodSubtext}>pick your vibe</p>
    <div className={styles.foodGrid} role="group" aria-label="Choose our food" aria-busy={isTransitioning}>
      {FOOD_OPTIONS.map(option => <button key={option.id} type="button" disabled={isTransitioning}
        className={`${styles.foodOption} ${selectedFoodId === option.id ? styles.foodOptionSelected : ""}`}
        onClick={() => onFoodSelect(option.id)}>
        <span className={styles.foodEmoji} aria-hidden="true">{option.emoji}</span>
        <span className={styles.foodLabel}>{option.label}</span>
        <span className={styles.foodDetail}>{option.detail}</span>
        {selectedFoodId === option.id && <span className={styles.selectionMark} aria-hidden="true">✓</span>}
      </button>)}
    </div>
    <p className={styles.littleNote} aria-live="polite">{isTransitioning ? "An excellent life decision. ♡" : "Good food. Better company. (That's us.)"}</p>
  </section>;
}
