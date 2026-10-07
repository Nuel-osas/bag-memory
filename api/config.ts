// Public config for the page: the bot username for the Telegram login button and t.me link.
import type { VercelRequest, VercelResponse } from "@vercel/node";

let bot: string | null = null;
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  if (!bot && process.env.TELEGRAM_BOT_TOKEN) {
    const j: any = await (await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`)).json();
    bot = j.result?.username ?? null;
  }
  res.setHeader("cache-control", "s-maxage=300");
  res.json({ bot });
}
