// CRUD promo code admin
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

  try {
    const rows = await env.DB.prepare('SELECT * FROM promo_codes ORDER BY id DESC').all();
    return new Response(JSON.stringify({ promoCodes: rows.results }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
  if (!(await verifySession(request, secret))) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }

  try {
    const body = await request.json();
    const { action } = body;

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
