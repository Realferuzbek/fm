import { FOOD_OPTIONS, INVITATION_CONFIG, formatDateTimeInTashkent, type FoodId, type LocationId } from "@/config/invitation";
import styles from "../InvitationExperience.module.css";

export function FinalStage({ date, time, foodId, location, onTelegramClick, onReplay }: {
  date: string; time: string; foodId: FoodId | null; location: LocationId | null; onTelegramClick: () => void; onReplay: () => void;
}) {
  const { dateLabel, timeLabel } = formatDateTimeInTashkent(date, time);
  const food = FOOD_OPTIONS.find(option => option.id === foodId);
  return <section className={styles.stage} aria-labelledby="final-heading">
    <div className={styles.finalIllustration} aria-hidden="true">
      <svg viewBox="0 0 110 90" fill="none"><rect x="19" y="26" width="72" height="49" rx="8"/><path d="m20 30 35 25 35-25M20 73l24-25M90 73 66 49"/><path className={styles.filledHeart} d="M55 39s-18-10-18-21c0-9 13-13 18-4 5-9 18-5 18 4 0 11-18 21-18 21Z"/></svg>
      <span>♡</span>
    </div>
    <h1 id="final-heading" className={styles.finalHeading} tabIndex={-1} data-stage-heading>glad you didn&apos;t<br /><em>say no ♡</em></h1>
    <div className={styles.dateTicket}>
      <span className={styles.ticketLabel}>WE HAVE A DATE</span>
      <p className={styles.finalLead}>be ready by <strong>{timeLabel}</strong><span>I&apos;m coming to get you 🚗💨</span></p>
      <div className={styles.ticketDetails}><span className={styles.ticketDate}>{dateLabel}</span><span>{food?.emoji} {food?.label}</span>{location && <span>📍 {location}</span>}</div>
      <span className={styles.ticketHeart} aria-hidden="true">♡</span>
    </div>
    <a className={styles.telegramButton} href={INVITATION_CONFIG.telegramUrl} target="_blank" rel="noopener noreferrer"
      onClick={onTelegramClick}>Back to him ♡ <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 16 16 4M5 4h11v11" stroke="currentColor" strokeWidth="1.5" /></svg></a>
    <button className={styles.replayButton} type="button" onClick={onReplay}>one more smile? <span aria-hidden="true">↺</span></button>
  </section>;
}
