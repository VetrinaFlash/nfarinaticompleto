// Ordini materie prime lato staff — POST crea ordine/bozza, GET lista SOLO i propri,
// PUT aggiorna/invia la propria bozza, DELETE elimina la propria bozza
const COOKIE_NAME = 'nfarinati_staff_session';

async function verifyStaffSession(request, secret) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  const token = decodeURIComponent(match[1]);
  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) return null;
  const payload = token.substring(0, lastDot);
  const sig = token.substring(lastDot + 1);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expectedSig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const expectedHex = [...new Uint8Array(expectedSig)].map(b => b.toString(16).padStart(2, '0')).join('');
  if (expectedHex !== sig) return null;
  const parts = payload.split(':'); // staff:<id>:<role>:<ts>
  if (parts[0] !== 'staff' || parts.length !== 4) return null;
  return { id: parseInt(parts[1]), role: parts[2] };
}

// Colonne aggiunte dopo il primo rilascio: migrate in corsa sui DB esistenti (idempotente)
async function migrateSchema(env) {
  const alters = [
    'ALTER TABLE supply_order_items ADD COLUMN original_quantity REAL',
    'ALTER TABLE supply_order_items ADD COLUMN removed INTEGER DEFAULT 0',
    'ALTER TABLE supply_order_items ADD COLUMN added_by_admin INTEGER DEFAULT 0',
    'ALTER TABLE supply_orders ADD COLUMN modified INTEGER DEFAULT 0',
    'ALTER TABLE supply_orders ADD COLUMN modified_at TEXT',
    'ALTER TABLE supply_orders ADD COLUMN is_draft INTEGER DEFAULT 0',
    'ALTER TABLE raw_materials ADD COLUMN default_price REAL',
  ];
  for (const sql of alters) {
    try { await env.DB.prepare(sql).run(); } catch (e) { /* colonna già presente */ }
  }
}

function cleanupItems(items) {
  const cleanItems = [];
  for (const it of items) {
    const materialId = parseInt(it.material_id);
    const quantity = parseFloat(it.quantity);
    const unitPrice = it.unit_price === null || it.unit_price === undefined || it.unit_price === ''
      ? null : parseFloat(it.unit_price);
    if (!materialId || !(quantity > 0)) return null;
    if (unitPrice !== null && !(unitPrice >= 0)) return null;
    cleanItems.push({ materialId, quantity, unitPrice });
  }
  return cleanItems;
}

const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

