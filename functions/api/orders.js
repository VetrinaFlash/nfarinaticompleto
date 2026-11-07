import { confirmOrder, checkoutFailure } from "../_lib/checkout.js";
import { json } from "../_lib/auth.js";
import { runPendingPush } from "../_lib/push.js";
export async function onRequestPost(context) {
  const {env,request}=context;
  try {
    const origin=new URL(request.url).origin;
    const order=await confirmOrder(env,await request.json(),origin);
    const task=runPendingPush(env,origin).catch(e=>console.error("Order push dispatch",e?.name));
    if(context.waitUntil)context.waitUntil(task);else await task;
    return json({ ok: true, orderId: order.orderId, order });
  } catch (e) {
    return checkoutFailure(e);
  }
}
