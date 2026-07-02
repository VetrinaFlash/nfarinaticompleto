// Dashboard admin ordini magazzino — GET con filtri, PUT cambio stato (evaso), DELETE
const ADMIN_COOKIE = 'nfarinati_admin_session';
const STAFF_COOKIE = 'nfarinati_staff_session';

async function verifyHmacToken(token, secret) {
  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) return null;
  const payload = token.substring(0, lastDot);
  const sig = token.substring(lastDot + 1);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expectedSig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const expectedHex = [...new Uint8Array(expectedSig)].map(b => b.toString(16).padStart(2, '0')).join('');
  return expectedHex === sig ? payload : null;
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// Autorizzato: admin (sessione esistente) oppure utente staff con role=admin
async function isAdminAuthorized(request, secret) {
  const adminToken = getCookie(request, ADMIN_COOKIE);
  if (adminToken) {
    const payload = await verifyHmacToken(adminToken, secret);
    if (payload && payload.startsWith('admin:')) return true;
  }
  const staffToken = getCookie(request, STAFF_COOKIE);
  if (staffToken) {
    const payload = await verifyHmacToken(staffToken, secret);
    if (payload) {
      const parts = payload.split(':'); // staff:<id>:<role>:<ts>
      if (parts[0] === 'staff' && parts[2] === 'admin') return true;
    }
  }
  return false;
}

const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

export async function onRequestGet(context) {
  const { env, request } = context;
  const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
  if (!(await isAdminAuthorized(request, secret))) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }

  const url = new URL(request.url);

  // Modalità leggera per il badge di notifica nel portale admin
  if (url.searchParams.get('count') === '1') {
    try {
      const row = await env.DB.prepare(
        "SELECT COUNT(*) AS pending FROM supply_orders WHERE status = 'inviato'"
      ).first();
      return new Response(JSON.stringify({ pending: row.pending }), { status: 200, headers: cors });
    } catch (err) {
      // Tabelle non ancora create: nessun ordine in attesa
      return new Response(JSON.stringify({ pending: 0 }), { status: 200, headers: cors });
    }
  }

  const status = url.searchParams.get('status') || '';
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  const userId = url.searchParams.get('user_id') || '';

  let where = '1=1';
  const params = [];
  if (status) { where += ' AND o.status = ?'; params.push(status); }
  if (from) { where += ' AND date(o.created_at) >= ?'; params.push(from); }
  if (to) { where += ' AND date(o.created_at) <= ?'; params.push(to); }
  if (userId) { where += ' AND o.staff_user_id = ?'; params.push(parseInt(userId)); }

  try {
    const orders = await env.DB.prepare(
      `SELECT o.id, o.staff_user_id, o.notes, o.status, o.created_at, o.fulfilled_at,
              u.username, u.display_name
       FROM supply_orders o
       JOIN staff_users u ON u.id = o.staff_user_id
       WHERE ${where}
       ORDER BY o.created_at DESC
       LIMIT 500`
    ).bind(...params).all();

    const ids = orders.results.map(o => o.id);
    let itemsByOrder = {};
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      const items = await env.DB.prepare(
        `SELECT i.supply_order_id, i.quantity, i.unit_price,
                m.id AS material_id, m.name, m.department, m.supplier
         FROM supply_order_items i
         JOIN raw_materials m ON m.id = i.raw_material_id
         WHERE i.supply_order_id IN (${placeholders})
         ORDER BY m.supplier, m.name`
      ).bind(...ids).all();
      for (const it of items.results) {
        (itemsByOrder[it.supply_order_id] = itemsByOrder[it.supply_order_id] || []).push(it);
      }
    }

    const users = await env.DB.prepare(
      'SELECT id, username, display_name, role FROM staff_users WHERE active = 1 ORDER BY display_name'
    ).all();

    const result = orders.results.map(o => ({ ...o, items: itemsByOrder[o.id] || [] }));
    return new Response(JSON.stringify({ orders: result, users: users.results }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestPut(context) {
  const { env, request } = context;
  const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
  if (!(await isAdminAuthorized(request, secret))) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }

  try {
    const { id, status } = await request.json();
    if (!['inviato', 'evaso'].includes(status)) {
      return new Response(JSON.stringify({ error: 'Status non valido' }), { status: 400, headers: cors });
    }
    if (status === 'evaso') {
      await env.DB.prepare(
        "UPDATE supply_orders SET status = 'evaso', fulfilled_at = datetime('now','localtime') WHERE id = ?"
      ).bind(id).run();
    } else {
      await env.DB.prepare(
        "UPDATE supply_orders SET status = 'inviato', fulfilled_at = NULL WHERE id = ?"
      ).bind(id).run();
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestDelete(context) {
  const { env, request } = context;
  const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
  if (!(await isAdminAuthorized(request, secret))) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }

  try {
    const url = new URL(request.url);
    const id = parseInt(url.searchParams.get('id') || '0');
    if (!id) {
      return new Response(JSON.stringify({ error: 'ID mancante' }), { status: 400, headers: cors });
    }
    await env.DB.batch([
      env.DB.prepare('DELETE FROM supply_order_items WHERE supply_order_id = ?').bind(id),
      env.DB.prepare('DELETE FROM supply_orders WHERE id = ?').bind(id),
    ]);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
