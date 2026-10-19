// Shared warehouse configuration and additive, automatic D1 upgrade.
export const DEPARTMENTS = ['Pizzeria', 'Cucina', 'Sala', 'Bar'];
export const MIGRATION = 'warehouse-departments-2026-10';
export const ACCESS_SCHEMA = `CREATE TABLE IF NOT EXISTS staff_visibility (
  staff_user_id INTEGER PRIMARY KEY REFERENCES staff_users(id),
  departments TEXT NOT NULL DEFAULT '["Pizzeria","Cucina","Sala","Bar"]'
)`;
export const ACCOUNT_SEED = `INSERT OR IGNORE INTO staff_users (username,password_hash,display_name,role) VALUES ('CONOSCENTI','8ccd803e0d1b18b8be1eeb60a0fa71bbbb5e4ec0f038e0dbd623a51ac4c7e80b','CONOSCENTI','staff');
INSERT OR IGNORE INTO staff_users (username,password_hash,display_name,role) VALUES ('GRAZIANO','780fe97d0d453844c32478c3dcf1f8a3aa0b1886ce8e357e3cf69929d35ef165','GRAZIANO','staff');`;

// D1 batch is transactional. Rebuild the parent and referencing child together
// to replace the legacy CHECK constraint while retaining IDs and order items.
export async function ensureWarehouseSchema(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS warehouse_migrations (name TEXT PRIMARY KEY)').run();
  if (await env.DB.prepare('SELECT name FROM warehouse_migrations WHERE name = ?').bind(MIGRATION).first()) return;
  const schema = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'raw_materials'").first();
  if (!schema) throw new Error('Magazzino non inizializzato: eseguire il setup admin');
  const columns = (await env.DB.prepare('PRAGMA table_info(raw_materials)').all()).results;
  const price = columns.some(c => c.name === 'default_price') ? 'default_price' : 'NULL';
  const sql = [];
  if (!schema.sql.includes("'Sala'") || !schema.sql.includes("'Bar'")) {
    // Rebuild the referencing child inside the same atomic batch. Merely deferring
    // foreign keys is insufficient in SQLite when dropping a referenced parent.
    const child = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'supply_order_items'").first();
    const objects = (await env.DB.prepare("SELECT sql FROM sqlite_master WHERE tbl_name IN ('raw_materials','supply_order_items') AND type IN ('index','trigger') AND sql IS NOT NULL").all()).results;
    const sequences = (await env.DB.prepare("SELECT name, seq FROM sqlite_sequence WHERE name IN ('raw_materials','supply_order_items')").all()).results;
    if (child) sql.push('CREATE TABLE supply_order_items_upgrade AS SELECT * FROM supply_order_items', 'DROP TABLE supply_order_items');
    sql.push(
      `CREATE TABLE raw_materials_upgrade (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
        department TEXT NOT NULL CHECK(department IN ('Pizzeria','Cucina','Sala','Bar')),
        supplier TEXT NOT NULL DEFAULT '', default_price REAL, active INTEGER DEFAULT 1,
        UNIQUE(name, department))`,
      `INSERT INTO raw_materials_upgrade (id,name,department,supplier,default_price,active)
       SELECT id,name,department,supplier,${price},active FROM raw_materials`,
      'DROP TABLE raw_materials',
      'ALTER TABLE raw_materials_upgrade RENAME TO raw_materials');
    if (child) sql.push(child.sql, 'INSERT INTO supply_order_items SELECT * FROM supply_order_items_upgrade', 'DROP TABLE supply_order_items_upgrade');
    sql.push(...objects.map(o => o.sql));
    for (const seq of sequences) {
      // Names come only from the two fixed names in the sqlite_sequence query.
      sql.push(`UPDATE sqlite_sequence SET seq = MAX(seq, ${Number(seq.seq)}) WHERE name = '${seq.name}'`);
    }
  } else if (price === 'NULL') {
    sql.push('ALTER TABLE raw_materials ADD COLUMN default_price REAL');
  }
  sql.push(ACCESS_SCHEMA, ...ACCOUNT_SEED.split(';').map(s => s.trim()).filter(Boolean));
  await env.DB.batch([
    ...sql.map(s => env.DB.prepare(s)),
    env.DB.prepare('INSERT OR IGNORE INTO warehouse_migrations (name) VALUES (?)').bind(MIGRATION),
  ]);
}

export async function getDepartments(env, user) {
  if (user.role === 'admin') return [...DEPARTMENTS];
  const policy = await env.DB.prepare('SELECT departments FROM staff_visibility WHERE staff_user_id = ?').bind(user.id).first();
  if (!policy) return [...DEPARTMENTS]; // Existing accounts retain access until configured.
  const selected = JSON.parse(policy.departments);
  return DEPARTMENTS.filter(d => selected.includes(d));
}

export async function staffAccess(env, session) {
  const user = await env.DB.prepare('SELECT id, role FROM staff_users WHERE id = ? AND active = 1').bind(session.id).first();
  if (!user) return null;
  return { ...user, departments: await getDepartments(env, user) };
}

export async function canOrderItems(env, access, items) {
  const ids = [...new Set(items.map(it => it.materialId))];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const rows = await env.DB.prepare(`SELECT id, department FROM raw_materials WHERE active = 1 AND id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all();
    if (rows.results.length !== chunk.length || rows.results.some(m => !access.departments.includes(m.department))) return false;
  }
  return true;
}
