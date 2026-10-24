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

const VALID_STATUSES = ['nuovo', 'preparazione', 'pronto', 'consegnato'];

export async function onRequestGet(context) {
  const { env, request } = context;
  if (!(await verifySession(request, env))) {
    return json({ error: 'Non autorizzato' }, 401);
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || '';
  const date = url.searchParams.get('date') || '';
  const since = url.searchParams.get('since') || '';
  const page = Math.max(1, Math.min(100000, parseInt(url.searchParams.get('page') || '1') || 1));
  const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get('limit') || '50') || 50));
  const offset = (page - 1) * limit;

  if (status && !VALID_STATUSES.includes(status)) {
    return json({ error: 'Status non valido' }, 400);
  }
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ error: 'Data non valida' }, 400);
  }

  let where = '1=1';
  const params = [];
  if (status) { where += ' AND status = ?'; params.push(status); }
  if (date) { where += ' AND date(created_at) = ?'; params.push(date); }
  if (since) { where += ' AND created_at > ?'; params.push(since.slice(0, 30)); }

  try {
    const rows = await env.DB.prepare(
      `SELECT * FROM orders WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();

    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM orders WHERE ${where}`
    ).bind(...params).first();

    return json({
      orders: rows.results || [],
      total: Number(countRow?.total || 0),
      page,
      limit,
    });
  } catch (err) {
    console.error('Admin orders GET failed', err?.name, err?.message);
    return json({ error: 'Operazione non riuscita' }, 500);
  }
}

export async function onRequestPut(context) {
  const { env, request } = context;
  if (!(await verifySession(request, env))) {
    return json({ error: 'Non autorizzato' }, 401);
  }

  try {
    const { id, status } = await request.json();
    const orderId = typeof id === 'string' ? id.trim() : String(id ?? '').trim();

    if (!orderId || orderId.length > 160) {
      return json({ error: 'ID ordine non valido' }, 400);
    }
    if (!VALID_STATUSES.includes(status)) {
      return json({ error: 'Status non valido' }, 400);
    }

    const current = await env.DB.prepare(
      'SELECT id FROM orders WHERE id = ?'
    ).bind(orderId).first();
    if (!current) return json({ error: 'Ordine non trovato' }, 404);

    await env.DB.prepare('UPDATE orders SET status = ? WHERE id = ?')
      .bind(status, orderId).run();

    return json({ ok: true, id: orderId, status });
  } catch (err) {
    console.error('Admin orders PUT failed', err?.name, err?.message);
    return json({ error: 'Operazione non riuscita' }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
