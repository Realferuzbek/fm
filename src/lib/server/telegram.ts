import { FOOD_OPTIONS, formatDateTimeInTashkent } from "@/config/invitation";

export interface TelegramResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

function getTelegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required.");
  }
  return { token, chatId };
}

export async function sendTelegramMessage(text: string): Promise<TelegramResult> {
  try {
    const { token, chatId } = getTelegramConfig();
    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      return { ok: false, error: data.description || "Unknown Telegram API error" };
    }

    return { ok: true, messageId: String(data.result.message_id) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Network error" };
  }
}

export async function editTelegramMessage(messageId: string, text: string): Promise<TelegramResult> {
  try {
    const { token, chatId } = getTelegramConfig();
    const url = `https://api.telegram.org/bot${token}/editMessageText`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: Number(messageId),
        text,
        parse_mode: "HTML",
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      return { ok: false, error: data.description || "Unknown Telegram API error" };
    }

    return { ok: true, messageId: String(data.result.message_id) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Network error" };
  }
}

export function formatReservationMessage(date: string, time: string, food: string, isUpdate: boolean): string {
  const { dateLabel, timeLabel, timeZoneLabel } = formatDateTimeInTashkent(date, time);
  const foodOption = FOOD_OPTIONS.find((f) => f.id === food);
  const foodLabel = foodOption ? `${foodOption.emoji} ${foodOption.label}` : food;

  let message = isUpdate ? "<b>🔄 Reservation Updated!</b>\n\n" : "<b>🎉 New Reservation!</b>\n\n";
  message += `<b>Date:</b> ${dateLabel}\n`;
  message += `<b>Time:</b> ${timeLabel} (${timeZoneLabel})\n`;
  message += `<b>Food:</b> ${foodLabel}`;

  return message;
}
