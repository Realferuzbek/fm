import "server-only";
import { FOOD_OPTIONS, formatDateTimeInTashkent, type LocationId } from "@/config/invitation";

export interface TelegramResult {
  status: "sent" | "failed" | "unknown";
  messageId?: string;
  error?: string;
}

export async function sendTelegramMessage(text: string): Promise<TelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId || token.includes("replace-with") || chatId.includes("replace-with")) {
    return { status: "failed", error: "Telegram credentials are not configured." };
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, link_preview_options: { is_disabled: true } }),
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    const data: unknown = await response.json();
    if (data && typeof data === "object" && "ok" in data) {
      const body = data as { ok: unknown; error_code?: unknown; result?: { message_id?: unknown } };
      if (response.ok && body.ok === true && Number.isSafeInteger(body.result?.message_id)) {
        return { status: "sent", messageId: String(body.result!.message_id) };
      }
      if (body.ok === false && Number.isSafeInteger(body.error_code) && Number(body.error_code) < 500) {
        // A definitive API rejection is safe for a deliberate administrator retry.
        return { status: "failed", error: `Telegram rejected the request (${body.error_code}).` };
      }
    }
    return { status: "unknown", error: "Telegram returned an inconclusive response; inspect the chat before any action." };
  } catch {
    // Timeout/network failure may occur AFTER Telegram delivered the message.
    // Do not copy thrown fetch errors: they can contain the secret request URL.
    return { status: "unknown", error: "Telegram delivery outcome is uncertain; no automatic retry." };
  }
}

export function formatReservationMessage(date: string, time: string, food: string, location: LocationId | null, isUpdate: boolean, submittedAt = new Date()) {
  const { dateLabel, timeLabel, timeZoneLabel } = formatDateTimeInTashkent(date, time);
  const option = FOOD_OPTIONS.find((item) => item.id === food);
  return [isUpdate ? "💌 Date plans updated." : "💌 SHE SAID YES.", "",
    `Date: ${dateLabel}`, `Time: ${timeLabel} (${timeZoneLabel})`,
    `Food: ${option ? `${option.emoji} ${option.label}` : food}`,
    ...(location ? [`Meeting spot: 📍 ${location}`] : []), "",
    "Status: ✅ Date successfully arranged", `Timestamp: ${submittedAt.toISOString()}`].join("\n");
}
