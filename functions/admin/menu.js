// CRUD menu admin (categorie e prodotti)
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

// GET: lista completa categorie e prodotti
export async function onRequestGet(context) {
  const { env, request } = context;
  const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
  if (!(await verifySession(request, secret))) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }

  try {
    const cats = await env.DB.prepare('SELECT * FROM categories ORDER BY sort_order ASC').all();
    const prods = await env.DB.prepare('SELECT * FROM products ORDER BY category_id, sort_order ASC').all();
    return new Response(JSON.stringify({ categories: cats.results, products: prods.results }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

// POST: crea o aggiorna categoria/prodotto, o elimina (action nel body)
export async function onRequestPost(context) {
  const { env, request } = context;
  const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
  if (!(await verifySession(request, secret))) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }

  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'create_category') {
      const { id, name, icon, sort_order } = body;
      if (!name) return new Response(JSON.stringify({ error: 'name obbligatorio' }), { status: 400, headers: cors });
      const autoId = id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now();
      await env.DB.prepare('INSERT INTO categories (id, name, icon, sort_order, active) VALUES (?,?,?,?,1)')
        .bind(autoId, name, icon || '🍴', sort_order || 0).run();
      return new Response(JSON.stringify({ ok: true, id: autoId }), { status: 200, headers: cors });
    }

    if (action === 'update_category') {
      const { id, name, icon, sort_order, active } = body;
      await env.DB.prepare('UPDATE categories SET name=?, icon=?, sort_order=?, active=? WHERE id=?')
        .bind(name, icon || '🍴', sort_order || 0, active !== undefined ? active : 1, id).run();
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
    }

    if (action === 'delete_category') {
      await env.DB.prepare('UPDATE categories SET active = 0 WHERE id = ?').bind(body.id).run();
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
    }

    if (action === 'create_product') {
      const { category_id, name, description, price, image_url, mandatory_choice, sort_order, prezzi_json, options_json, multi_options_json } = body;
      if (!category_id || !name || price === undefined) {
        return new Response(JSON.stringify({ error: 'category_id, name e price obbligatori' }), { status: 400, headers: cors });
      }
      const result = await env.DB.prepare(`
        INSERT INTO products (category_id, name, description, price, image_url, active, mandatory_choice, sort_order, prezzi_json, options_json, multi_options_json)
        VALUES (?,?,?,?,?,1,?,?,?,?,?)
      `).bind(
        category_id, name, description || '', price, image_url || '',
        mandatory_choice ? 1 : 0, sort_order || 0,
        prezzi_json || JSON.stringify([{ prezzo: price }]),
        options_json || '{}',
        multi_options_json || '{}'
      ).run();
      return new Response(JSON.stringify({ ok: true, id: result.meta.last_row_id }), { status: 200, headers: cors });
    }

    if (action === 'update_product') {
      const { id, category_id, name, description, price, image_url, mandatory_choice, active, sort_order, prezzi_json, options_json, multi_options_json } = body;
      await env.DB.prepare(`
        UPDATE products SET category_id=?, name=?, description=?, price=?, image_url=?,
          mandatory_choice=?, active=?, sort_order=?, prezzi_json=?, options_json=?, multi_options_json=?
        WHERE id=?
      `).bind(
        category_id, name, description || '', price, image_url || '',
        mandatory_choice ? 1 : 0,
        active !== undefined ? active : 1,
        sort_order || 0,
        prezzi_json || JSON.stringify([{ prezzo: price }]),
        options_json || '{}',
        multi_options_json || '{}',
        id
      ).run();
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
    }

    if (action === 'delete_product') {
      await env.DB.prepare('UPDATE products SET active = 0 WHERE id = ?').bind(body.id).run();
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
    }

    return new Response(JSON.stringify({ error: 'Azione non valida' }), { status: 400, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
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
