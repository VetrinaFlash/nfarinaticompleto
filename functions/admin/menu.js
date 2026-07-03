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
      // Il form categoria invia solo nome e ordine: icona e stato attivo, quando
      // non arrivano nella richiesta, vanno mantenuti com'erano (altrimenti ogni
      // rinomina resetterebbe l'icona a quella generica).
      const current = await env.DB.prepare('SELECT icon, active FROM categories WHERE id = ?').bind(id).first();
      if (!current) {
        return new Response(JSON.stringify({ error: 'Categoria non trovata' }), { status: 404, headers: cors });
      }
      await env.DB.prepare('UPDATE categories SET name=?, icon=?, sort_order=?, active=? WHERE id=?')
        .bind(
          name,
          icon !== undefined ? icon : current.icon,
          sort_order || 0,
          active !== undefined ? active : current.active,
          id
        ).run();
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
      // Il form semplice dell'admin invia solo nome/descrizione/prezzo/foto/categoria/attivo:
      // le varianti di formato e le scelte obbligatorie, quando non arrivano nella richiesta,
      // vanno mantenute com'erano — altrimenti ogni modifica le azzererebbe silenziosamente.
      const current = await env.DB.prepare(
        'SELECT category_id, mandatory_choice, sort_order, prezzi_json, options_json, multi_options_json FROM products WHERE id = ?'
      ).bind(id).first();
      if (!current) {
        return new Response(JSON.stringify({ error: 'Prodotto non trovato' }), { status: 404, headers: cors });
      }
      // category_id è un id testuale (es. "pizze-americane"): se arriva vuoto/mancante
      // si tiene quello attuale, per non "orfanizzare" il prodotto (spariva dal menu).
      const safeCategoryId = (category_id && String(category_id).trim()) ? category_id : current.category_id;
      await env.DB.prepare(`
        UPDATE products SET category_id=?, name=?, description=?, price=?, image_url=?,
          mandatory_choice=?, active=?, sort_order=?, prezzi_json=?, options_json=?, multi_options_json=?
        WHERE id=?
      `).bind(
        safeCategoryId, name, description || '', price, image_url || '',
        mandatory_choice !== undefined ? (mandatory_choice ? 1 : 0) : current.mandatory_choice,
        active !== undefined ? active : 1,
        sort_order !== undefined ? sort_order : current.sort_order,
        prezzi_json !== undefined ? prezzi_json : current.prezzi_json,
        options_json !== undefined ? options_json : current.options_json,
        multi_options_json !== undefined ? multi_options_json : current.multi_options_json,
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
