import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { d1, adminCookie } from "./helpers.mjs";
import { onRequestGet as customersGet } from "../functions/admin/customers.js";
import { onRequestPut as ordersPut } from "../functions/admin/orders.js";

async function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      order_count INTEGER DEFAULT 1,
      total_spent REAL DEFAULT 0,
      first_order_at TEXT,
      last_order_at TEXT
    );
    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_phone TEXT DEFAULT '',
      pickup_time TEXT NOT NULL,
      order_type TEXT DEFAULT 'takeaway',
      delivery_address TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      items_json TEXT NOT NULL,
      subtotal REAL NOT NULL,
      discount_rate REAL DEFAULT 0,
      promo_code TEXT DEFAULT '',
      promo_discount REAL DEFAULT 0,
      delivery_fee REAL DEFAULT 0,
      total REAL NOT NULL,
      status TEXT DEFAULT 'nuovo',
      payment_method TEXT DEFAULT 'contanti',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);
  db.prepare(
    "INSERT INTO customers(id,name,phone,total_spent) VALUES(1,'Mario Rossi','111',10),(2,'Mario Rossi','222',20)"
  ).run();
  db.prepare(
    `INSERT INTO orders(id,customer_name,customer_phone,pickup_time,items_json,subtotal,total,status)
     VALUES('A','Mario Rossi','111','20:00','[]',10,10,'nuovo'),
           ('B','Mario Rossi','222','20:30','[]',20,20,'nuovo')`
  ).run();

  const env = { DB: d1(db) };
  const cookie = await adminCookie(env);
  return { db, env, cookie };
}

test("customer detail does not mix homonyms with different phone numbers", async () => {
  const { env, cookie } = await fixture();
  const res = await customersGet({
    env,
    request: new Request("https://example.com/admin/customers?id=1", {
      headers: { Cookie: cookie },
    }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data.orders.map((o) => o.id), ["A"]);
});

test("missing customer and missing order return 404 instead of false success/500", async () => {
  const { env, cookie } = await fixture();

  const customer = await customersGet({
    env,
    request: new Request("https://example.com/admin/customers?id=999", {
      headers: { Cookie: cookie },
    }),
  });
  assert.equal(customer.status, 404);

  const order = await ordersPut({
    env,
    request: new Request("https://example.com/admin/orders", {
      method: "PUT",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: "MISSING", status: "pronto" }),
    }),
  });
  assert.equal(order.status, 404);
});
