import { json, randomToken, sha256 } from "./auth.js";
import { menuPrices } from "./menu-prices.js";
export class CheckoutError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const text = (value, name, max = 200, required = false) => {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new CheckoutError(name + " non valido");
  return value.trim();
};
const money = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100000)
    throw new CheckoutError("Prezzo non valido");
  return Math.round(n * 100);
};
const parse = (v, fallback) => {
  try {
    return JSON.parse(v || JSON.stringify(fallback));
  } catch {
    throw new CheckoutError("Configurazione prodotto non valida", 503);
  }
};
export async function ensureCheckout(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS checkout_intents (id TEXT PRIMARY KEY,access_hash TEXT NOT NULL,payload_json TEXT NOT NULL,checkout_id TEXT UNIQUE,total_cents INTEGER NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,finalized_at INTEGER)`,
  ).run();
}
export async function priceOrder(env, body) {
  if (
    !body ||
    !Array.isArray(body.items) ||
    !body.items.length ||
    body.items.length > 60
  )
    throw new CheckoutError("Carrello non valido");
  const settings = (
    await env.DB.prepare(
      "SELECT key,value FROM settings WHERE key IN ('locale_chiuso','weekly_closure_days')",
    ).all()
  ).results;
  const config = Object.fromEntries(settings.map((r) => [r.key, r.value]));
  if (["1", "true"].includes(String(config.locale_chiuso)))
    throw new CheckoutError("Il locale è attualmente chiuso");
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Rome",
      weekday: "short",
    }).format(new Date()),
  );
  if (config.weekly_closure_days) {
    let days;
    try {
      days = JSON.parse(config.weekly_closure_days);
    } catch {
      days = [];
    }
    if (Array.isArray(days) && days.map(Number).includes(day))
      throw new CheckoutError("Oggi il locale è chiuso");
  }
  const customerName = text(body.customerName, "Nome", 120, true),
    customerPhone = text(body.customerPhone, "Telefono", 30, true),
    pickupTime = text(body.pickupTime, "Orario", 5, true);
  if (
    !/^[+\d() .-]{5,30}$/.test(customerPhone) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(pickupTime)
  )
    throw new CheckoutError("Telefono o orario non valido");
  if (
    !["takeaway", "delivery"].includes(body.orderType) ||
    !["carta", "contanti"].includes(body.paymentMethod)
  )
    throw new CheckoutError("Tipo ordine o pagamento non valido");
  const deliveryAddress = text(
      body.deliveryAddress || "",
      "Indirizzo",
      250,
      body.orderType === "delivery",
    ),
    notes = text(body.notes || "", "Note", 1000);
  const items = [];
  let subtotalCents = 0,
    totalQuantity = 0;
  for (const line of body.items) {
    if (
      !Number.isInteger(line.productId) ||
      !Number.isInteger(line.qty) ||
      line.qty < 1 ||
      line.qty > 50
    )
      throw new CheckoutError("Prodotto o quantità non validi");
    totalQuantity += line.qty;
    if (totalQuantity > 100)
      throw new CheckoutError("Quantità massima superata");
    const p = await env.DB.prepare(
      "SELECT p.* FROM products p JOIN categories c ON c.id=p.category_id WHERE p.id=? AND p.active=1 AND c.active=1",
    )
      .bind(line.productId)
      .first();
    if (!p)
      throw new CheckoutError(
        "Un prodotto non è più disponibile. Aggiorna il menù.",
      );
    const variants = menuPrices(p.price, p.prezzi_json).prices;
    const selections = line.selections || {},
      multi = line.multi || {};
    if (
      typeof selections !== "object" ||
      Array.isArray(selections) ||
      typeof multi !== "object" ||
      Array.isArray(multi)
    )
      throw new CheckoutError("Scelte non valide");
    let index = 0;
    if (variants.length > 1) {
      index = variants.findIndex((v) => v.variante === selections.variante);
      if (index < 0) throw new CheckoutError("Seleziona il formato");
    }
    let cents = money(variants[index].prezzo);
    const extras = [];
    if (variants.length > 1) extras.push(variants[index].variante);
    const required = parse(p.options_json, {}),
      multiple = parse(p.multi_options_json, {});
    if (
      Object.keys(selections).some(
        (k) => k !== "variante" && !Object.hasOwn(required, k),
      ) ||
      Object.keys(multi).some((k) => !Object.hasOwn(multiple, k))
    )
      throw new CheckoutError("Scelta sconosciuta");
    for (const [group, options] of Object.entries(required)) {
      const option = options.find((o) => o.valore === selections[group]);
      if (!option) throw new CheckoutError("Seleziona " + group);
      cents += money(option.supplemento || 0);
      extras.push(group + ": " + option.valore);
    }
    for (const [group, options] of Object.entries(multiple)) {
      const values = multi[group];
      if (
        !Array.isArray(values) ||
        !values.length ||
        new Set(values).size !== values.length ||
        values.length > options.length ||
        (group === "Salse" && values.length > 2)
      )
        throw new CheckoutError("Seleziona " + group);
      for (const value of values) {
        const option = options.find((o) => o.valore === value);
        if (!option) throw new CheckoutError("Scelta non valida");
        cents += money(option.supplemento || 0);
        extras.push(group + ": " + option.valore);
      }
    }
    if (line.removed !== undefined) {
      if (!Array.isArray(line.removed) || line.removed.length > 25)
        throw new CheckoutError("Rimozioni non valide");
      for (const ingredient of line.removed)
        extras.push("SENZA: " + text(ingredient, "Ingrediente", 120, true));
    }
    items.push({
      productId: p.id,
      name: p.name,
      qty: line.qty,
      price: cents / 100,
      extras: extras.join("; "),
    });
    subtotalCents += cents * line.qty;
  }
  const discountCents = Math.round(subtotalCents * 0.1);
  let promoCents = 0,
    promoCode = "";
  if (body.promoCode) {
    promoCode = text(body.promoCode, "Codice promo", 80).toUpperCase();
    const promo = await env.DB.prepare(
      "SELECT type,value FROM promo_codes WHERE code=? AND active=1",
    )
      .bind(promoCode)
      .first();
    if (!promo) throw new CheckoutError("Codice promozionale non valido");
    if (promo.type === "percentage") {
      if (
        !Number.isFinite(Number(promo.value)) ||
        Number(promo.value) < 0 ||
        Number(promo.value) > 100
      )
        throw new CheckoutError("Codice promozionale non valido");
      promoCents = Math.round((subtotalCents * Number(promo.value)) / 100);
    } else promoCents = money(promo.value);
    promoCents = Math.min(promoCents, subtotalCents - discountCents);
  }
  const deliveryCents = body.orderType === "delivery" ? 250 : 0,
    totalCents = subtotalCents - discountCents - promoCents + deliveryCents;
  if (
    !Number.isSafeInteger(totalCents) ||
    totalCents < 100 ||
    totalCents > 100000
  )
    throw new CheckoutError(
      "Totale ordine non valido (minimo 1 €, massimo 1.000 €)",
    );
  return {
    customerName,
    customerPhone,
    pickupTime,
    orderType: body.orderType,
    deliveryAddress,
    notes,
    items,
    subtotal: subtotalCents / 100,
    discountRate: 0.1,
    promoCode,
    promoDiscount: promoCents / 100,
    deliveryFee: deliveryCents / 100,
    total: totalCents / 100,
    paymentMethod: body.paymentMethod,
  };
}
export async function createIntent(env, request) {
  const body = await request.json(),
    order = await priceOrder(env, body);
  await ensureCheckout(env);
  const id = "NFAR-" + crypto.randomUUID(),
    token = randomToken(),
    now = Date.now();
  order.orderId = id;
  await env.DB.prepare(
    "INSERT INTO checkout_intents(id,access_hash,payload_json,total_cents,created_at,expires_at) VALUES(?,?,?,?,?,?)",
  )
    .bind(
      id,
      await sha256(token),
      JSON.stringify(order),
      Math.round(order.total * 100),
      now,
      now + 86400000,
    )
    .run();
  let checkoutId;
  if (order.paymentMethod === "carta") {
    if (!env.SUMUP_SECRET_KEY || !env.SUMUP_EMAIL)
      throw new CheckoutError(
        "Pagamento online temporaneamente non disponibile",
        503,
      );
    const r = await fetch("https://api.sumup.com/v0.1/checkouts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SUMUP_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        checkout_reference: id,
        amount: order.total,
        currency: "EUR",
        pay_to_email: env.SUMUP_EMAIL,
        description: "Ordine N'farinati Modern Pizza",
        ...(env.SUMUP_MERCHANT_CODE
          ? { merchant_code: env.SUMUP_MERCHANT_CODE }
          : {}),
        redirect_url: new URL("/successo.html", request.url).href,
        return_url: new URL("/api/payment-notification", request.url).href,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok)
      throw new CheckoutError(
        "Impossibile avviare il pagamento. Riprova.",
        502,
      );
    const data = await r.json();
    if (typeof data.id !== "string" || data.id.length > 120)
      throw new CheckoutError("Risposta pagamento non valida", 502);
    checkoutId = data.id;
    await env.DB.prepare("UPDATE checkout_intents SET checkout_id=? WHERE id=?")
      .bind(checkoutId, id)
      .run();
  }
  return {
    orderId: id,
    orderToken: token,
    checkoutId,
    order,
    ...(env.GOOGLE_PAY_MERCHANT_ID
      ? { googlePayMerchantId: env.GOOGLE_PAY_MERCHANT_ID }
      : {}),
  };
}
export async function verifyPaid(env, intent) {
  if (!intent.checkout_id || !env.SUMUP_SECRET_KEY)
    throw new CheckoutError("Pagamento non confermato", 409);
  const r = await fetch(
    "https://api.sumup.com/v0.1/checkouts/" +
      encodeURIComponent(intent.checkout_id),
    {
      headers: { Authorization: `Bearer ${env.SUMUP_SECRET_KEY}` },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!r.ok)
    throw new CheckoutError(
      "Verifica pagamento temporaneamente non disponibile",
      502,
    );
  const data = await r.json();
  if (
    data.id !== intent.checkout_id ||
    data.checkout_reference !== intent.id ||
    data.currency !== "EUR" ||
    Math.round(Number(data.amount) * 100) !== intent.total_cents ||
    data.status !== "PAID"
  )
    throw new CheckoutError("Pagamento non ancora confermato", 409);
  if (
    data.pay_to_email &&
    data.pay_to_email.toLowerCase() !== String(env.SUMUP_EMAIL).toLowerCase()
  )
    throw new CheckoutError("Destinatario pagamento non valido", 409);
  if (
    !Array.isArray(data.transactions) ||
    !data.transactions.some(
      (t) =>
        t.status === "SUCCESSFUL" &&
        t.currency === "EUR" &&
        Math.round(Number(t.amount) * 100) === intent.total_cents,
    )
  )
    throw new CheckoutError("Transazione non confermata", 409);
}
export async function finalizeIntent(env, intent) {
  const order = JSON.parse(intent.payload_json);
  if (intent.finalized_at) return order;
  if (order.paymentMethod === "carta") await verifyPaid(env, intent);
  const now = new Date().toISOString().slice(0, 19).replace("T", " "),
    guard =
      "EXISTS (SELECT 1 FROM checkout_intents WHERE id=? AND finalized_at IS NULL)";
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO orders(id,customer_name,customer_phone,pickup_time,order_type,delivery_address,notes,items_json,subtotal,discount_rate,promo_code,promo_discount,delivery_fee,total,status,payment_method,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,'nuovo',?,? WHERE ${guard}`,
    ).bind(
      order.orderId,
      order.customerName,
      order.customerPhone,
      order.pickupTime,
      order.orderType,
      order.deliveryAddress,
      order.notes,
      JSON.stringify(order.items),
      order.subtotal,
      order.discountRate,
      order.promoCode,
      order.promoDiscount,
      order.deliveryFee,
      order.total,
      order.paymentMethod,
      now,
      intent.id,
    ),
    env.DB.prepare(
      `UPDATE customers SET order_count=order_count+1,total_spent=total_spent+?,last_order_at=? WHERE id=(SELECT id FROM customers WHERE name=? AND phone=? ORDER BY id LIMIT 1) AND ${guard}`,
    ).bind(
      order.total,
      now,
      order.customerName,
      order.customerPhone,
      intent.id,
    ),
    env.DB.prepare(
      `INSERT INTO customers(name,phone,order_count,total_spent,first_order_at,last_order_at) SELECT ?,?,1,?,?,? WHERE NOT EXISTS(SELECT 1 FROM customers WHERE name=? AND phone=?) AND ${guard}`,
    ).bind(
      order.customerName,
      order.customerPhone,
      order.total,
      now,
      now,
      order.customerName,
      order.customerPhone,
      intent.id,
    ),
    env.DB.prepare(
      "UPDATE checkout_intents SET finalized_at=? WHERE id=? AND finalized_at IS NULL",
    ).bind(Date.now(), intent.id),
  ]);
  return order;
}
export async function confirmOrder(env, body) {
  await ensureCheckout(env);
  if (
    typeof body.orderId !== "string" ||
    typeof body.orderToken !== "string" ||
    !/^[a-f0-9]{64}$/.test(body.orderToken)
  )
    throw new CheckoutError("Riferimento ordine non valido", 400);
  const intent = await env.DB.prepare(
    "SELECT * FROM checkout_intents WHERE id=? AND access_hash=?",
  )
    .bind(body.orderId, await sha256(body.orderToken))
    .first();
  if (!intent) throw new CheckoutError("Ordine non trovato", 404);
  if (intent.expires_at < Date.now() && !intent.finalized_at)
    throw new CheckoutError("Ordine scaduto", 410);
  return finalizeIntent(env, intent);
}
export function checkoutFailure(error) {
  console.error("Checkout failure", error?.name);
  return json(
    {
      ok: false,
      error:
        error instanceof CheckoutError
          ? error.message
          : "Operazione non riuscita. Riprova.",
    },
    error instanceof CheckoutError ? error.status : 500,
  );
}
