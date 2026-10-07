// Public evidence: how many users, how many memories each. Namespaces are hashes, so nothing personal leaks.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { namespaceCounts } from "../lib/memory.js";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const users = await namespaceCounts();
    res.setHeader("cache-control", "s-maxage=30");
    res.json({
      users: users.length,
      totalMemories: users.reduce((s, u) => s + u.memories, 0),
      usersWith10Plus: users.filter((u) => u.memories >= 10).length,
      perUser: users.map((u, i) => ({ user: `user ${i + 1}`, id: u.namespace.slice(4, 10), memories: u.memories, lastActive: u.updated_at })),
    });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e) });
  }
}
