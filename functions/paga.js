import { onRequestPost as checkout } from "./api/checkout.js";
import { json } from "./_lib/auth.js";
export async function onRequestPost(context) {
  const body = await context.request.clone().json();
  if (!body.customerName)
    return json(
      {
        error:
          "Il menù è stato aggiornato. Ricarica la pagina prima di ordinare.",
      },
      426,
    );
  return checkout(context);
}
