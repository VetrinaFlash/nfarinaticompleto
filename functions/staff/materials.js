// Catalogo materie prime — accessibile a staff loggato o admin
const STAFF_COOKIE = 'nfarinati_staff_session';
const ADMIN_COOKIE = 'nfarinati_admin_session';

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

async function isAuthorized(request, secret) {
  const staffToken = getCookie(request, STAFF_COOKIE);
  if (staffToken) {
    const payload = await verifyHmacToken(staffToken, secret);
    if (payload && payload.startsWith('staff:')) return true;
  }
  const adminToken = getCookie(request, ADMIN_COOKIE);
  if (adminToken) {
    const payload = await verifyHmacToken(adminToken, secret);
    if (payload && payload.startsWith('admin:')) return true;
  }
  return false;
}

const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

export async function onRequestGet(context) {
  const { env, request } = context;
  const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
  if (!(await isAuthorized(request, secret))) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }

  try {
    try {
      // Colonna aggiunta dopo il primo rilascio: migrata in corsa sui DB già inizializzati (idempotente)
      await env.DB.prepare('ALTER TABLE raw_materials ADD COLUMN default_price REAL').run();
    } catch (e) { /* colonna già presente */ }
    const rows = await env.DB.prepare(
      'SELECT id, name, department, supplier, default_price FROM raw_materials WHERE active = 1 ORDER BY name, department'
    ).all();
    return new Response(JSON.stringify({ materials: rows.results }), { status: 200, headers: cors });
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
