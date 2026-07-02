// Gestione anagrafica materie prime (solo admin): lista, aggiunta, modifica, disattivazione
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

function validDepartment(d) { return d === 'Pizzeria' || d === 'Cucina'; }

export async function onRequestGet(context) {
  const { env, request } = context;
  const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
  if (!(await isAdminAuthorized(request, secret))) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }
  try {
    const rows = await env.DB.prepare(
      'SELECT id, name, department, supplier, active FROM raw_materials WHERE active = 1 ORDER BY name, department'
    ).all();
    return new Response(JSON.stringify({ materials: rows.results }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
  if (!(await isAdminAuthorized(request, secret))) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }
  try {
    const { name, department, supplier } = await request.json();
    const cleanName = (name || '').toString().trim().toUpperCase().slice(0, 60);
    const cleanSupplier = (supplier || '').toString().trim().slice(0, 60);
    if (!cleanName || !validDepartment(department)) {
      return new Response(JSON.stringify({ error: 'Nome o reparto non validi' }), { status: 400, headers: cors });
    }
    // Se esiste già (anche disattivata) la riattiva aggiornando il fornitore
    await env.DB.prepare(
      'INSERT INTO raw_materials (name, department, supplier, active) VALUES (?, ?, ?, 1) ' +
      'ON CONFLICT(name, department) DO UPDATE SET active = 1, supplier = excluded.supplier'
    ).bind(cleanName, department, cleanSupplier).run();
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
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
    const { id, name, department, supplier } = await request.json();
    const matId = parseInt(id);
    const cleanName = (name || '').toString().trim().toUpperCase().slice(0, 60);
    const cleanSupplier = (supplier || '').toString().trim().slice(0, 60);
    if (!matId || !cleanName || !validDepartment(department)) {
      return new Response(JSON.stringify({ error: 'Dati non validi' }), { status: 400, headers: cors });
    }
    await env.DB.prepare(
      'UPDATE raw_materials SET name = ?, department = ?, supplier = ? WHERE id = ?'
    ).bind(cleanName, department, cleanSupplier, matId).run();
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
  } catch (err) {
    const msg = /UNIQUE/i.test(err.message)
      ? 'Esiste già una materia prima con questo nome e reparto'
      : err.message;
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: cors });
  }
}

// Disattivazione (soft-delete): lo storico ordini resta intatto
export async function onRequestDelete(context) {
  const { env, request } = context;
  const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
  if (!(await isAdminAuthorized(request, secret))) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }
  try {
    const url = new URL(request.url);
    const id = parseInt(url.searchParams.get('id') || '0');
    if (!id) {
      return new Response(JSON.stringify({ error: 'ID mancante' }), { status: 400, headers: cors });
    }
    await env.DB.prepare('UPDATE raw_materials SET active = 0 WHERE id = ?').bind(id).run();
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
