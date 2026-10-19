import { adminIdentity } from '../_lib/auth.js';
import { DEPARTMENTS, ensureWarehouseSchema } from '../_lib/warehouse.js';

// Gestione anagrafica materie prime (solo admin): lista, aggiunta, modifica, disattivazione
const ADMIN_COOKIE = 'nfarinati_admin_session';
const STAFF_COOKIE = 'nfarinati_staff_session';

async function isAdminAuthorized(request, env) { return !!(await adminIdentity(env, request)); }

const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

function validDepartment(d) { return DEPARTMENTS.includes(d); }

// Colonna aggiunta dopo il primo rilascio: migrata in corsa sui DB già inizializzati (idempotente)
async function migrateSchema(env) {
  await ensureWarehouseSchema(env);
  try { await env.DB.prepare('ALTER TABLE raw_materials ADD COLUMN default_price REAL').run(); } catch (e) { /* colonna già presente */ }
}

// Prezzo di riferimento opzionale: null/vuoto per rimuoverlo, altrimenti numero >= 0
function parsePrice(raw) {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1000000) return { ok: false };
  return { ok: true, value: n };
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const secret = env;
  if (!(await isAdminAuthorized(request, secret))) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }
  try {
    await migrateSchema(env);
    const rows = await env.DB.prepare(
      'SELECT id, name, department, supplier, default_price, active FROM raw_materials WHERE active = 1 ORDER BY name, department'
    ).all();
    return new Response(JSON.stringify({ materials: rows.results }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Operazione non riuscita' }), { status: 500, headers: cors });
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const secret = env;
  if (!(await isAdminAuthorized(request, secret))) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }
  try {
    await migrateSchema(env);
    const { name, department, supplier, default_price } = await request.json();
    const cleanName = (name || '').toString().trim().toUpperCase().slice(0, 60);
    const cleanSupplier = (supplier || '').toString().trim().slice(0, 60);
    const price = parsePrice(default_price);
    if (!cleanName || !validDepartment(department)) {
      return new Response(JSON.stringify({ error: 'Nome o reparto non validi' }), { status: 400, headers: cors });
    }
    if (!price.ok) {
      return new Response(JSON.stringify({ error: 'Prezzo di riferimento non valido' }), { status: 400, headers: cors });
    }
    // Se esiste già (anche disattivata) la riattiva aggiornando fornitore e prezzo
    await env.DB.prepare(
      'INSERT INTO raw_materials (name, department, supplier, default_price, active) VALUES (?, ?, ?, ?, 1) ' +
      'ON CONFLICT(name, department) DO UPDATE SET active = 1, supplier = excluded.supplier, default_price = excluded.default_price'
    ).bind(cleanName, department, cleanSupplier, price.value).run();
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Operazione non riuscita' }), { status: 500, headers: cors });
  }
}

export async function onRequestPut(context) {
  const { env, request } = context;
  const secret = env;
  if (!(await isAdminAuthorized(request, secret))) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }
  try {
    await migrateSchema(env);
    const { id, name, department, supplier, default_price } = await request.json();
    const matId = parseInt(id);
    const cleanName = (name || '').toString().trim().toUpperCase().slice(0, 60);
    const cleanSupplier = (supplier || '').toString().trim().slice(0, 60);
    const price = parsePrice(default_price);
    if (!matId || !cleanName || !validDepartment(department)) {
      return new Response(JSON.stringify({ error: 'Dati non validi' }), { status: 400, headers: cors });
    }
    if (!price.ok) {
      return new Response(JSON.stringify({ error: 'Prezzo di riferimento non valido' }), { status: 400, headers: cors });
    }
    await env.DB.prepare(
      'UPDATE raw_materials SET name = ?, department = ?, supplier = ?, default_price = ? WHERE id = ?'
    ).bind(cleanName, department, cleanSupplier, price.value, matId).run();
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
  const secret = env;
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
    return new Response(JSON.stringify({ error: 'Operazione non riuscita' }), { status: 500, headers: cors });
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
