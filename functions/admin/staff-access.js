import { DEPARTMENTS, ensureWarehouseSchema, getDepartments } from '../_lib/warehouse.js';
import { warehouseIdentity } from '../_lib/warehouse-auth.js';

const headers = {'Content-Type':'application/json', 'Cache-Control':'no-store'};
const json = (body, status=200) => new Response(JSON.stringify(body), {status, headers});

export async function onRequest(context) {
  const {env, request} = context;
  if (!['GET','PUT'].includes(request.method)) return json({error:'Metodo non consentito'},405);
  try {
    // Initialize only on authenticated access. The admin cookie does not depend on D1.
    const identity = await warehouseIdentity(env, request);
    if (!identity || identity.role !== 'admin') return json({error:'Non autorizzato'},403);
    await ensureWarehouseSchema(env);
    if (request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT id, username, display_name, role, active FROM staff_users ORDER BY display_name').all();
      const users = await Promise.all(rows.results.map(async user => ({...user, departments:await getDepartments(env,user)})));
      return json({users, departments:DEPARTMENTS});
    }
    const body = await request.json();
    if (!Number.isInteger(body.id) || !Array.isArray(body.departments) || body.departments.some(d => !DEPARTMENTS.includes(d))) return json({error:'Reparti o utente non validi'},400);
    const user = await env.DB.prepare('SELECT id, role FROM staff_users WHERE id = ?').bind(body.id).first();
    if (!user) return json({error:'Account non trovato'},404);
    if (user.role === 'admin') return json({error:'Gli amministratori mantengono accesso a tutti i reparti'},400);
    const departments = DEPARTMENTS.filter(d => body.departments.includes(d));
    await env.DB.prepare('INSERT INTO staff_visibility (staff_user_id, departments) VALUES (?, ?) ON CONFLICT(staff_user_id) DO UPDATE SET departments = excluded.departments').bind(user.id, JSON.stringify(departments)).run();
    return json({ok:true, departments});
  } catch (err) { return json({error:err.message},500); }
}
