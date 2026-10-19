import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {ensureWarehouseSchema, getDepartments, MIGRATION} from '../functions/_lib/warehouse.js';
import {onRequestPost as login} from '../functions/staff/login.js';
import {onRequestGet as materials} from '../functions/staff/materials.js';
import {onRequestPost as order, onRequestPut as updateOrder, onRequestGet as orders} from '../functions/staff/orders.js';
import {onRequest as access} from '../functions/admin/staff-access.js';
import {onRequestPost as adminLogin} from '../functions/admin/login.js';
import {onRequestPost as addMaterial} from '../functions/admin/materials.js';

function fixture({legacy=true, oldPrice=false}={}) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  let schema=readFileSync(new URL('../schema-magazzino.sql',import.meta.url),'utf8');
  if (legacy) schema=schema.replace("CHECK(department IN ('Pizzeria','Cucina','Sala','Bar'))", "CHECK(department IN ('Pizzeria','Cucina'))");
  if (oldPrice) schema=schema.replace('  default_price REAL,','');
  db.exec(schema);
  db.exec("DELETE FROM staff_users WHERE username IN ('CONOSCENTI','GRAZIANO'); DROP TABLE staff_visibility;");
  const DB = {
    prepare(sql) {
      let args=[];
      return {
        bind(...params) { args=params; return this; },
        async first() { return db.prepare(sql).get(...args) || null; },
        async all() { return {results:db.prepare(sql).all(...args)}; },
        async run() { const result=db.prepare(sql).run(...args); return {meta:{last_row_id:Number(result.lastInsertRowid),changes:Number(result.changes)}}; },
        sql,
      };
    },
    async batch(statements) {
      db.exec('BEGIN');
      try { const results=[]; for(const statement of statements) results.push(await statement.run()); db.exec('COMMIT'); return results; }
      catch(e) { db.exec('ROLLBACK'); throw e; }
    },
  };
  return {db,env:{DB, ADMIN_TOKEN_SECRET:'test-secret'}};
}
function context(env,path,method='GET',body,cookie='') {
  return {env,request:new Request('https://example.com'+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})};
}
async function staffCookie(env,username,password) {
  const response=await login(context(env,'/staff/login','POST',{username,password}));
  assert.equal(response.status,200,await response.clone().text());
  assert.equal((await response.json()).ok,true);
  return response.headers.get('set-cookie').split(';')[0];
}
async function adminCookie(env) {
  // Read the existing admin credentials instead of duplicating them in the tests.
  const source=readFileSync(new URL('../functions/admin/login.js',import.meta.url),'utf8');
  const username=source.match(/const USERNAME = '([^']+)'/)[1];
  const password=source.match(/const PASSWORD = '([^']+)'/)[1];
  const response=await adminLogin(context(env,'/admin/login','POST',{username,password}));
  assert.equal(response.status,200); return response.headers.get('set-cookie').split(';')[0];
}

