import { LOCATION_OPTIONS, type LocationId } from "@/config/invitation";
import styles from "../InvitationExperience.module.css";

export function LocationStage({ selectedLocation, isTransitioning, onLocationSelect }: {
  selectedLocation: LocationId | null;
  isTransitioning: boolean;
  onLocationSelect: (location: LocationId) => void;
}) {
  return <section className={styles.stage} aria-labelledby="location-heading">
    <h1 id="location-heading" className={styles.foodHeading} tabIndex={-1} data-stage-heading>
      Where should<br /><em>I find you?</em> <span className={styles.foodHeadingEmoji}>📍♡</span>
    </h1>
    <p className={styles.foodSubtext}>pick our meeting spot</p>
    <div className={styles.foodGrid} role="group" aria-label="Choose our meeting spot" aria-busy={isTransitioning}>
      {LOCATION_OPTIONS.map(location => <button key={location} type="button" disabled={isTransitioning}
        className={`${styles.foodOption} ${selectedLocation === location ? styles.foodOptionSelected : ""}`}
        aria-pressed={selectedLocation === location} onClick={() => onLocationSelect(location)}>
        <span className={styles.foodEmoji} aria-hidden="true">📍</span>
        <span className={styles.foodLabel}>{location}</span>
        {selectedLocation === location && <span className={styles.selectionMark} aria-hidden="true">✓</span>}
      </button>)}
    </div>
  </section>;
}
