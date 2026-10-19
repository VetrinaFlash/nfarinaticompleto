import { createIntent, checkoutFailure } from "../_lib/checkout.js";
import { json } from "../_lib/auth.js";
export async function onRequestPost({ env, request }) {
  try {
    return json({ ok: true, ...(await createIntent(env, request)) });
  } catch (e) {
    return checkoutFailure(e);
  }
}
