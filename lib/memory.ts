// Walrus Memory wiring: one MemWal account, one namespace per Telegram user, users spread across delegate keys.
import { createHash } from "node:crypto";
import { MemWal } from "@mysten-incubation/memwal";

const SERVER_URL = process.env.MEMWAL_SERVER_URL ?? "https://relayer-staging.memory.walrus.xyz";
const ACCOUNT_ID = process.env.MEMWAL_ACCOUNT_ID ?? "";
const KEYS = (process.env.MEMWAL_KEYS ?? "").split(",").map((k) => k.trim()).filter(Boolean);
export const NS_PREFIX = "bag-";

// One person = one namespace, derived from who they proved they are. Hashed with a server salt.
//   Telegram (bot or "Log in with Telegram" on the web) -> tg:<telegram user id>
//   Sui wallet (signed message on the web)                -> sui:<address>
// Same identity on any device -> same namespace -> same memories. No user database.
const SALT = process.env.NS_SALT ?? "bag-memory";
export type Who = `tg:${string}` | `sui:${string}`;
export function identify(who: Who) {
  const id = createHash("sha256").update(`${SALT}:${who.toLowerCase()}`).digest("hex");
  return { namespace: NS_PREFIX + id.slice(0, 20), keyIndex: parseInt(id.slice(0, 8), 16) % KEYS.length };
}

const clients = new Map<number, MemWal>();
export function client(keyIndex = 0): MemWal {
  if (!ACCOUNT_ID || !KEYS.length) throw new Error("MEMWAL_ACCOUNT_ID / MEMWAL_KEYS not configured");
  if (!clients.has(keyIndex)) {
    clients.set(keyIndex, MemWal.create({ key: KEYS[keyIndex], accountId: ACCOUNT_ID, serverUrl: SERVER_URL }));
  }
  return clients.get(keyIndex)!;
}

// Real hits on short facts land around 0.5-0.8; unrelated text sits at 0.95+.
const MAX_DISTANCE = 0.85;

export async function recallFor(keyIndex: number, namespace: string, query: string, limit = 8) {
  const r = await retry(() => client(keyIndex).recall({ query, limit, namespace, maxDistance: MAX_DISTANCE }));
  return r.results;
}

// Everything we know about a user: a broad query with no threshold, newest first.
export async function allMemories(keyIndex: number, namespace: string) {
  const r = await retry(() =>
    client(keyIndex).recall({ query: "facts about this user: positions, entries, reasons, rules, wins, losses, chains, wallets, goals, risk", limit: 100, namespace }),
  );
  return r.results.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
}

// LLM extracts durable facts from the user's turn; each fact becomes its own encrypted Walrus blob.
export async function learn(keyIndex: number, namespace: string, text: string) {
  if (!text.trim()) return { facts: [] as { text: string }[] };
  return retry(() => client(keyIndex).analyze(text, { namespace, occurredAt: new Date() }));
}

export async function namespaceCounts() {
  const out: { namespace: string; memories: number; updated_at?: string }[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const r: any = await client(0).listNamespaces(cursor ? { cursor } : {});
    for (const n of r.namespaces) {
      if (String(n.name ?? n.id).startsWith(NS_PREFIX)) out.push({ namespace: n.name ?? n.id, memories: n.memory_count, updated_at: n.updated_at });
    }
    if (!r.has_more || !r.next_cursor) break;
    cursor = r.next_cursor;
  }
  return out.sort((a, b) => b.memories - a.memories);
}

// The relayer drops requests under load and rate-limits at 30 points/min per key. Back off and retry.
async function retry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e: any) {
      last = e;
      const msg = String(e?.message ?? e);
      if (i === attempts || !/429|rate|aborted|timeout|ECONNRESET|fetch failed|50[234]/i.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, (/429|rate/i.test(msg) ? 6000 : 1500) * i));
    }
  }
  throw last;
}
