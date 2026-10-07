import { post } from "../lib/http.js";
import { check } from "../lib/session.js";
import { turn } from "../lib/journal.js";

export const config = { maxDuration: 60 };
export default post(async ({ token, message, history = [], memory = true }) => {
  const { who } = check(token);
  if (!String(message ?? "").trim()) throw new Error("message required");
  return turn(who, String(message), history, memory !== false);
});
