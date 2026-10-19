import { adminIdentity } from '../_lib/auth.js';
// Gestione ordini admin — GET con filtri + PUT per cambiare status
const COOKIE_NAME = 'nfarinati_admin_session';

async function verifySession(request, env) { return !!(await adminIdentity(env, request)); }

const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

export async function onRequestGet(context) {
  const { env, request } = context;
  const secret = env;
  if (!(await verifySession(request, secret))) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || '';
  const date = url.searchParams.get('date') || '';
  const since = url.searchParams.get('since') || '';
  const page = Math.max(1, Math.min(100000, parseInt(url.searchParams.get('page') || '1') || 1));
  const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get('limit') || '50') || 50));
  const offset = (page - 1) * limit;

  let where = '1=1';
  const params = [];

  if (status) { where += ' AND status = ?'; params.push(status); }
  if (date) { where += ' AND date(created_at) = ?'; params.push(date); }
  if (since) { where += ' AND created_at > ?'; params.push(since); }

  try {
    const rows = await env.DB.prepare(
      `SELECT * FROM orders WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();

    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM orders WHERE ${where}`
    ).bind(...params).first();

    return new Response(JSON.stringify({
      orders: rows.results,
      total: countRow.total,
      page,
      limit,
    }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Operazione non riuscita' }), { status: 500, headers: cors });
  }
}

export async function onRequestPut(context) {
  const { env, request } = context;
  const secret = env;
  if (!(await verifySession(request, secret))) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }

  try {
    const { id, status } = await request.json();
    const validStatuses = ['nuovo', 'preparazione', 'pronto', 'consegnato'];
    if (!validStatuses.includes(status)) {
      return new Response(JSON.stringify({ error: 'Status non valido' }), { status: 400, headers: cors });
    }
    await env.DB.prepare('UPDATE orders SET status = ? WHERE id = ?').bind(status, id).run();
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Operazione non riuscita' }), { status: 500, headers: cors });
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
