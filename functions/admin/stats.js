import { adminIdentity } from '../_lib/auth.js';

async function verifySession(request, env) {
  return !!(await adminIdentity(env, request));
}

const cors = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

export async function onRequestGet(context) {
  const { env, request } = context;
  if (!(await verifySession(request, env))) {
    return json({ error: 'Non autorizzato' }, 401);
  }

  try {
    // created_at is stored with datetime('now','localtime'), so "today" must
    // use SQLite localtime too (not JavaScript UTC), otherwise late-evening
    // orders can land on the wrong day in Italy.
    const todayStats = await env.DB.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(total),0) as revenue
      FROM orders
      WHERE date(created_at) = date('now','localtime')
    `).first();

    const totalStats = await env.DB.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(total),0) as revenue FROM orders
    `).first();

    const daily = await env.DB.prepare(`
      SELECT date(created_at) as day, COUNT(*) as count, COALESCE(SUM(total),0) as revenue
      FROM orders
      WHERE date(created_at) >= date('now','localtime','-13 days')
      GROUP BY date(created_at)
      ORDER BY day ASC
    `).all();

    const allOrders = await env.DB.prepare('SELECT items_json FROM orders').all();
    const productCounts = Object.create(null);

    for (const row of (allOrders.results || [])) {
      try {
        const items = JSON.parse(row.items_json || '[]');
        if (!Array.isArray(items)) continue;
        for (const item of items) {
          const name = String(item?.name || 'Sconosciuto').slice(0, 180);
          if (!productCounts[name]) productCounts[name] = { qty: 0, revenue: 0 };
          const quantity = Number(item?.qty || 1);
          if (!Number.isFinite(quantity) || quantity <= 0) continue;
          productCounts[name].qty += quantity;
          const price = Number(item?.price || 0);
          if (Number.isFinite(price) && price >= 0) {
            productCounts[name].revenue += price * quantity;
          }
        }
      } catch {}
    }

    const topProducts = Object.entries(productCounts)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    const byStatus = await env.DB.prepare(
      'SELECT status, COUNT(*) as count FROM orders GROUP BY status'
    ).all();

    return json({
      today: {
        orders: Number(todayStats?.count || 0),
        revenue: Number(todayStats?.revenue || 0),
      },
      total: {
        orders: Number(totalStats?.count || 0),
        revenue: Number(totalStats?.revenue || 0),
      },
      daily: daily.results || [],
      topProducts,
      byStatus: byStatus.results || [],
    });
  } catch (err) {
    console.error('Admin stats failed', err?.name, err?.message);
    return json({ error: 'Operazione non riuscita' }, 500);
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
