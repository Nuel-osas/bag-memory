// Live USD prices for coins mentioned in a message or in recalled memories (CoinGecko public API, no key).
const IDS: Record<string, string> = {
  btc: "bitcoin", bitcoin: "bitcoin", eth: "ethereum", ethereum: "ethereum", sol: "solana", solana: "solana",
  sui: "sui", wal: "walrus-2", walrus: "walrus-2", deep: "deep", ns: "suins-token", cetus: "cetus-protocol",
  bnb: "binancecoin", xrp: "ripple", ada: "cardano", doge: "dogecoin", ton: "the-open-network", trx: "tron",
  avax: "avalanche-2", link: "chainlink", dot: "polkadot", near: "near", apt: "aptos", arb: "arbitrum",
  op: "optimism", sei: "sei-network", tia: "celestia", inj: "injective-protocol", pepe: "pepe", shib: "shiba-inu",
  wif: "dogwifcoin", bonk: "bonk", hype: "hyperliquid", ena: "ethena", pol: "polygon-ecosystem-token",
  usdc: "usd-coin", usdt: "tether",
};

export function mentionedCoins(...texts: string[]) {
  const found = new Set<string>();
  for (const t of texts) for (const w of t.toLowerCase().match(/\$?[a-z]{2,10}/g) ?? []) {
    const k = w.replace("$", "");
    if (IDS[k]) found.add(IDS[k]);
  }
  return [...found].slice(0, 10);
}

export async function prices(ids: string[]): Promise<Record<string, number>> {
  if (!ids.length) return {};
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return {};
    const j: any = await r.json();
    return Object.fromEntries(Object.entries(j).map(([id, v]: [string, any]) => [id, v.usd]));
  } catch {
    return {}; // prices are a bonus; never block a reply on them
  }
}
