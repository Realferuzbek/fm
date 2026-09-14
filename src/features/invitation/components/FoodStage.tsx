"use client";

import { FOOD_OPTIONS, type FoodId } from "@/config/invitation";
import styles from "../InvitationExperience.module.css";

interface FoodStageProps {
  selectedFoodId: string | null;
  isTransitioning: boolean;
  onFoodSelect: (foodId: FoodId) => void;
}

/**
 * Stage 4: Food choice grid.
 * Playful 6-card selection with a brief delightful micro-transition upon choice.
 */
export function FoodStage({
  selectedFoodId,
  isTransitioning,
  onFoodSelect,
}: FoodStageProps) {
  const selectedFood = FOOD_OPTIONS.find((f) => f.id === selectedFoodId);

  if (isTransitioning && selectedFood) {
    return (
      <div className={styles.foodTransition}>
        <div className={styles.foodTransitionEmoji} aria-hidden="true">
          {selectedFood.emoji}
        </div>
        <h2 className={styles.foodHeading} tabIndex={-1} data-stage-heading>
          {selectedFood.label}!
        </h2>
        <p className={styles.foodTransitionText}>
          Locking in your choice... ✨
        </p>
      </div>
    );
  }

  return (
    <div className={styles.stage}>
      <p className={styles.eyebrow}>step 2 of 2: fuel</p>
      <h2 className={styles.foodHeading} tabIndex={-1} data-stage-heading>
        What are we eating? 🍴
      </h2>
      <p className={styles.foodSubtext}>
        Choose wisely. Your answer will be heavily respected.
      </p>

      <div className={styles.foodGrid} role="radiogroup" aria-label="Food options">
        {FOOD_OPTIONS.map((option) => {
          const isSelected = selectedFoodId === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={`${styles.foodOption} ${
                isSelected ? styles.foodOptionSelected : ""
              }`}
              onClick={() => onFoodSelect(option.id)}
            >
              <span className={styles.foodEmoji} aria-hidden="true">
                {option.emoji}
              </span>
              <span className={styles.foodLabel}>{option.label}</span>
              <span className={styles.foodDetail}>{option.detail}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

