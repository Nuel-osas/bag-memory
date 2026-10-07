import { post } from "../lib/http.js";
import { check } from "../lib/session.js";
import { welcome } from "../lib/journal.js";

export const config = { maxDuration: 60 };
export default post(async ({ token }) => {
  const s = check(token);
  return (await welcome(s.who, s.name)) ?? { text: null };
});
