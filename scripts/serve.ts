// Run the web app's Vercel handlers locally (wallet login; Telegram needs a public URL), no Vercel account needed:  pnpm start  ->  http://localhost:3000
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import auth from "../api/auth.js";
import chat from "../api/chat.js";
import config from "../api/config.js";
import learn from "../api/learn.js";
import memories from "../api/memories.js";
import stats from "../api/stats.js";
import welcome from "../api/welcome.js";

const routes: Record<string, (req: any, res: any) => unknown> = { auth, chat, config, learn, memories, stats, welcome };
const PORT = Number(process.env.PORT ?? 3000);

createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://x").pathname;
  if (path === "/" || path === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(readFileSync(new URL("../public/index.html", import.meta.url)));
  }
  const handler = routes[path.replace(/^\/api\//, "")];
  if (!handler) return res.writeHead(404).end();
  let raw = "";
  for await (const chunk of req) raw += chunk;
  // Minimal VercelRequest/VercelResponse shim: body, status().json(), setHeader().
  const vreq = Object.assign(req, { body: raw ? JSON.parse(raw) : {} });
  const vres = Object.assign(res, {
    status(code: number) { res.statusCode = code; return vres; },
    send(body: string) { res.end(body); return vres; },
    json(obj: unknown) { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(obj)); return vres; },
  });
  await handler(vreq, vres);
}).listen(PORT, () => console.log(`SuiHub Mentor on http://localhost:${PORT}`));
