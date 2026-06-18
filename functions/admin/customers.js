// Clienti CRM admin
const COOKIE_NAME = 'nfarinati_admin_session';

async function verifySession(request, secret) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return false;
  const token = decodeURIComponent(match[1]);
  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) return false;
  const payload = token.substring(0, lastDot);
  const sig = token.substring(lastDot + 1);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expectedSig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const expectedHex = [...new Uint8Array(expectedSig)].map(b => b.toString(16).padStart(2, '0')).join('');
  return expectedHex === sig;
}

const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

export async function onRequestGet(context) {
  const { env, request } = context;
  const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
  if (!(await verifySession(request, secret))) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get('search') || '';
  const customerId = url.searchParams.get('id') || '';
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  try {
    // Dettaglio ordini per cliente
    if (customerId) {
      const customer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(customerId).first();
      const orders = await env.DB.prepare(
        "SELECT id, pickup_time, total, status, created_at FROM orders WHERE customer_name = ? ORDER BY created_at DESC LIMIT 20"
      ).bind(customer.name).all();
      return new Response(JSON.stringify({ customer, orders: orders.results }), { status: 200, headers: cors });
    }

    let where = '1=1';
    const params = [];
    if (search) { where += ' AND (name LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

    const rows = await env.DB.prepare(
      `SELECT * FROM customers WHERE ${where} ORDER BY total_spent DESC LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();

    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM customers WHERE ${where}`
    ).bind(...params).first();

    return new Response(JSON.stringify({ customers: rows.results, total: countRow.total, page, limit }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
