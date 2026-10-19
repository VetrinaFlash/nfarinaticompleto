// Shared order confirmation: only server-confirmed orders are shown as received.
async function confirmPendingOrder() {
  const raw = sessionStorage.getItem("NFARINATI_pending_v2");
  if (!raw)
    throw new Error(
      "Nessun ordine da confermare. Torna al menù o contatta il locale.",
    );
  const pending = JSON.parse(raw);
  const response = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pending),
  });
  const data = await response.json();
  if (!response.ok || !data.ok)
    throw new Error(
      data.error ||
        "Conferma ordine non disponibile. Riprova senza effettuare un altro pagamento.",
    );
  return data.order;
}
function orderWhatsAppText(order) {
  const euro = (value) => Number(value).toFixed(2) + " €";
  return (
    (order.paymentMethod === "carta"
      ? "✅ ORDINE PAGATO ONLINE (SumUp)"
      : "⚠️ ORDINE DA PAGARE IN CONTANTI") +
    "\n\nRif: " +
    order.orderId +
    "\nCliente: " +
    order.customerName +
    "\nTelefono: " +
    order.customerPhone +
    "\n" +
    (order.orderType === "delivery"
      ? "Consegna a domicilio: " + order.deliveryAddress
      : "Ritiro al locale") +
    "\nOrario: " +
    order.pickupTime +
    (order.notes ? "\nNote: " + order.notes : "") +
    "\n\nRIEPILOGO ORDINE:\n" +
    order.items
      .map(
        (it) =>
          it.qty +
          "x " +
          it.name +
          " (" +
          euro(it.price * it.qty) +
          ")" +
          (it.extras ? "\n  ↳ " + it.extras : ""),
      )
      .join("\n") +
    "\n\nSubtotale: " +
    euro(order.subtotal) +
    "\nSconto online 10%: -" +
    euro(order.subtotal * order.discountRate) +
    (order.promoDiscount
      ? "\nPromo " + order.promoCode + ": -" + euro(order.promoDiscount)
      : "") +
    (order.deliveryFee ? "\nConsegna: " + euro(order.deliveryFee) : "") +
    "\nTOTALE: " +
    euro(order.total)
  );
}
