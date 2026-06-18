const USERNAME = 'T0R13';
const PASSWORD = 'T0R13';
const COOKIE_NAME = 'nfarinati_admin_session';
const COOKIE_MAX_AGE = 86400 * 7; // 7 giorni

async function createToken(secret) {
  const payload = `admin:${Date.now()}`;
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

export async function onRequestPost(context) {
  const { env, request } = context;

  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const body = await request.json();
    if (body.username !== USERNAME || body.password !== PASSWORD) {
      return new Response(JSON.stringify({ ok: false, error: 'Credenziali errate' }), { status: 401, headers: cors });
    }

    const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
    const token = await createToken(secret);

    const cookieHeader = `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Strict`;

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...cors, 'Set-Cookie': cookieHeader },
    });
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
