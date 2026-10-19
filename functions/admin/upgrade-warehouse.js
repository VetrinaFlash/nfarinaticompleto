import {ensureWarehouseSchema, MIGRATION} from '../_lib/warehouse.js';
import {warehouseIdentity} from '../_lib/warehouse-auth.js';

export async function onRequestPost({env, request}) {
  const headers = {'Content-Type':'application/json', 'Cache-Control':'no-store'};
  try {
    const identity = await warehouseIdentity(env, request);
    if (!identity || identity.role !== 'admin') return new Response(JSON.stringify({error:'Non autorizzato'}),{status:403,headers});
    await ensureWarehouseSchema(env);
    return new Response(JSON.stringify({ok:true,migration:MIGRATION}),{headers});
  } catch (err) { return new Response(JSON.stringify({error:err.message}),{status:500,headers}); }
}
