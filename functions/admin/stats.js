// Statistiche dashboard admin
const COOKIE_NAME = 'nfarinati_admin_session';

async function verifySession(request, secret) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return false;
  const token = decodeURIComponent(match[1]);
  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) return false;
  const payload = token.substring(0, lastDot);
  const sig = token.substring(lastDot + 1);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expectedSig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const expectedHex = [...new Uint8Array(expectedSig)].map(b => b.toString(16).padStart(2, '0')).join('');
  return expectedHex === sig;
}

const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

export async function onRequestGet(context) {
  const { env, request } = context;
  const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
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
    const productCounts = {};
    for (const row of allOrders.results) {
      try {
        const items = JSON.parse(row.items_json || '[]');
        for (const item of items) {
          const name = item.name || 'Sconosciuto';
          if (!productCounts[name]) productCounts[name] = { qty: 0, revenue: 0 };
          productCounts[name].qty += item.qty || 1;
          productCounts[name].revenue += (item.price || 0) * (item.qty || 1);
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
