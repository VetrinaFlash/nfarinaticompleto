import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { d1, adminCookie } from "./helpers.mjs";
import { onRequestPost as menuPost } from "../functions/admin/menu.js";
import { onRequestGet as publicMenu } from "../functions/api/menu.js";

async function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '🍴',
      sort_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1
    );
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      price REAL NOT NULL,
      image_url TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      mandatory_choice INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      prezzi_json TEXT DEFAULT '[]',
      options_json TEXT DEFAULT '{}',
      multi_options_json TEXT DEFAULT '{}',
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );
  `);

  db.prepare(
    "INSERT INTO categories(id,name,sort_order,active) VALUES('pizze-dessert','Pizze Dessert',15,1)"
  ).run();
  db.prepare(`
    INSERT INTO products(
      id,category_id,name,price,active,prezzi_json,options_json,multi_options_json
    ) VALUES(
      1,'pizze-dessert','Pizza Dessert Test',9,1,
      '[{{"prezzo":9,"variante":"Piccola"}},{{"prezzo":16,"variante":"Familiare"}}]',
      '{{}}','{{}}'
    )
  `.replaceAll("{{", "{").replaceAll("}}", "}")).run();

  const env = { DB: d1(db) };
  const cookie = await adminCookie(env);
  const call = (body, authorized = true) =>
    menuPost({
      env,
      request: new Request("https://example.com/admin/menu", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: authorized ? cookie : "",
        },
        body: JSON.stringify(body),
      }),
    });

  return { db, env, call };
}

test("category TEXT ids are updated without parseInt corruption", async () => {
  const { db, call } = await fixture();
  const response = await call({
    action: "update_category",
    id: "pizze-dessert",
    name: "Pizze Dessert",
    sort_order: 18,
  });
  assert.equal(response.status, 200);
  assert.equal(
    db.prepare("SELECT sort_order FROM categories WHERE id='pizze-dessert'").get().sort_order,
    18,
  );
});

test("a product can keep only the Piccola variation", async () => {
  const { db, env, call } = await fixture();
  const response = await call({
    action: "update_product",
    id: 1,
    name: "Pizza Dessert Test",
    category_id: "pizze-dessert",
    price: 9,
    prezzi_json: JSON.stringify([{ prezzo: 9, variante: "Piccola" }]),
  });
  assert.equal(response.status, 200);

  const row = db.prepare("SELECT prezzi_json FROM products WHERE id=1").get();
  assert.deepEqual(JSON.parse(row.prezzi_json), [
    { prezzo: 9, variante: "Piccola" },
  ]);

  const publicResponse = await publicMenu({ env });
  const item = (await publicResponse.json())[0];
  assert.deepEqual(item.prezzi, [{ prezzo: 9, variante: "Piccola" }]);
});

test("category deletion needs explicit confirmation when it contains products", async () => {
  const { db, call } = await fixture();

  let response = await call({
    action: "delete_category",
    id: "pizze-dessert",
  });
  assert.equal(response.status, 409);
  assert.ok(db.prepare("SELECT * FROM categories WHERE id='pizze-dessert'").get());

  response = await call({
    action: "delete_category",
    id: "pizze-dessert",
    delete_products: true,
  });
  assert.equal(response.status, 200);
  assert.equal(
    db.prepare("SELECT * FROM categories WHERE id='pizze-dessert'").get(),
    undefined,
  );
  assert.equal(db.prepare("SELECT COUNT(*) n FROM products").get().n, 0);
});

test("product trash really deletes while unauthorized writes stay blocked", async () => {
  const { db, call } = await fixture();
  assert.equal(
    (await call({ action: "delete_product", id: 1 }, false)).status,
    401,
  );
  assert.ok(db.prepare("SELECT * FROM products WHERE id=1").get());

  assert.equal(
    (await call({ action: "delete_product", id: 1 })).status,
    200,
  );
  assert.equal(db.prepare("SELECT * FROM products WHERE id=1").get(), undefined);
});
