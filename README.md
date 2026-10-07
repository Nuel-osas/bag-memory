# Bag Memory: a crypto trading journal that remembers your rules

Web: https://bag-memory.vercel.app · Telegram: see the "Open in Telegram" button on the site

Every crypto trader has rules. "Never more than 5% in memecoins." "Don't buy anything that pumped 50% in a day." And every trader has broken them at 2am, chasing a green candle, because nobody was there to remind them. ChatGPT can't help: it forgets you the moment the chat ends.

Bag Memory is a chat journal on Telegram and the web. You tell it your trades, why you took them, your targets and stops, your rules and the lessons from your losses. It remembers all of it on Walrus Memory. The next time you're about to FOMO, it quotes your own rules and your own losses back to you, with live P&L on what you already hold.

```
you:  thinking of aping 20% of my bag into BONK, it's up 60% today
bot:  Two of your own rules are on the table here. You don't buy anything that pumped
      50% in a day: BONK is up 60%. And never more than 5% in memecoins: 20% is 4x that cap.
      Last time you chased a green candle, PEPE took 40% off you in August...
      Also, where are you on SUI? 400 at $0.95, now $1.12, that's +$68, +18%.
```

Same question with memory off: "A 60% day is the part that should slow you down..." Generic, correct, and useless.

Built for Walrus Session 8: Chatbots That Remember.

| | |
|---|---|
| Memory | [Walrus Memory](https://docs.wal.app/walrus-memory) (`@mysten-incubation/memwal` 0.1.8), Sui testnet relayer |
| LLM | DeepSeek via api.deepseek.com, model `deepseek-v4-flash` requested (the API reports `deepseek-flash`, V4.1 Flash, which DeepSeek routes that name to) |
| Runtime | Vercel serverless functions (Node). Telegram webhook + a plain HTML web app |
| Prices | CoinGecko public API, for P&L against remembered entries |

## How memory works here

```
message (Telegram or web)
  ├─ recall(message)                                   → memories relevant to what you just said
  ├─ recall("rules, risk limits, open positions")      → your standing rules and bags, every turn,
  │                                                      so a coin you never mentioned still meets your memecoin rule
  ├─ CoinGecko prices for coins in the message and memories
  ├─ DeepSeek(persona + recalled facts + prices + this session's turns) → reply
  └─ analyze(message)  → an LLM extracts durable facts ("User bought 400 SUI at $0.95",
                         "User's rule is never more than 5% in memecoins"); each becomes its own
                         Seal-encrypted blob on Walrus. Shown as "noted: ..." under your message.
```

- Welcome back: when you open the journal (`/start` or the web app), before you type anything, it recalls your open positions, targets, stops and rules and greets you with live P&L.
- One person, one memory: your namespace is derived from who you proved you are. Telegram id (the bot, or "Log in with Telegram" on the web: same memory on both), or a Sui wallet signature. No user database, no passwords.
- Before/after: `/fresh <question>` on Telegram, or the Memory toggle on the web, runs the same bot and model with no memory.
- Transparency: `/memory` (or "What do you remember?") lists every memory. Usage evidence: `GET /api/stats`.

## Run it yourself

Needs Node 20+, pnpm, a DeepSeek key, and for Telegram a bot token from @BotFather.

```bash
git clone https://github.com/Nuel-osas/bag-memory.git && cd bag-memory
pnpm install
cp .env.example .env          # fill DEEPSEEK_API_KEY, SESSION_SECRET, NS_SALT (openssl rand -hex 32)
pnpm init-account             # 1st run prints an owner address: fund it with ~0.05 testnet SUI at faucet.sui.io
pnpm init-account             # creates a MemWal account + 4 delegate keys, appends them to .env
pnpm start                    # web app on http://localhost:3000 (wallet login)
```

Telegram: deploy (`vercel deploy`, add the `.env` values except `OWNER_SUI_PRIVATE_KEY` as environment variables), set `TELEGRAM_BOT_TOKEN` and `PUBLIC_URL`, then `pnpm webhook`. For the web "Log in with Telegram" button, send `/setdomain` to @BotFather with your domain.

## Files

| File | What it does |
|---|---|
| `lib/journal.ts` | the brain: two recalls, prices, DeepSeek, welcome back, learn |
| `lib/memory.ts` | MemWal clients per delegate key, identity to namespace, recall/analyze with retry |
| `lib/session.ts` | stateless sessions; Telegram login and Sui wallet signature verification |
| `lib/prices.ts` | CoinGecko lookups for coins mentioned |
| `api/telegram.ts` | Telegram webhook: `/start`, `/memory`, `/fresh`, journal turns |
| `api/auth.ts`, `api/chat.ts`, `api/learn.ts`, `api/welcome.ts`, `api/memories.ts` | web app |
| `api/stats.ts` | users and memories per (hashed) namespace |
| `scripts/setup.ts`, `scripts/webhook.ts`, `scripts/serve.ts` | account setup, Telegram wiring, local server |

## Things we hit

- Recall is pure similarity. "Thinking of aping into BONK" does not retrieve "never more than 5% in memecoins" reliably on its own, so every turn adds a second recall for standing rules and positions.
- `@mysten/sui` 2.x: `createAccount` / `addDelegateKey` need an explicit `suiClient: new SuiGrpcClient(...)`.
- The SDK's `serverUrl` defaults to mainnet. Pass the staging URL on testnet.
- `analyze` costs 10 of the 30 rate-limit points per minute per delegate key, so one key allows three learning turns a minute. Users are spread across 4 keys.
- `analyze` returns 0 facts silently when a message has nothing durable (a question), which is correct but looks like a failure in a UI.

## Privacy

Memories are Seal-encrypted on Walrus, but in the default relayer mode the relayer sees plaintext to embed and encrypt it. Never share private keys or seed phrases. Not financial advice.
