// The journal brain, shared by the Telegram bot and the web app.
//   turn():    recall what matters for this message + the user's rules/positions -> live prices -> DeepSeek
//   welcome(): "welcome back" opener built only from memory, before the user types anything
//   learn():   analyze() the user's message into durable facts, each a Seal-encrypted Walrus blob
import { identify, learn as analyzeInto, recallFor, type Who } from "./memory.js";
import { mentionedCoins, prices } from "./prices.js";

const KEY = process.env.DEEPSEEK_API_KEY ?? "";
export const MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
export type Turn = { role: "user" | "assistant"; content: string };
type Mem = { blob_id: string; text: string; distance: number };

const PERSONA = `You are Bag Memory, a sharp, friendly trading-journal partner for crypto people.
You help the user log trades (entries, exits, size, reasons, targets, stops), their personal rules, wins, losses and lessons, and you hold them to their own rules.
Style: short, direct, a little playful, plain text, no markdown headings or bold, at most a few short paragraphs. Use numbers when you have them.
You are not a financial adviser. Never tell anyone to buy or sell; ask questions, surface their own history and rules, and do the math.`;

function system(memories: string[] | null, live: Record<string, number>) {
  const px = Object.entries(live).map(([id, usd]) => `${id}: $${usd}`).join(", ");
  const parts = [PERSONA, px ? `Live prices (USD, CoinGecko): ${px}. Use them to compute P&L against remembered entries.` : ""];
  if (memories === null) parts.push("You have no memory of this user beyond this message.");
  else if (!memories.length) parts.push("You have long-term memory, but nothing relevant is stored about this user yet. Do not pretend to know them. Encourage them to log trades, reasons and rules so you can hold them to it next time.");
  else parts.push(
    "Facts you remember about this user from earlier conversations (Walrus Memory):",
    ...memories.map((m) => `- ${m}`),
    "Use them: compare new ideas against their own rules and past results, compute P&L from remembered entries, follow up on open positions and targets. If they are about to break one of their rules, say so plainly, quoting the rule. Do not dump the list back at them.",
  );
  return parts.filter(Boolean).join("\n");
}

async function deepseek(sys: string, history: Turn[], message: string) {
  if (!KEY) throw new Error("DEEPSEEK_API_KEY not configured");
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, temperature: 0.6, messages: [{ role: "system", content: sys }, ...history.slice(-10), { role: "user", content: message }] }),
  });
  const j: any = await res.json();
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${j?.error?.message ?? JSON.stringify(j).slice(0, 200)}`);
  return { text: String(j.choices[0].message.content).trim(), model: String(j.model ?? MODEL) };
}

const dedupe = (xs: Mem[]) => [...new Map(xs.sort((a, b) => a.distance - b.distance).map((x) => [x.blob_id, x])).values()];

// Two recalls in parallel: what is relevant to this message, and the user's standing rules + open positions,
// so "thinking of aping into X" always meets their own memecoin rule even if X was never mentioned before.
async function recallBoth(who: Who, message: string) {
  const { namespace, keyIndex } = identify(who);
  const [rel, core] = await Promise.all([
    recallFor(keyIndex, namespace, message, 8),
    recallFor(keyIndex, namespace, "the user's trading rules, risk limits, open positions and entry prices", 5),
  ]);
  return dedupe([...rel, ...core]);
}

export async function turn(who: Who, message: string, history: Turn[] = [], memory = true) {
  const t0 = Date.now();
  const mems = memory ? await recallBoth(who, message) : [];
  const t1 = Date.now();
  const live = await prices(mentionedCoins(message, ...mems.map((m) => m.text)));
  const out = await deepseek(system(memory ? mems.map((m) => m.text) : null, live), history, message);
  console.log(JSON.stringify({ ev: "turn", ns: identify(who).namespace.slice(0, 10), memory, recalled: mems.length, coins: Object.keys(live).length, recallMs: t1 - t0, llmMs: Date.now() - t1 }));
  return { answer: out.text, model: out.model, memories: mems.map((m) => ({ text: m.text, distance: m.distance })), prices: live, recallMs: t1 - t0, llmMs: Date.now() - t1 };
}

// Opener from memory alone. Returns null for someone we have never met.
export async function welcome(who: Who, name?: string) {
  const { namespace, keyIndex } = identify(who);
  const mems = await recallFor(keyIndex, namespace, "open positions, entry prices, targets, stop losses, rules, recent lessons", 10);
  if (!mems.length) return null;
  const live = await prices(mentionedCoins(...mems.map((m) => m.text)));
  const out = await deepseek(
    system(mems.map((m) => m.text), live),
    [],
    `(${name ?? "The user"} just opened the journal. Greet them back in 2 to 4 short lines: their open positions with current P&L if you can compute it, any target or stop that is close, and one of their own rules or lessons worth keeping in mind today. End with a short question.)`,
  );
  return { text: out.text, memories: mems.length };
}

export async function learn(who: Who, message: string) {
  const { namespace, keyIndex } = identify(who);
  const r: any = await analyzeInto(keyIndex, namespace, message);
  const facts = (r.facts ?? []).map((f: any) => String(f.text));
  console.log(JSON.stringify({ ev: "learn", ns: namespace.slice(0, 10), facts: facts.length }));
  return facts;
}
