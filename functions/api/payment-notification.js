import {
  ensureCheckout,
  finalizeIntent,
  checkoutFailure,
} from "../_lib/checkout.js";
import { json } from "../_lib/auth.js";
export async function onRequestPost({ env, request }) {
  try {
    const body = await request.json();
    if (body.event_type !== "CHECKOUT_STATUS_CHANGED")
      return new Response(null, { status: 204 });
    if (typeof body.id !== "string" || body.id.length > 120)
      return json({ error: "Notifica non valida" }, 400);
    await ensureCheckout(env);
    const intent = await env.DB.prepare(
      "SELECT * FROM checkout_intents WHERE checkout_id=?",
    )
      .bind(body.id)
      .first();
    if (!intent) return new Response(null, { status: 204 });
    await finalizeIntent(env, intent);
    return new Response(null, { status: 204 });
  } catch (e) {
    return checkoutFailure(e);
  }
}
