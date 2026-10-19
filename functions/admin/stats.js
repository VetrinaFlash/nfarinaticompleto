import { adminIdentity } from '../_lib/auth.js';
// Statistiche dashboard admin
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
    const today = new Date().toISOString().substring(0, 10);

    // KPI oggi
    const todayStats = await env.DB.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(total),0) as revenue
      FROM orders WHERE date(created_at) = ?
    `).bind(today).first();

    // KPI totali
    const totalStats = await env.DB.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(total),0) as revenue FROM orders
    `).first();

    // Ordini ultimi 14 giorni per il grafico
    const daily = await env.DB.prepare(`
      SELECT date(created_at) as day, COUNT(*) as count, COALESCE(SUM(total),0) as revenue
      FROM orders
      WHERE created_at >= date('now', '-13 days')
      GROUP BY date(created_at)
      ORDER BY day ASC
    `).all();

    // Top 10 prodotti per quantità
    const allOrders = await env.DB.prepare('SELECT items_json FROM orders').all();
    const productCounts = Object.create(null);
    for (const row of allOrders.results) {
      try {
        const items = JSON.parse(row.items_json || '[]');
        for (const item of items) {
          const name = item.name || 'Sconosciuto';
          if (!productCounts[name]) productCounts[name] = { qty: 0, revenue: 0 };
          const quantity = Number(item.qty || 1); if (!Number.isFinite(quantity) || quantity <= 0) continue;
          productCounts[name].qty += quantity;
          const price = Number(item.price || 0);
          if (Number.isFinite(price) && price >= 0) productCounts[name].revenue += price * quantity;
        }
      } catch {}
    }

    const topProducts = Object.entries(productCounts)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    // Conteggio ordini per status
    const byStatus = await env.DB.prepare(`
      SELECT status, COUNT(*) as count FROM orders GROUP BY status
    `).all();

    return new Response(JSON.stringify({
      today: { orders: todayStats.count, revenue: todayStats.revenue },
      total: { orders: totalStats.count, revenue: totalStats.revenue },
      daily: daily.results,
      topProducts,
      byStatus: byStatus.results,
    }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Operazione non riuscita' }), { status: 500, headers: cors });
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
