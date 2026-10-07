import { post } from "../lib/http.js";
import { check } from "../lib/session.js";
import { allMemories, identify } from "../lib/memory.js";

export const config = { maxDuration: 60 };
export default post(async ({ token }) => {
  const { namespace, keyIndex } = identify(check(token).who);
  const mems = await allMemories(keyIndex, namespace);
  return { memories: mems.map((m) => ({ text: m.text, created_at: m.created_at, blob_id: m.blob_id })) };
});
