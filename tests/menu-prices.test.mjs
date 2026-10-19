import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {onRequestPost as updateMenu} from '../functions/admin/menu.js';
import {onRequestGet as publicMenu} from '../functions/api/menu.js';
import {onRequestPost as adminLogin} from '../functions/admin/login.js';

async function fixture() {
  const db=new DatabaseSync(':memory:');
  const schema=readFileSync(new URL('../schema.sql',import.meta.url),'utf8');
  db.exec(schema.slice(0,schema.indexOf('-- Ordini')));
  db.exec("INSERT INTO categories(id,name) VALUES('pizze','Pizze')");
  const variants=[{prezzo:8,variante:'Personale'},{prezzo:17,variante:'Familiare'}];
  db.prepare('INSERT INTO products(id,category_id,name,price,prezzi_json,options_json,multi_options_json,mandatory_choice) VALUES(1,?,?,?,?,?,?,1)').run('pizze','Margherita',8,JSON.stringify(variants),'{"Impasto":[{"valore":"Classico"}]}','{"Extra":[{"valore":"Basilico"}]}');
  const env={ADMIN_TOKEN_SECRET:'test-menu-secret', DB:{
    prepare(sql) {
      let args=[];
      return {
        bind(...values) {args=values;return this;},
        async all(){return {results:db.prepare(sql).all(...args)};},
        async first(){return db.prepare(sql).get(...args)||null;},
        async run(){const r=db.prepare(sql).run(...args);return {meta:{last_row_id:Number(r.lastInsertRowid)}};},
      };
    },
  }};
  const source=readFileSync(new URL('../functions/admin/login.js',import.meta.url),'utf8');
  const username=source.match(/const USERNAME = '([^']+)'/)[1];
  const password=source.match(/const PASSWORD = '([^']+)'/)[1];
  const login=await adminLogin({env,request:new Request('https://example.com/admin/login',{method:'POST',body:JSON.stringify({username,password})})});
  const cookie=login.headers.get('set-cookie').split(';')[0];
  function save(body,authorized=true){return updateMenu({env,request:new Request('https://example.com/admin/menu',{method:'POST',headers:{'Content-Type':'application/json',Cookie:authorized?cookie:''},body:JSON.stringify(body)})});}
  const payload={action:'update_product',id:1,category_id:'pizze',name:'Margherita',description:'Pomodoro e mozzarella',active:1};
  const read=()=>publicMenu({env});
  return {db,save,payload,read,variants};
}

test('saving base price updates both fields and public menu while retaining formats and choices',async()=>{
 const {db,save,payload,read}=await fixture();
 const response=await save({...payload,price:9.75});
 assert.equal(response.status,200);
 const row=db.prepare('SELECT * FROM products WHERE id=1').get();
 assert.equal(row.price,9.75);
 assert.deepEqual(JSON.parse(row.prezzi_json),[{prezzo:9.75,variante:'Personale'},{prezzo:17,variante:'Familiare'}]);
 assert.equal(row.mandatory_choice,1);
 assert.ok(JSON.parse(row.options_json).Impasto);
 assert.ok(JSON.parse(row.multi_options_json).Extra);
 const menu=await read();assert.equal(menu.headers.get('Cache-Control'),'no-store');
 assert.equal((await menu.json())[0].prezzi[0].prezzo,9.75);
});

test('public menu reflects base price changes already saved by the old admin',async()=>{
 const {db,read}=await fixture();
 db.prepare('UPDATE products SET price=11.50 WHERE id=1').run();
 const item=(await (await read()).json())[0];
 assert.equal(item.prezzi[0].prezzo,11.5);
 assert.equal(item.prezzi[1].prezzo,17);
});

test('all variant prices can be edited, zero is retained, and omitted price stays unchanged',async()=>{
 const {db,save,payload,read}=await fixture();
 assert.equal((await save({...payload,price:0,prezzi_json:JSON.stringify([{prezzo:0,variante:'Personale'},{prezzo:20.25,variante:'Familiare'}])})).status,200);
 assert.deepEqual((await (await read()).json())[0].prezzi,[{prezzo:0,variante:'Personale'},{prezzo:20.25,variante:'Familiare'}]);
 assert.equal((await save({...payload,name:'Margherita aggiornata'})).status,200);
 assert.equal(db.prepare('SELECT price FROM products WHERE id=1').get().price,0);
});

test('invalid price/format and unauthenticated edits fail without changing stored prices',async()=>{
 const {db,save,payload}=await fixture();
 for(const price of [-1,'',null,'9oops','Infinity'])assert.equal((await save({...payload,price})).status,400);
 for(const prezzi_json of ['{}','[]','bad-json',JSON.stringify([{prezzo:8},{prezzo:-1}])])assert.equal((await save({...payload,price:8,prezzi_json})).status,400);
 assert.equal((await save({...payload,price:10},false)).status,401);
 assert.equal(db.prepare('SELECT price FROM products WHERE id=1').get().price,8);
});

test('new products share the same synchronized pricing and appear in the public menu',async()=>{
 const {save,read}=await fixture();
 const response=await save({action:'create_product',category_id:'pizze',name:'Nuova pizza',price:'12,50'});
 assert.equal(response.status,200);
 const item=(await (await read()).json()).find(p=>p.prodotto==='Nuova pizza');
 assert.deepEqual(item.prezzi,[{prezzo:12.5}]);
});
