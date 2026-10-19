import { adminIdentity } from '../_lib/auth.js';
// CRUD promo code admin
const COOKIE_NAME = 'nfarinati_admin_session';

async function verifySession(request, env) { return !!(await adminIdentity(env, request)); }

const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

export async function onRequestGet(context) {
  const { env, request } = context;
  const secret = env;
  if (!(await verifySession(request, secret))) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }

  try {
    const rows = await env.DB.prepare('SELECT * FROM promo_codes ORDER BY id DESC').all();
    return new Response(JSON.stringify({ promoCodes: rows.results }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Operazione non riuscita' }), { status: 500, headers: cors });
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const secret = env;
  if (!(await verifySession(request, secret))) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }

  try {
    const body = await request.json();
    const { action } = body;
    if (['create','update'].includes(action) && (typeof body.code !== 'string' || !body.code.trim() || body.code.length > 80 || !['percentage','fixed'].includes(body.type) || !Number.isFinite(Number(body.value)) || Number(body.value) < 0 || Number(body.value) > (body.type === 'percentage' ? 100 : 100000))) {
      return new Response(JSON.stringify({error:'Codice o valore non valido'}),{status:400,headers:cors});
    }

    if (action === 'create') {
      const { code, type, value, active } = body;
      if (!code || !type || value === undefined) {
        return new Response(JSON.stringify({ error: 'code, type e value obbligatori' }), { status: 400, headers: cors });
      }
      if (!['percentage', 'fixed'].includes(type)) {
        return new Response(JSON.stringify({ error: 'type deve essere percentage o fixed' }), { status: 400, headers: cors });
      }
      const result = await env.DB.prepare(
        'INSERT INTO promo_codes (code, type, value, active) VALUES (?,?,?,?)'
      ).bind(code.toUpperCase(), type, value, active !== false ? 1 : 0).run();
      return new Response(JSON.stringify({ ok: true, id: result.meta.last_row_id }), { status: 200, headers: cors });
    }

    if (action === 'update') {
      const { id, code, type, value, active } = body;
      await env.DB.prepare('UPDATE promo_codes SET code=?, type=?, value=?, active=? WHERE id=?')
        .bind(code.toUpperCase(), type, value, active ? 1 : 0, id).run();
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
    }

    if (action === 'delete') {
      await env.DB.prepare('DELETE FROM promo_codes WHERE id = ?').bind(body.id).run();
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
    }

    return new Response(JSON.stringify({ error: 'Azione non valida' }), { status: 400, headers: cors });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return new Response(JSON.stringify({ error: 'Codice già esistente' }), { status: 409, headers: cors });
    }
    return new Response(JSON.stringify({ error: 'Operazione non riuscita' }), { status: 500, headers: cors });
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
