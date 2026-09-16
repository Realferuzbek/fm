export const INVITATION_CONFIG = {
  assetPaths: {
    petImage: "/assets/images/ChatGPT Image Sep 14, 2026, 05_00_08 PM (2).png",
    backgroundAudio: "/assets/audio/alisher-uzoqov-oshiq-yurak_(uzhits.net).mp3"
  },
  petImageObjectPosition: "50% 50%",
  petImageObjectFit: "contain" as "contain" | "cover",
  petImageAlt: "A little black pug in a cozy sweater, making a very persuasive face",
  telegramUrl: "https://t.me/realferuzbek",
  timeZone: "Asia/Tashkent",
  audioVolume: 0.28,
  motion: { reactionMs: 650, foodSelectionMs: 420 },
  locale: "en-US"
} as const;

/** Config paths use actual filenames; encode each segment for production URLs. */
export function assetUrl(path: string) {
  return path.split("/").map(segment => encodeURIComponent(segment)).join("/");
}

export const FOOD_OPTIONS = [
  { id: "donar", emoji: "🍗", label: "Donar", detail: "comfortingly correct" },
  { id: "lavash", emoji: "🌯", label: "Lavash", detail: "wrapped with intention" },
  { id: "shashlik", emoji: "🍢", label: "Shashlik", detail: "a very serious choice" },
  { id: "taco", emoji: "🌮", label: "Taco", detail: "tiny fiesta energy" },
  { id: "lagmon", emoji: "🍜", label: "Lag'mon", detail: "noodle-level cozy" },
  { id: "osh", emoji: "🍚", label: "Osh", detail: "legendary, honestly" }
] as const;

export type FoodId = (typeof FOOD_OPTIONS)[number]["id"];

export const EVENT_NAMES = [
  "visit_started",
  "screen_1_viewed",
  "no_button_attempted",
  "yes_clicked",
  "screen_2_viewed",
  "okay_clicked",
  "date_screen_viewed",
  "date_selected",
  "time_selected",
  "date_confirmed",
  "food_screen_viewed",
  "food_selected",
  "final_screen_viewed",
  "telegram_clicked"
] as const;

export type AnalyticsEventName = (typeof EVENT_NAMES)[number];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isUuidValue(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function partsForTimeZone(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: INVITATION_CONFIG.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

export function getTashkentNow() {
  const parts = partsForTimeZone(new Date());
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`
  };
}

export function isValidDateValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const candidate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return candidate.getUTCFullYear() === Number(year) && candidate.getUTCMonth() === Number(month) - 1 && candidate.getUTCDate() === Number(day);
}

export function isValidTimeValue(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return Boolean(match && Number(match[1]) <= 23 && Number(match[2]) <= 59);
}

export function isFutureTashkentDateTime(date: string, time: string) {
  if (!isValidDateValue(date) || !isValidTimeValue(time)) return false;
  const now = getTashkentNow();
  return `${date}T${time}` > `${now.date}T${now.time}`;
}

export function formatDateTimeInTashkent(date: string, time: string) {
  if (!isValidDateValue(date) || !isValidTimeValue(time)) {
    return { dateLabel: date, timeLabel: time, timeZoneLabel: "Tashkent time" };
  }

  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const dateLabel = new Intl.DateTimeFormat(INVITATION_CONFIG.locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 || 12;

  return {
    dateLabel,
    timeLabel: `${hour}:${String(minutes).padStart(2, "0")} ${suffix}`,
    timeZoneLabel: "Tashkent time"
  };
}
