import { adminIdentity } from '../_lib/auth.js';
// Impostazioni sistema admin (GET e POST)
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
    const rows = await env.DB.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    for (const row of rows.results) settings[row.key] = row.value;
    return new Response(JSON.stringify(settings), { status: 200, headers: cors });
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
    // body è un oggetto { key: value, ... }
    for (const [key, value] of Object.entries(body)) {
      const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').bind(key, strValue).run();
    }
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
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
