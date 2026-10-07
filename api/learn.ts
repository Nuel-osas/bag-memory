import { post } from "../lib/http.js";
import { check } from "../lib/session.js";
import { learn } from "../lib/journal.js";

export const config = { maxDuration: 60 };
export default post(async ({ token, message }) => ({ facts: await learn(check(token).who, String(message ?? "")) }));
