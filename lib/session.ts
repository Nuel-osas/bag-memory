// Stateless sessions: an HMAC-signed token naming who you proved you are. No user database.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import type { Who } from "./memory.js";

const SECRET = process.env.SESSION_SECRET ?? "";
const TTL = 30 * 24 * 3600; // 30 days

const mac = (s: string) => createHmac("sha256", SECRET).update(s).digest("base64url");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function issue(who: Who, name: string) {
  if (!SECRET) throw new Error("SESSION_SECRET not configured");
  const body = Buffer.from(JSON.stringify({ who, name, exp: Math.floor(Date.now() / 1000) + TTL })).toString("base64url");
  return `${body}.${mac(body)}`;
}

export function check(token: string | undefined): { who: Who; name: string } {
  const [body, sig] = String(token ?? "").split(".");
  if (!body || !sig || !same(sig, mac(body))) throw new Error("not signed in");
  const s = JSON.parse(Buffer.from(body, "base64url").toString());
  if (s.exp < Date.now() / 1000) throw new Error("not signed in");
  return { who: s.who, name: s.name };
}

// Telegram Login Widget: hash = HMAC-SHA256(data_check_string, SHA256(bot_token)). Same tg id as the bot.
export function verifyTelegram(data: Record<string, string>) {
  const { hash, ...rest } = data;
  const check = Object.keys(rest).sort().map((k) => `${k}=${rest[k]}`).join("\n");
  const key = createHash("sha256").update(process.env.TELEGRAM_BOT_TOKEN ?? "").digest();
  const expect = createHmac("sha256", key).update(check).digest("hex");
  if (!hash || !same(hash, expect)) throw new Error("Telegram login could not be verified");
  if (Date.now() / 1000 - Number(rest.auth_date) > 86400) throw new Error("Telegram login expired, try again");
  return { who: `tg:${rest.id}` as Who, name: rest.first_name || rest.username || "friend" };
}

// Sui wallet: sign a short message; we recover the signer and require it to match the claimed address.
// zkLogin wallets (e.g. Slush with Google) verify through mainnet GraphQL.
const gql = new SuiGraphQLClient({ url: "https://graphql.mainnet.sui.io/graphql", network: "mainnet" } as any);
export async function verifyWallet(address: string, message: string, signature: string) {
  const issued = Date.parse(message.match(/Issued: (.+)$/m)?.[1] ?? "");
  if (!message.startsWith("Sign in to Bag Memory") || !message.includes(address) || !(Math.abs(Date.now() - issued) < 10 * 60_000)) {
    throw new Error("stale or malformed sign-in message");
  }
  const pk = await verifyPersonalMessageSignature(new TextEncoder().encode(message), signature, { client: gql as any, address });
  if (pk.toSuiAddress() !== address) throw new Error("signature does not match address");
  return { who: `sui:${address}` as Who, name: `${address.slice(0, 6)}…${address.slice(-4)}` };
}
