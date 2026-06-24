/**
 * Notificaciones a Telegram y/o Discord.
 * Los secretos viven en variables de entorno; la config solo activa/desactiva.
 *
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 *   DISCORD_WEBHOOK_URL
 */

import { bot } from "./store";

export async function notify(text: string, force = false): Promise<void> {
  const n = bot().config.notify;
  const jobs: Promise<unknown>[] = [];

  if ((force || n.telegram) && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    jobs.push(sendTelegram(text));
  }
  if ((force || n.discord) && process.env.DISCORD_WEBHOOK_URL) {
    jobs.push(sendDiscord(text));
  }
  await Promise.allSettled(jobs);
}

async function sendTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const chat = process.env.TELEGRAM_CHAT_ID!;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chat,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  }).catch(() => {});
}

async function sendDiscord(text: string) {
  await fetch(process.env.DISCORD_WEBHOOK_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: text }),
  }).catch(() => {});
}

export function notifyConfigured(): { telegram: boolean; discord: boolean } {
  return {
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    discord: Boolean(process.env.DISCORD_WEBHOOK_URL),
  };
}
