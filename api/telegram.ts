// Telegram webhook. Ack immediately, do the work in waitUntil so Telegram never retries a slow turn.
//   /start                 welcome back from memory (or intro for a new user)
//   /memory                everything remembered about you
//   /fresh <question>      same bot with memory off: the "before" for before/after
//   anything else          a journal turn; new facts get a "noted:" line edited onto the reply
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { waitUntil } from "@vercel/functions";
import { learn, turn, welcome, type Turn } from "../lib/journal.js";
import { allMemories, identify } from "../lib/memory.js";

export const config = { maxDuration: 60 };

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
const WEB = process.env.PUBLIC_URL ?? "https://bag-memory.vercel.app";

async function tg(method: string, body: object) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j: any = await r.json();
  if (!j.ok) console.error(method, j.description);
  return j.result;
}
const send = (chat_id: number, text: string, extra: object = {}) =>
  tg("sendMessage", { chat_id, text: text.slice(0, 4000), link_preview_options: { is_disabled: true }, ...extra });

// Best-effort short-term context per chat (warm instances only). Long-term context comes from Walrus Memory.
const recent = new Map<number, Turn[]>();

async function handle(update: any) {
  const msg = update.message;
  if (!msg?.text || !msg.from) return;
  const chat = msg.chat.id as number;
  if (msg.chat.type !== "private") return send(chat, "I keep a private journal per person. DM me instead.");
  const who = `tg:${msg.from.id}` as const;
  const text = String(msg.text).trim();
  await tg("sendChatAction", { chat_id: chat, action: "typing" });

  if (text.startsWith("/start")) {
    const w = await welcome(who, msg.from.first_name).catch(() => null);
    if (w) return send(chat, w.text);
    return send(chat, [
      `Hey ${msg.from.first_name ?? "there"}, I'm Bag Memory: a trading journal that actually remembers you.`,
      "",
      "Tell me what you buy and sell, why, your targets and stops, your own rules (\"never more than 5% in memecoins\"), and what you learned from your losses.",
      "Next time you're about to FOMO into something, I'll remind you what you told me.",
      "",
      "Try: \"Bought 300 SUI at $1.05, target $1.60, stop $0.85, betting on Walrus adoption\"",
      "",
      "/memory shows everything I remember. Memories are encrypted on Walrus. Not financial advice.",
      `Web version (same memory, log in with Telegram): ${WEB}`,
    ].join("\n"));
  }

  if (text.startsWith("/memory")) {
    const { namespace, keyIndex } = identify(who);
    const mems = await allMemories(keyIndex, namespace);
    if (!mems.length) return send(chat, "Nothing yet. Log a trade, a rule or a lesson and I'll keep it.");
    const lines = mems.map((m, i) => `${i + 1}. ${m.text}`);
    return send(chat, `I remember ${mems.length} things about you:\n\n${lines.join("\n")}`);
  }

  if (text.startsWith("/fresh")) {
    const q = text.replace(/^\/fresh(@\w+)?/, "").trim();
    if (!q) return send(chat, "Usage: /fresh <question>. Same bot, no memory, for comparison.");
    const r = await turn(who, q, [], false);
    return send(chat, `(memory off)\n\n${r.answer}`);
  }

  const history = recent.get(chat) ?? [];
  const r = await turn(who, text, history);
  recent.set(chat, [...history, { role: "user" as const, content: text }, { role: "assistant" as const, content: r.answer }].slice(-10));
  const sent = await send(chat, r.answer);
  const facts = await learn(who, text).catch((e) => (console.error("learn", e?.message), []));
  if (sent && facts.length) {
    await tg("editMessageText", {
      chat_id: chat,
      message_id: sent.message_id,
      text: `${r.answer}\n\n🧠 noted: ${facts.join(" · ")}`.slice(0, 4000),
      link_preview_options: { is_disabled: true },
    });
  }
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(200).send("ok");
  if (SECRET && req.headers["x-telegram-bot-api-secret-token"] !== SECRET) return res.status(401).send("bad secret");
  const update = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  waitUntil(
    handle(update).catch(async (e) => {
      console.error("telegram", e?.message ?? e);
      const chat = update?.message?.chat?.id;
      if (chat) await send(chat, "Something broke on my side, try again in a minute.").catch(() => {});
    }),
  );
  res.status(200).send("ok");
}