test('upgrade preserves IDs, prices, inactive materials, orders, items, indexes and sequence; repeat is harmless', async()=>{
  const {env,db}=fixture();
  db.exec(`UPDATE raw_materials SET default_price=12.50, active=0 WHERE id=1;
    INSERT INTO raw_materials(id,name,department) VALUES(1000,'DELETED','Cucina'); DELETE FROM raw_materials WHERE id=1000;
    INSERT INTO supply_orders(id,staff_user_id,notes,is_draft) VALUES(9,1,'existing draft',1);
    INSERT INTO supply_order_items(id,supply_order_id,raw_material_id,quantity,unit_price) VALUES(7,9,1,3,2.5);
    CREATE INDEX custom_raw_index ON raw_materials(supplier);`);
  const before=db.prepare('SELECT * FROM raw_materials ORDER BY id').all();
  await ensureWarehouseSchema(env);
  assert.deepEqual(db.prepare('SELECT * FROM raw_materials ORDER BY id').all(),before);
  assert.equal(db.prepare('SELECT raw_material_id FROM supply_order_items WHERE id=7').get().raw_material_id,1);
  assert.equal(db.prepare('SELECT is_draft FROM supply_orders WHERE id=9').get().is_draft,1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='custom_raw_index'").get());
  assert.equal(db.prepare("SELECT seq FROM sqlite_sequence WHERE name='raw_materials'").get().seq,1000);
  db.exec("INSERT INTO raw_materials(name,department) VALUES('NEW SALA','Sala'),('NEW BAR','Bar')");
  assert.ok(db.prepare("SELECT id FROM raw_materials WHERE department='Sala'").get().id>1000);
  db.exec("UPDATE staff_users SET password_hash='changed' WHERE username='CONOSCENTI'");
  await ensureWarehouseSchema(env);
  assert.equal(db.prepare("SELECT password_hash FROM staff_users WHERE username='CONOSCENTI'").get().password_hash,'changed');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM warehouse_migrations WHERE name=?').get(MIGRATION).n,1);
});

test('old schemas without prices and fresh installations upgrade', async()=>{
  for (const options of [{oldPrice:true},{legacy:false}]) {
    const {env,db}=fixture(options);
    await ensureWarehouseSchema(env);
    db.exec("INSERT INTO raw_materials(name,department,default_price) VALUES('BAR ITEM','Bar',2)");
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  }
});

test('requested accounts log in; live per-account permissions filter catalog/history and reject forged orders', async()=>{
  const {env,db}=fixture();
  const conoscenti=await staffCookie(env,'CONOSCENTI','CONOSCENTI');
  const graziano=await staffCookie(env,'GRAZIANO','GRAZIANO');
  const admin=await adminCookie(env);
  const user=db.prepare("SELECT id FROM staff_users WHERE username='CONOSCENTI'").get();
  db.exec("INSERT INTO raw_materials(name,department) VALUES('BICCHIERI SALA','Sala'),('CAFFE BAR','Bar')");
  const sala=db.prepare("SELECT id FROM raw_materials WHERE department='Sala'").get().id;
  const bar=db.prepare("SELECT id FROM raw_materials WHERE department='Bar'").get().id;
  // Unauthorized permission mutation must fail.
  assert.equal((await access(context(env,'/admin/staff-access','PUT',{id:user.id,departments:['Bar']},conoscenti))).status,403);
  assert.equal((await access(context(env,'/admin/staff-access','GET'))).status,403);
  let response=await order(context(env,'/staff/orders','POST',{items:[{material_id:bar,quantity:2}],draft:true},conoscenti));
  const draft=(await response.json()).order_id; assert.ok(draft);
  response=await access(context(env,'/admin/staff-access','PUT',{id:user.id,departments:['Sala']},admin));
  assert.equal(response.status,200);
  const catalog=await (await materials(context(env,'/staff/materials','GET',null,conoscenti))).json();
  assert.deepEqual(catalog.departments,['Sala']);
  assert.ok(catalog.materials.every(m=>m.department==='Sala'));
  assert.equal((await order(context(env,'/staff/orders','POST',{items:[{material_id:bar,quantity:2}]},conoscenti))).status,403);
  assert.equal((await updateOrder(context(env,'/staff/orders','PUT',{id:draft,action:'send',items:[{material_id:bar,quantity:2}]},conoscenti))).status,403);
  assert.equal(db.prepare('SELECT is_draft FROM supply_orders WHERE id=?').get(draft).is_draft,1);
  const history=await (await orders(context(env,'/staff/orders','GET',null,conoscenti))).json();
  assert.ok(history.orders.every(o=>o.items.every(i=>i.department==='Sala')));
  assert.equal((await order(context(env,'/staff/orders','POST',{items:[{material_id:sala,quantity:2}]},conoscenti))).status,200);
  const other=await (await materials(context(env,'/staff/materials','GET',null,graziano))).json();
  assert.equal(other.departments.length,4);
  // Empty selection denies everything, including with an already-issued cookie.
  await access(context(env,'/admin/staff-access','PUT',{id:user.id,departments:[]},admin));
  assert.deepEqual((await (await materials(context(env,'/staff/materials','GET',null,conoscenti))).json()).materials,[]);
  assert.equal((await order(context(env,'/staff/orders','POST',{items:[{material_id:sala,quantity:1}]},conoscenti))).status,403);
  await ensureWarehouseSchema(env);
  assert.deepEqual(await getDepartments(env,{id:user.id,role:'staff'}),[]);
  assert.equal((await access(context(env,'/admin/staff-access','PUT',{id:user.id,departments:['Invalid']},admin))).status,400);
  db.exec(`UPDATE staff_users SET active=0 WHERE id=${user.id}`);
  assert.equal((await materials(context(env,'/staff/materials','GET',null,conoscenti))).status,401);
  // Admin can configure Sala/Bar products exactly like existing departments.
  for(const department of ['Sala','Bar']) {
    response=await addMaterial(context(env,'/admin/materials','POST',{name:'ADMIN '+department,department,supplier:'Test',default_price:3.50},admin));
    assert.equal(response.status,200,await response.clone().text());
  }
});

test('failed batch rolls back original schema and data', async()=>{
  const {env,db}=fixture();
  const batch=env.DB.batch;
  env.DB.batch=statements=>batch([...statements,env.DB.prepare('INSERT INTO nonexistent VALUES(1)')]);
  await assert.rejects(ensureWarehouseSchema(env));
  assert.ok(db.prepare("SELECT sql FROM sqlite_master WHERE name='raw_materials'").get().sql.includes("'Pizzeria','Cucina'"));
  assert.ok(db.prepare('SELECT COUNT(*) AS n FROM raw_materials').get().n>0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM staff_users WHERE username='CONOSCENTI'").get().n,0);
});
