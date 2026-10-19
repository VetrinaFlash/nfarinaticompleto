import { confirmOrder, checkoutFailure } from "../_lib/checkout.js";
import { json } from "../_lib/auth.js";
export async function onRequestPost({ env, request }) {
  try {
    const order = await confirmOrder(env, await request.json());
    return json({ ok: true, orderId: order.orderId, order });
  } catch (e) {
    return checkoutFailure(e);
  }
}
