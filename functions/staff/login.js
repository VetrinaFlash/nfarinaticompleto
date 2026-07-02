// Login staff magazzino — account individuali su tabella staff_users (D1)
const COOKIE_NAME = 'nfarinati_staff_session';
const COOKIE_MAX_AGE = 86400 * 7; // 7 giorni

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function createToken(secret, userId, role) {
  const payload = `staff:${userId}:${role}:${Date.now()}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const sigHex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${payload}.${sigHex}`;
}

const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

export async function onRequestPost(context) {
  const { env, request } = context;

  try {
    const body = await request.json();
    const username = (body.username || '').trim().toUpperCase();
    const password = body.password || '';

    if (!username || !password) {
      return new Response(JSON.stringify({ ok: false, error: 'Inserisci username e password' }), { status: 400, headers: cors });
    }

    const user = await env.DB.prepare(
      'SELECT id, username, password_hash, display_name, role FROM staff_users WHERE username = ? AND active = 1'
    ).bind(username).first();

    const expectedHash = await sha256Hex(`nfarinati-staff:${username}:${password}`);
    if (!user || user.password_hash !== expectedHash) {
      return new Response(JSON.stringify({ ok: false, error: 'Credenziali errate' }), { status: 401, headers: cors });
    }

    const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
    const token = await createToken(secret, user.id, user.role);
    const cookieHeader = `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Strict`;

    return new Response(JSON.stringify({
      ok: true,
      user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role },
    }), { status: 200, headers: { ...cors, 'Set-Cookie': cookieHeader } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers: cors });
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
