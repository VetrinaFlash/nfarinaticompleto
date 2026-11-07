import {
  ensureCheckout,
  finalizeIntent,
  checkoutFailure,
} from "../_lib/checkout.js";
import { json } from "../_lib/auth.js";
import { runPendingPush } from "../_lib/push.js";
export async function onRequestPost(context) {
  const {env,request}=context;
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
    const origin=new URL(request.url).origin;
    await finalizeIntent(env,intent,origin);
    const task=runPendingPush(env,origin).catch(e=>console.error("Payment push dispatch",e?.name));
    if(context.waitUntil)context.waitUntil(task);else await task;
    return new Response(null, { status: 204 });
  } catch (e) {
    return checkoutFailure(e);
  }
}
