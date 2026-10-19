import { ensureWarehouseSchema, DEPARTMENTS } from '../_lib/warehouse.js';
import { warehouseIdentity } from '../_lib/warehouse-auth.js';

const cors = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' };

export async function onRequestGet(context) {
  const { env, request } = context;
  await ensureWarehouseSchema(env);
  const identity = await warehouseIdentity(env, request);
  if (!identity) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }

  try {
    try {
      // Colonna aggiunta dopo il primo rilascio: migrata in corsa sui DB già inizializzati (idempotente)
      await env.DB.prepare('ALTER TABLE raw_materials ADD COLUMN default_price REAL').run();
    } catch (e) { /* colonna già presente */ }
    const departments = identity.role === 'admin' ? DEPARTMENTS : identity.departments;
    const rows = await env.DB.prepare(
      'SELECT id, name, department, supplier, default_price FROM raw_materials WHERE active = 1 ORDER BY name, department'
    ).all();
    return new Response(JSON.stringify({ materials: rows.results.filter(m => departments.includes(m.department)), departments }), { status: 200, headers: cors });
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
