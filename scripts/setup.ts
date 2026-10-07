// One-time setup: owner wallet -> MemWal account on testnet -> N delegate keys, written to .env.
//   pnpm setup                 # 1st run makes an owner key and prints its address; fund it, then run again
//   FUND_FROM_ENV=<file> pnpm setup   # optional: fund the owner from another testnet wallet's OWNER_SUI_PRIVATE_KEY
// Several delegate keys spread the per-key rate limit (30 points/min; analyze costs 10).
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { addDelegateKey, createAccount, generateDelegateKey } from "@mysten-incubation/memwal/account";

const ENV = ".env";
const SERVER_URL = "https://relayer-staging.memory.walrus.xyz";
const REGISTRY = "0x736aef9906798fca4460490ccdf8e8502ef170122dc26ecae32111b78c6b42dd";
const DELEGATES = Number(process.env.DELEGATES ?? 4);

const readEnv = (p: string) =>
  existsSync(p)
    ? Object.fromEntries(readFileSync(p, "utf8").split("\n").filter((l) => l.includes("=")).map((l) => l.split(/=(.*)/s).slice(0, 2)))
    : {};
const env: Record<string, string> = readEnv(ENV);
const sui = new SuiGrpcClient({ network: "testnet", baseUrl: "https://fullnode.testnet.sui.io:443" });

if (!env.OWNER_SUI_PRIVATE_KEY) {
  const owner = Ed25519Keypair.generate();
  writeFileSync(ENV, `MEMWAL_SERVER_URL=${SERVER_URL}\nOWNER_SUI_PRIVATE_KEY=${owner.getSecretKey()}\n`, { mode: 0o600 });
  env.OWNER_SUI_PRIVATE_KEY = owner.getSecretKey();
  console.log(`owner ${owner.toSuiAddress()} written to ${ENV}`);
}
const owner = Ed25519Keypair.fromSecretKey(env.OWNER_SUI_PRIVATE_KEY);

if (process.env.FUND_FROM_ENV) {
  const from = Ed25519Keypair.fromSecretKey(readEnv(process.env.FUND_FROM_ENV).OWNER_SUI_PRIVATE_KEY);
  const tx = new Transaction();
  const [c] = tx.splitCoins(tx.gas, [100_000_000]); // 0.1 SUI
  tx.transferObjects([c], owner.toSuiAddress());
  const r: any = await sui.signAndExecuteTransaction({ signer: from, transaction: tx });
  console.log(`funded 0.1 SUI from ${from.toSuiAddress()}: ${r.Transaction?.digest ?? r.digest}`);
  await new Promise((r) => setTimeout(r, 3000));
}

const cfg: any = await (await fetch(`${SERVER_URL}/config`)).json();
const base = { packageId: cfg.packageId, registryId: REGISTRY, suiPrivateKey: env.OWNER_SUI_PRIVATE_KEY, suiNetwork: "testnet", suiClient: sui } as const;

let accountId = env.MEMWAL_ACCOUNT_ID;
if (!accountId) {
  const acct = await createAccount({ ...base });
  accountId = acct.accountId;
  appendFileSync(ENV, `MEMWAL_ACCOUNT_ID=${accountId}\n`);
  console.log(`account ${accountId} (${acct.digest})`);
}

const have = (env.MEMWAL_KEYS ?? "").split(",").filter(Boolean);
const keys = [...have];
while (keys.length < DELEGATES) {
  const d = await generateDelegateKey();
  const add = await addDelegateKey({ ...base, accountId, publicKey: d.publicKey, label: `mentor-${keys.length + 1}` });
  keys.push(d.privateKey);
  console.log(`delegate ${keys.length}: ${d.suiAddress} (${add.digest})`);
}
if (keys.length !== have.length) {
  const text = readFileSync(ENV, "utf8").replace(/^MEMWAL_KEYS=.*\n?/m, "");
  writeFileSync(ENV, `${text}MEMWAL_KEYS=${keys.join(",")}\n`, { mode: 0o600 });
}
console.log(`done: account ${accountId}, ${keys.length} delegate keys, owner ${owner.toSuiAddress()}`);
