// Anagrafica fornitori magazzino — GET lista (auto-crea/sincronizza da raw_materials), PUT aggiorna WhatsApp
const ADMIN_COOKIE = 'nfarinati_admin_session';
const STAFF_COOKIE = 'nfarinati_staff_session';

async function verifyHmacToken(token, secret) {
  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) return null;
  const payload = token.substring(0, lastDot);
  const sig = token.substring(lastDot + 1);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expectedSig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const expectedHex = [...new Uint8Array(expectedSig)].map(b => b.toString(16).padStart(2, '0')).join('');
  return expectedHex === sig ? payload : null;
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function isAdminAuthorized(request, secret) {
  const adminToken = getCookie(request, ADMIN_COOKIE);
  if (adminToken) {
    const payload = await verifyHmacToken(adminToken, secret);
    if (payload && payload.startsWith('admin:')) return true;
  }
  const staffToken = getCookie(request, STAFF_COOKIE);
  if (staffToken) {
    const payload = await verifyHmacToken(staffToken, secret);
    if (payload) {
      const parts = payload.split(':');
      if (parts[0] === 'staff' && parts[2] === 'admin') return true;
    }
  }
  return false;
}

const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

// Crea la tabella se manca e importa i fornitori presenti in raw_materials (idempotente)
async function ensureSuppliers(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    whatsapp TEXT DEFAULT '',
    active INTEGER DEFAULT 1
  )`).run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO suppliers (name) SELECT DISTINCT supplier FROM raw_materials WHERE supplier != ''"
  ).run();
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
  if (!(await isAdminAuthorized(request, secret))) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }

  try {
    await ensureSuppliers(env);
    const rows = await env.DB.prepare(
      'SELECT id, name, whatsapp FROM suppliers WHERE active = 1 ORDER BY name'
    ).all();
    return new Response(JSON.stringify({ suppliers: rows.results }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

// Aggiorna un fornitore per id: numero WhatsApp e, se cambiato, anche il nome.
// Il nome di un fornitore non è collegato ai prodotti con una vera relazione
// (raw_materials.supplier è testo libero), quindi rinominandolo aggiorniamo
// in un colpo solo anche tutte le materie prime che lo usano, altrimenti
// resterebbero agganciate al nome vecchio.
export async function onRequestPut(context) {
  const { env, request } = context;
  const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
  if (!(await isAdminAuthorized(request, secret))) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }

  try {
    const body = await request.json();
    const whatsapp = (body.whatsapp || '').toString().replace(/[^\d+]/g, '').slice(0, 20);
    await ensureSuppliers(env);

    // Retrocompatibilità: se non arriva un id, si aggiorna solo il WhatsApp cercando per nome
    if (!body.id) {
      const name = (body.name || '').toString().trim();
      if (!name) {
        return new Response(JSON.stringify({ error: 'Nome fornitore mancante' }), { status: 400, headers: cors });
      }
      await env.DB.prepare('UPDATE suppliers SET whatsapp = ? WHERE name = ?').bind(whatsapp, name).run();
      return new Response(JSON.stringify({ ok: true, whatsapp }), { status: 200, headers: cors });
    }

    const id = parseInt(body.id);
    const newName = (body.name || '').toString().trim().slice(0, 60);
    if (!newName) {
      return new Response(JSON.stringify({ error: 'Il nome del fornitore non può essere vuoto' }), { status: 400, headers: cors });
    }

    const current = await env.DB.prepare('SELECT name FROM suppliers WHERE id = ?').bind(id).first();
    if (!current) {
      return new Response(JSON.stringify({ error: 'Fornitore non trovato' }), { status: 404, headers: cors });
    }

    if (newName === current.name) {
      await env.DB.prepare('UPDATE suppliers SET whatsapp = ? WHERE id = ?').bind(whatsapp, id).run();
      return new Response(JSON.stringify({ ok: true, whatsapp, name: newName }), { status: 200, headers: cors });
    }

    const clash = await env.DB.prepare('SELECT id FROM suppliers WHERE name = ? AND id != ?').bind(newName, id).first();
    if (clash) {
      return new Response(JSON.stringify({ error: `Esiste già un fornitore chiamato "${newName}"` }), { status: 400, headers: cors });
    }

    await env.DB.batch([
      env.DB.prepare('UPDATE suppliers SET name = ?, whatsapp = ? WHERE id = ?').bind(newName, whatsapp, id),
      env.DB.prepare('UPDATE raw_materials SET supplier = ? WHERE supplier = ?').bind(newName, current.name),
    ]);

    return new Response(JSON.stringify({ ok: true, whatsapp, name: newName }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
  if (!(await isAdminAuthorized(request, secret))) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }

  try {
    const { name, whatsapp } = await request.json();
    const cleanName = (name || '').toString().trim().slice(0, 60);
    if (!cleanName) {
      return new Response(JSON.stringify({ error: 'Nome fornitore mancante' }), { status: 400, headers: cors });
    }
    const cleanWa = (whatsapp || '').toString().replace(/[^\d+]/g, '').slice(0, 20);
    await ensureSuppliers(env);
    await env.DB.prepare(
      'INSERT INTO suppliers (name, whatsapp, active) VALUES (?, ?, 1) ON CONFLICT(name) DO UPDATE SET active = 1, whatsapp = CASE WHEN excluded.whatsapp != \'\' THEN excluded.whatsapp ELSE whatsapp END'
    ).bind(cleanName, cleanWa).run();
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

// Elimina un fornitore (solo se nessun prodotto attivo lo usa ancora, per non
// lasciare materie prime "orfane" — in quel caso va prima riassegnato il
// fornitore ai prodotti dalla tab Prodotti)
export async function onRequestDelete(context) {
  const { env, request } = context;
  const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
  if (!(await isAdminAuthorized(request, secret))) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: cors });
  }

  try {
    const url = new URL(request.url);
    const id = parseInt(url.searchParams.get('id') || '0');
    if (!id) {
      return new Response(JSON.stringify({ error: 'ID mancante' }), { status: 400, headers: cors });
    }
    const sup = await env.DB.prepare('SELECT name FROM suppliers WHERE id = ?').bind(id).first();
    if (!sup) {
      return new Response(JSON.stringify({ error: 'Fornitore non trovato' }), { status: 404, headers: cors });
    }
    const used = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM raw_materials WHERE supplier = ? AND active = 1'
    ).bind(sup.name).first();
    if (used.n > 0) {
      return new Response(JSON.stringify({
        error: `Non eliminabile: ${used.n} prodott${used.n === 1 ? 'o è' : 'i sono'} ancora assegnat${used.n === 1 ? 'o' : 'i'} a "${sup.name}". Cambia il fornitore su quei prodotti dalla tab Prodotti, poi riprova.`,
      }), { status: 400, headers: cors });
    }
    await env.DB.prepare('DELETE FROM suppliers WHERE id = ?').bind(id).run();
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
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
