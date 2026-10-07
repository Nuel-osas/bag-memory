// Exchange a Telegram login or a wallet signature for a session token.
import { post } from "../lib/http.js";
import { issue, verifyTelegram, verifyWallet } from "../lib/session.js";

export default post(async ({ telegram, wallet }) => {
  const id = telegram ? verifyTelegram(telegram) : wallet ? await verifyWallet(wallet.address, wallet.message, wallet.signature) : null;
  if (!id) throw new Error("telegram or wallet required");
  return { token: issue(id.who, id.name), name: id.name, via: id.who.split(":")[0] };
});
