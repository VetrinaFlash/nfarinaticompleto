import { adminIdentity } from '../_lib/auth.js';

async function verifySession(request, env) {
  return !!(await adminIdentity(env, request));
}

const cors = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

export async function onRequestGet(context) {
  const { env, request } = context;
  if (!(await verifySession(request, env))) {
    return json({ error: 'Non autorizzato' }, 401);
  }

  const url = new URL(request.url);
  const search = (url.searchParams.get('search') || '').trim().slice(0, 120);
  const customerIdRaw = url.searchParams.get('id') || '';
  const page = Math.max(1, Math.min(100000, parseInt(url.searchParams.get('page') || '1') || 1));
  const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get('limit') || '50') || 50));
  const offset = (page - 1) * limit;

  try {
    if (customerIdRaw) {
      const customerId = Number(customerIdRaw);
      if (!Number.isInteger(customerId) || customerId <= 0) {
        return json({ error: 'ID cliente non valido' }, 400);
      }

      const customer = await env.DB.prepare(
        'SELECT * FROM customers WHERE id = ?'
      ).bind(customerId).first();
      if (!customer) return json({ error: 'Cliente non trovato' }, 404);

      const orders = await env.DB.prepare(
        `SELECT id, pickup_time, total, status, created_at
         FROM orders
         WHERE customer_name = ? AND customer_phone = ?
         ORDER BY created_at DESC
         LIMIT 20`
      ).bind(customer.name, customer.phone || '').all();

      return json({ customer, orders: orders.results || [] });
    }

    let where = '1=1';
    const params = [];
    if (search) {
      where += ' AND (name LIKE ? OR phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const rows = await env.DB.prepare(
      `SELECT * FROM customers WHERE ${where}
       ORDER BY total_spent DESC LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();

    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM customers WHERE ${where}`
    ).bind(...params).first();

    return json({
      customers: rows.results || [],
      total: Number(countRow?.total || 0),
      page,
      limit,
    });
  } catch (err) {
    console.error('Admin customers failed', err?.name, err?.message);
    return json({ error: 'Operazione non riuscita' }, 500);
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
