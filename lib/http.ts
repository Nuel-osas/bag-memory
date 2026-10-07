import type { VercelRequest, VercelResponse } from "@vercel/node";

// Wraps a JSON POST handler: parses the body, maps thrown errors to 4xx/5xx.
export function post(fn: (body: any) => Promise<unknown>) {
  return async (req: VercelRequest, res: VercelResponse) => {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {});
      res.status(200).json(await fn(body));
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      console.error(req.url, msg);
      res.status(/passphrase|characters|required|signed in|verified|expired|stale|match|telegram or wallet/.test(msg) ? 400 : 500).json({ error: msg });
    }
  };
}
