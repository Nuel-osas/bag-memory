// Point the Telegram bot at the deployed webhook and set its command menu:  pnpm webhook
const TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const URL = `${process.env.PUBLIC_URL}/api/telegram`;
const call = async (m: string, b: object) =>
  (await fetch(`https://api.telegram.org/bot${TOKEN}/${m}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })).json();
console.log(await call("setWebhook", { url: URL, secret_token: process.env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ["message"], drop_pending_updates: true }));
console.log(await call("setMyCommands", { commands: [
  { command: "start", description: "Welcome back: your positions and rules" },
  { command: "memory", description: "Everything I remember about you" },
  { command: "fresh", description: "Ask with memory off, to compare" },
] }));
console.log(await call("setMyDescription", { description: "A trading journal that remembers your trades, your reasons and your own rules, and reminds you before you FOMO. Memory lives on Walrus. Not financial advice." }));
console.log(await call("getWebhookInfo", {}));
