// Valida un promo code e restituisce il tipo e il valore dello sconto
export async function onRequestPost(context) {
  const { env, request } = context;
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const { code, subtotal } = await request.json();

    if (!code || !code.trim()) {
      return new Response(JSON.stringify({ valid: false, error: 'Codice non inserito' }), { status: 400, headers: cors });
    }

    const promo = await env.DB.prepare(
      'SELECT * FROM promo_codes WHERE code = ? AND active = 1'
    ).bind(code.trim().toUpperCase()).first();

    if (!promo) {
      return new Response(JSON.stringify({ valid: false, error: 'Codice non valido o scaduto' }), { status: 200, headers: cors });
    }

    let discountAmount = 0;
    const sub = parseFloat(subtotal) || 0;

    if (promo.type === 'percentage') {
      discountAmount = Math.round(sub * (promo.value / 100) * 100) / 100;
    } else {
      discountAmount = Math.min(promo.value, sub);
    }

    return new Response(JSON.stringify({
      valid: true,
      code: promo.code,
      type: promo.type,
      value: promo.value,
      discountAmount,
    }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ valid: false, error: err.message }), { status: 500, headers: cors });
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
