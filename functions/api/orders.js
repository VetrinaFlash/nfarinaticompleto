// Salva l'ordine nel DB dopo il pagamento confermato
export async function onRequestPost(context) {
  const { env, request } = context;
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const body = await request.json();
    const {
      orderId,
      customerName,
      customerPhone = '',
      pickupTime,
      orderType = 'takeaway',
      deliveryAddress = '',
      notes = '',
      items = [],
      subtotal = 0,
      discountRate = 0,
      promoCode = '',
      promoDiscount = 0,
      deliveryFee = 0,
      total = 0,
      paymentMethod = 'carta',
    } = body;

    if (!orderId || !customerName || !pickupTime || items.length === 0) {
      return new Response(JSON.stringify({ error: 'Dati ordine incompleti' }), { status: 400, headers: cors });
    }

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    // Salva ordine
    await env.DB.prepare(`
      INSERT OR IGNORE INTO orders
        (id, customer_name, customer_phone, pickup_time, order_type, delivery_address,
         notes, items_json, subtotal, discount_rate, promo_code, promo_discount,
         delivery_fee, total, status, payment_method, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'nuovo',?,?)
    `).bind(
      orderId, customerName, customerPhone, pickupTime, orderType, deliveryAddress,
      notes, JSON.stringify(items), subtotal, discountRate, promoCode, promoDiscount,
      deliveryFee, total, paymentMethod, now
    ).run();

    // Upsert cliente
    const existing = await env.DB.prepare(
      'SELECT id, order_count, total_spent FROM customers WHERE name = ? AND phone = ?'
    ).bind(customerName, customerPhone).first();

    if (existing) {
      await env.DB.prepare(`
        UPDATE customers SET order_count = order_count + 1,
          total_spent = total_spent + ?, last_order_at = ?
        WHERE id = ?
      `).bind(total, now, existing.id).run();
    } else {
      await env.DB.prepare(`
        INSERT INTO customers (name, phone, order_count, total_spent, first_order_at, last_order_at)
        VALUES (?,?,1,?,?,?)
      `).bind(customerName, customerPhone, total, now, now).run();
    }

    return new Response(JSON.stringify({ ok: true, orderId }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
