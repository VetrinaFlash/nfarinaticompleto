import { adminIdentity } from '../_lib/auth.js';
import { menuPrices } from '../_lib/menu-prices.js';

async function verifySession(request, env) {
  return !!(await adminIdentity(env, request));
}

const cors = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

function cleanText(value, max = 5000) {
  return String(value ?? '').trim().slice(0, max);
}

function categoryId(value) {
  const id = cleanText(value, 120);
  return id || null;
}

function productId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function integerOr(value, fallback = 0) {
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
}

function flag(value, fallback = 1) {
  if (value === undefined || value === null) return fallback ? 1 : 0;
  return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
}

function jsonObjectText(value, fallback = '{}') {
  if (value === undefined) return fallback;
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value || '{}'); }
    catch { throw new Error('Configurazione opzioni non valida'); }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Configurazione opzioni non valida');
  }
  return JSON.stringify(parsed);
}

async function getCategory(env, id) {
  return id
    ? await env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first()
    : null;
}

async function getProduct(env, id) {
  return id
    ? await env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first()
    : null;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  if (!(await verifySession(request, env))) {
    return json({ error: 'Non autorizzato' }, 401);
  }

  try {
    const cats = await env.DB.prepare(
      'SELECT * FROM categories ORDER BY sort_order ASC, name ASC'
    ).all();
    const prods = await env.DB.prepare(
      'SELECT * FROM products ORDER BY category_id, sort_order ASC, id ASC'
    ).all();

    return json({
      categories: cats.results || [],
      products: prods.results || [],
    });
  } catch (err) {
    console.error('Admin menu GET failed', err?.name, err?.message);
    return json({ error: 'Operazione non riuscita' }, 500);
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  if (!(await verifySession(request, env))) {
    return json({ error: 'Non autorizzato' }, 401);
  }

  try {
    const body = await request.json();
    const action = cleanText(body?.action, 60);

    if (action === 'create_category') {
      const name = cleanText(body.name, 120);
      if (!name) return json({ error: 'Nome categoria obbligatorio' }, 400);

      const suppliedId = categoryId(body.id);
      const slug = name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 70) || 'categoria';
      const id = suppliedId || `${slug}-${Date.now()}`;

      if (await getCategory(env, id)) {
        return json({ error: 'Esiste già una categoria con questo ID' }, 409);
      }

      await env.DB.prepare(
        'INSERT INTO categories (id, name, icon, sort_order, active) VALUES (?,?,?,?,1)'
      ).bind(
        id,
        name,
        cleanText(body.icon || '🍴', 20) || '🍴',
        integerOr(body.sort_order, 0),
      ).run();

      return json({ ok: true, id });
    }

    if (action === 'update_category') {
      const id = categoryId(body.id);
      if (!id) return json({ error: 'ID categoria non valido' }, 400);

      const current = await getCategory(env, id);
      if (!current) return json({ error: 'Categoria non trovata' }, 404);

      const name = body.name === undefined ? current.name : cleanText(body.name, 120);
      if (!name) return json({ error: 'Nome categoria obbligatorio' }, 400);

      await env.DB.prepare(
        'UPDATE categories SET name=?, icon=?, sort_order=?, active=? WHERE id=?'
      ).bind(
        name,
        body.icon !== undefined ? (cleanText(body.icon, 20) || '🍴') : current.icon,
        body.sort_order !== undefined ? integerOr(body.sort_order, current.sort_order || 0) : (current.sort_order || 0),
        flag(body.active, current.active),
        id,
      ).run();

      return json({ ok: true, id });
    }

    if (action === 'delete_category') {
      const id = categoryId(body.id);
      if (!id) return json({ error: 'ID categoria non valido' }, 400);

      const current = await getCategory(env, id);
      if (!current) return json({ error: 'Categoria non trovata' }, 404);

      const countRow = await env.DB.prepare(
        'SELECT COUNT(*) AS total FROM products WHERE category_id = ?'
      ).bind(id).first();
      const productCount = Number(countRow?.total || 0);

      if (productCount > 0 && body.delete_products !== true) {
        return json({
          error: `La categoria contiene ${productCount} prodotti. Conferma anche l'eliminazione dei prodotti.`,
          product_count: productCount,
        }, 409);
      }

      if (productCount > 0) {
        await env.DB.batch([
          env.DB.prepare('DELETE FROM products WHERE category_id = ?').bind(id),
          env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id),
        ]);
      } else {
        await env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
      }

      return json({ ok: true, id, deleted_products: productCount });
    }

    if (action === 'create_product') {
      const catId = categoryId(body.category_id);
      const name = cleanText(body.name, 180);
      if (!catId || !name || body.price === undefined) {
        return json({ error: 'Categoria, nome e prezzo sono obbligatori' }, 400);
      }

      if (!(await getCategory(env, catId))) {
        return json({ error: 'Categoria non trovata' }, 400);
      }

      let pricing;
      let optionsJson;
      let multiOptionsJson;
      try {
        pricing = menuPrices(body.price, body.prezzi_json, body.prezzi_json !== undefined);
        optionsJson = jsonObjectText(body.options_json, '{}');
        multiOptionsJson = jsonObjectText(body.multi_options_json, '{}');
      } catch (err) {
        return json({ error: err.message || 'Dati prodotto non validi' }, 400);
      }

      const result = await env.DB.prepare(`
        INSERT INTO products (
          category_id, name, description, price, image_url, active,
          mandatory_choice, sort_order, prezzi_json, options_json, multi_options_json
        )
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        catId,
        name,
        cleanText(body.description, 5000),
        pricing.price,
        cleanText(body.image_url, 2000),
        flag(body.active, 1),
        flag(body.mandatory_choice, 0),
        integerOr(body.sort_order, 0),
        pricing.prezzi_json,
        optionsJson,
        multiOptionsJson,
      ).run();

      return json({ ok: true, id: result.meta.last_row_id });
    }

    if (action === 'update_product') {
      const id = productId(body.id);
      if (!id) return json({ error: 'ID prodotto non valido' }, 400);

      const current = await getProduct(env, id);
      if (!current) return json({ error: 'Prodotto non trovato' }, 404);

      const catId = body.category_id !== undefined
        ? categoryId(body.category_id)
        : current.category_id;
      if (!catId || !(await getCategory(env, catId))) {
        return json({ error: 'Categoria non trovata' }, 400);
      }

      const name = body.name === undefined ? current.name : cleanText(body.name, 180);
      if (!name) return json({ error: 'Nome prodotto obbligatorio' }, 400);

      let pricing;
      let optionsJson;
      let multiOptionsJson;
      try {
        pricing = menuPrices(
          body.price !== undefined ? body.price : current.price,
          body.prezzi_json !== undefined ? body.prezzi_json : current.prezzi_json,
          body.prezzi_json !== undefined,
        );
        optionsJson = jsonObjectText(
          body.options_json,
          current.options_json || '{}',
        );
        multiOptionsJson = jsonObjectText(
          body.multi_options_json,
          current.multi_options_json || '{}',
        );
      } catch (err) {
        return json({ error: err.message || 'Dati prodotto non validi' }, 400);
      }

      await env.DB.prepare(`
        UPDATE products SET
          category_id=?, name=?, description=?, price=?, image_url=?,
          mandatory_choice=?, active=?, sort_order=?, prezzi_json=?,
          options_json=?, multi_options_json=?
        WHERE id=?
      `).bind(
        catId,
        name,
        body.description !== undefined ? cleanText(body.description, 5000) : current.description,
        pricing.price,
        body.image_url !== undefined ? cleanText(body.image_url, 2000) : current.image_url,
        body.mandatory_choice !== undefined ? flag(body.mandatory_choice, current.mandatory_choice) : current.mandatory_choice,
        body.active !== undefined ? flag(body.active, current.active) : current.active,
        body.sort_order !== undefined ? integerOr(body.sort_order, current.sort_order || 0) : (current.sort_order || 0),
        pricing.prezzi_json,
        optionsJson,
        multiOptionsJson,
        id,
      ).run();

      return json({ ok: true, id });
    }

    if (action === 'delete_product') {
      const id = productId(body.id);
      if (!id) return json({ error: 'ID prodotto non valido' }, 400);

      const current = await getProduct(env, id);
      if (!current) return json({ error: 'Prodotto non trovato' }, 404);

      await env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
      return json({ ok: true, id, name: current.name });
    }

    return json({ error: 'Azione non valida' }, 400);
  } catch (err) {
    console.error('Admin menu POST failed', err?.name, err?.message);
    return json({ error: 'Operazione non riuscita' }, 500);
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