export async function onRequestPost(context) {
  const { env, request } = context;
  const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
  const session = await verifyStaffSession(request, secret);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }

  try {
    await migrateSchema(env);
    const body = await request.json();
    const items = Array.isArray(body.items) ? body.items : [];
    const notes = (body.notes || '').toString().slice(0, 1000);
    const isDraft = body.draft ? 1 : 0;

    if (items.length === 0) {
      return new Response(JSON.stringify({ error: 'Ordine vuoto: aggiungi almeno una materia prima' }), { status: 400, headers: cors });
    }
    const cleanItems = cleanupItems(items);
    if (!cleanItems) {
      return new Response(JSON.stringify({ error: 'Riga ordine non valida (materia o quantità mancante)' }), { status: 400, headers: cors });
    }

    const orderRes = await env.DB.prepare(
      "INSERT INTO supply_orders (staff_user_id, notes, status, is_draft, created_at) VALUES (?, ?, 'inviato', ?, datetime('now','localtime'))"
    ).bind(session.id, notes, isDraft).run();
    const orderId = orderRes.meta.last_row_id;

    const stmt = env.DB.prepare(
      'INSERT INTO supply_order_items (supply_order_id, raw_material_id, quantity, unit_price) VALUES (?, ?, ?, ?)'
    );
    await env.DB.batch(cleanItems.map(it => stmt.bind(orderId, it.materialId, it.quantity, it.unitPrice)));

    return new Response(JSON.stringify({ ok: true, order_id: orderId, is_draft: isDraft }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

// Aggiorna la propria bozza (action 'update') o la invia (action 'send'):
// le righe vengono sostituite con quelle passate, all'invio il timestamp diventa quello attuale
export async function onRequestPut(context) {
  const { env, request } = context;
  const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
  const session = await verifyStaffSession(request, secret);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }

  try {
    await migrateSchema(env);
    const body = await request.json();
    const orderId = parseInt(body.id);
    const action = body.action === 'send' ? 'send' : 'update';
    const notes = (body.notes || '').toString().slice(0, 1000);
    const items = Array.isArray(body.items) ? body.items : [];

    const order = await env.DB.prepare(
      'SELECT id FROM supply_orders WHERE id = ? AND staff_user_id = ? AND is_draft = 1'
    ).bind(orderId, session.id).first();
    if (!order) {
      return new Response(JSON.stringify({ error: 'Bozza non trovata' }), { status: 404, headers: cors });
    }

    if (items.length === 0) {
      return new Response(JSON.stringify({ error: 'La bozza è vuota: aggiungi almeno una materia prima' }), { status: 400, headers: cors });
    }
    const cleanItems = cleanupItems(items);
    if (!cleanItems) {
      return new Response(JSON.stringify({ error: 'Riga ordine non valida' }), { status: 400, headers: cors });
    }

    const stmts = [
      env.DB.prepare('DELETE FROM supply_order_items WHERE supply_order_id = ?').bind(orderId),
    ];
    const insertStmt = env.DB.prepare(
      'INSERT INTO supply_order_items (supply_order_id, raw_material_id, quantity, unit_price) VALUES (?, ?, ?, ?)'
    );
    for (const it of cleanItems) stmts.push(insertStmt.bind(orderId, it.materialId, it.quantity, it.unitPrice));

    if (action === 'send') {
      stmts.push(env.DB.prepare(
        "UPDATE supply_orders SET notes = ?, is_draft = 0, created_at = datetime('now','localtime') WHERE id = ?"
      ).bind(notes, orderId));
    } else {
      stmts.push(env.DB.prepare('UPDATE supply_orders SET notes = ? WHERE id = ?').bind(notes, orderId));
    }
    await env.DB.batch(stmts);

    return new Response(JSON.stringify({ ok: true, order_id: orderId, sent: action === 'send' }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

// Elimina la propria bozza
export async function onRequestDelete(context) {
  const { env, request } = context;
  const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
  const session = await verifyStaffSession(request, secret);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }

  try {
    await migrateSchema(env);
    const url = new URL(request.url);
    const id = parseInt(url.searchParams.get('id') || '0');
    const order = await env.DB.prepare(
      'SELECT id FROM supply_orders WHERE id = ? AND staff_user_id = ? AND is_draft = 1'
    ).bind(id, session.id).first();
    if (!order) {
      return new Response(JSON.stringify({ error: 'Bozza non trovata' }), { status: 404, headers: cors });
    }
    await env.DB.batch([
      env.DB.prepare('DELETE FROM supply_order_items WHERE supply_order_id = ?').bind(id),
      env.DB.prepare('DELETE FROM supply_orders WHERE id = ?').bind(id),
    ]);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
  const session = await verifyStaffSession(request, secret);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }

  try {
    await migrateSchema(env);

    // Solo gli ordini dell'utente loggato: i due dipendenti non vedono quelli dell'altro
    const orders = await env.DB.prepare(
      'SELECT id, notes, status, created_at, fulfilled_at, modified, modified_at, is_draft FROM supply_orders WHERE staff_user_id = ? ORDER BY is_draft DESC, created_at DESC LIMIT 100'
    ).bind(session.id).all();

    const ids = orders.results.map(o => o.id);
    let itemsByOrder = {};
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      const items = await env.DB.prepare(
        `SELECT i.supply_order_id, i.quantity, i.unit_price,
                i.original_quantity, i.removed, i.added_by_admin,
                i.raw_material_id AS material_id,
                m.name, m.department, m.supplier, m.default_price
         FROM supply_order_items i
         JOIN raw_materials m ON m.id = i.raw_material_id
         WHERE i.supply_order_id IN (${placeholders})
         ORDER BY m.name`
      ).bind(...ids).all();
      for (const it of items.results) {
        (itemsByOrder[it.supply_order_id] = itemsByOrder[it.supply_order_id] || []).push(it);
      }
    }

    const result = orders.results.map(o => ({ ...o, items: itemsByOrder[o.id] || [] }));
    return new Response(JSON.stringify({ orders: result }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
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
