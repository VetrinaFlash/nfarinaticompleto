// Anagrafica fornitori magazzino — GET lista (auto-crea/sincronizza da raw_materials), PUT aggiorna WhatsApp
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
      const parts = payload.split(':');
      if (parts[0] === 'staff' && parts[2] === 'admin') return true;
    }
  }
  return false;
}

const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

// Crea la tabella se manca e importa i fornitori presenti in raw_materials (idempotente)
async function ensureSuppliers(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    whatsapp TEXT DEFAULT '',
    active INTEGER DEFAULT 1
  )`).run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO suppliers (name) SELECT DISTINCT supplier FROM raw_materials WHERE supplier != ''"
  ).run();
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
  if (!(await isAdminAuthorized(request, secret))) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }

  try {
    await ensureSuppliers(env);
    const rows = await env.DB.prepare(
      'SELECT id, name, whatsapp FROM suppliers WHERE active = 1 ORDER BY name'
    ).all();
    return new Response(JSON.stringify({ suppliers: rows.results }), { status: 200, headers: cors });
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
    const { name, whatsapp } = await request.json();
    if (!name) {
      return new Response(JSON.stringify({ error: 'Nome fornitore mancante' }), { status: 400, headers: cors });
    }
    // Salva solo cifre e + per il numero WhatsApp
    const clean = (whatsapp || '').toString().replace(/[^\d+]/g, '').slice(0, 20);
    await ensureSuppliers(env);
    await env.DB.prepare('UPDATE suppliers SET whatsapp = ? WHERE name = ?').bind(clean, name).run();
    return new Response(JSON.stringify({ ok: true, whatsapp: clean }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
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
