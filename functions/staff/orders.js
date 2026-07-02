// Ordini materie prime lato staff — POST crea ordine, GET lista SOLO i propri ordini
const COOKIE_NAME = 'nfarinati_staff_session';

async function verifyStaffSession(request, secret) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  const token = decodeURIComponent(match[1]);
  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) return null;
  const payload = token.substring(0, lastDot);
  const sig = token.substring(lastDot + 1);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expectedSig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const expectedHex = [...new Uint8Array(expectedSig)].map(b => b.toString(16).padStart(2, '0')).join('');
  if (expectedHex !== sig) return null;
  const parts = payload.split(':'); // staff:<id>:<role>:<ts>
  if (parts[0] !== 'staff' || parts.length !== 4) return null;
  return { id: parseInt(parts[1]), role: parts[2] };
}

const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

export async function onRequestPost(context) {
  const { env, request } = context;
  const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
  const session = await verifyStaffSession(request, secret);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }

  try {
    const body = await request.json();
    const items = Array.isArray(body.items) ? body.items : [];
    const notes = (body.notes || '').toString().slice(0, 1000);

    if (items.length === 0) {
      return new Response(JSON.stringify({ error: 'Ordine vuoto: aggiungi almeno una materia prima' }), { status: 400, headers: cors });
    }

    const cleanItems = [];
    for (const it of items) {
      const materialId = parseInt(it.material_id);
      const quantity = parseFloat(it.quantity);
      const unitPrice = it.unit_price === null || it.unit_price === undefined || it.unit_price === ''
        ? null : parseFloat(it.unit_price);
      if (!materialId || !(quantity > 0)) {
        return new Response(JSON.stringify({ error: 'Riga ordine non valida (materia o quantità mancante)' }), { status: 400, headers: cors });
      }
      if (unitPrice !== null && !(unitPrice >= 0)) {
        return new Response(JSON.stringify({ error: 'Prezzo unitario non valido' }), { status: 400, headers: cors });
      }
      cleanItems.push({ materialId, quantity, unitPrice });
    }

    const orderRes = await env.DB.prepare(
      "INSERT INTO supply_orders (staff_user_id, notes, status, created_at) VALUES (?, ?, 'inviato', datetime('now','localtime'))"
    ).bind(session.id, notes).run();
    const orderId = orderRes.meta.last_row_id;

    const stmt = env.DB.prepare(
      'INSERT INTO supply_order_items (supply_order_id, raw_material_id, quantity, unit_price) VALUES (?, ?, ?, ?)'
    );
    await env.DB.batch(cleanItems.map(it => stmt.bind(orderId, it.materialId, it.quantity, it.unitPrice)));

    return new Response(JSON.stringify({ ok: true, order_id: orderId }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
  const session = await verifyStaffSession(request, secret);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }

  try {
    // Solo gli ordini dell'utente loggato: i due dipendenti non vedono quelli dell'altro
    const orders = await env.DB.prepare(
      'SELECT id, notes, status, created_at, fulfilled_at FROM supply_orders WHERE staff_user_id = ? ORDER BY created_at DESC LIMIT 100'
    ).bind(session.id).all();

    const ids = orders.results.map(o => o.id);
    let itemsByOrder = {};
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      const items = await env.DB.prepare(
        `SELECT i.supply_order_id, i.quantity, i.unit_price, m.name, m.department, m.supplier
         FROM supply_order_items i
         JOIN raw_materials m ON m.id = i.raw_material_id
         WHERE i.supply_order_id IN (${placeholders})
         ORDER BY m.name`
      ).bind(...ids).all();
      for (const it of items.results) {
        (itemsByOrder[it.supply_order_id] = itemsByOrder[it.supply_order_id] || []).push(it);
      }
    }

    const result = orders.results.map(o => ({ ...o, items: itemsByOrder[o.id] || [] }));
    return new Response(JSON.stringify({ orders: result }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
