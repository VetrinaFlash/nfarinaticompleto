import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { pbkdf2Sync, createHmac } from "node:crypto";
import { d1, adminCookie } from "./helpers.mjs";
import {
  ensureAuth,
  sha256,
  sessionCookie,
  session,
  logout,
  verifyPassword,
} from "../functions/_lib/auth.js";
import { onRequestPost as staffLogin } from "../functions/staff/login.js";
import { onRequestPost as adminLogin } from "../functions/admin/login.js";
import { onRequestGet as checkAdmin } from "../functions/admin/check.js";
import { onRequest as middleware } from "../functions/_middleware.js";
import {
  priceOrder,
  createIntent,
  confirmOrder,
  finalizeIntent,
} from "../functions/_lib/checkout.js";
import { onRequestPost as saveOrder } from "../functions/api/orders.js";
function fixture() {
  const db = new DatabaseSync(":memory:");
  const schema = readFileSync(
    new URL("../schema.sql", import.meta.url),
    "utf8",
  );
  db.exec(
    schema.slice(
      0,
      schema.indexOf(
        "-- ============================================================",
        schema.indexOf("-- Impostazioni"),
      ),
    ),
  );
  db.exec(
    readFileSync(new URL("../schema-magazzino.sql", import.meta.url), "utf8"),
  );
  db.exec(
    'INSERT INTO categories(id,name) VALUES(\'pizza\',\'Pizza\'); INSERT INTO products(id,category_id,name,price,prezzi_json,options_json,multi_options_json) VALUES(999,\'pizza\',\'Pizza test\',10,\'[{"prezzo":10,"variante":"Personale"},{"prezzo":20,"variante":"Familiare"}]\',\'{"Impasto":[{"valore":"Classico","supplemento":0},{"valore":"Integrale","supplemento":2}]}\',\'{"Salse":[{"valore":"BBQ","supplemento":1}]}\')',
  );
  return { db, env: { DB: d1(db) } };
}
const request = (path, body, cookie = "", ip = "audit") =>
  new Request("https://example.com" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      "CF-Connecting-IP": ip,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const cart = () => ({
  customerName: "Cliente test",
  customerPhone: "3331234567",
  pickupTime: "20:30",
  orderType: "takeaway",
  deliveryAddress: "",
  notes: "Senza sale",
  items: [
    {
      productId: 999,
      qty: 2,
      selections: { variante: "Familiare", Impasto: "Integrale" },
      multi: { Salse: ["BBQ"] },
      removed: ["basilico"],
    },
  ],
  promoCode: "",
  paymentMethod: "contanti",
  total: 0.01,
  discountRate: 1,
});

test("default secret, expired signed tokens and staff-in-admin-cookie all fail across admin endpoints", async () => {
  const { env } = fixture();
  const cookie = await adminCookie(env);
  assert.equal(
    (
      await (
        await checkAdmin({
          env,
          request: request("/admin/check", undefined, cookie),
        })
      ).json()
    ).authenticated,
    true,
  );
  const payload = "admin:" + Date.now(),
    token =
      payload +
      "." +
      createHmac("sha256", "default-dev-secret-change-in-prod")
        .update(payload)
        .digest("hex");
  for (const bad of [
    "nfarinati_admin_session=" + encodeURIComponent(token),
    "__Host-nfarinati_admin_v2=" + token,
    "nfarinati_admin_session=admin%3A1.invalid",
  ]) {
    assert.equal(
      (
        await (
          await checkAdmin({
            env,
            request: request("/admin/check", undefined, bad),
          })
        ).json()
      ).authenticated,
      false,
    );
  }
  const signedStaff = await staffLogin({
    env,
    request: request("/staff/login", {
      username: "GRAZIANO",
      password: "GRAZIANO",
    }),
  });
  assert.equal(signedStaff.status, 200);
  const staffCookie = signedStaff.headers.get("set-cookie").split(";")[0];
  const endpoints = [
    "customers",
    "orders",
    "settings",
    "stats",
    "promocodes",
    "menu",
    "materials",
    "suppliers",
    "supply-orders",
    "repair-menu-options",
    "staff-access",
  ];
  for (const name of endpoints) {
    const module = await import("../functions/admin/" + name + ".js");
    const handler = module.onRequestGet || module.onRequest;
    for (const badCookie of [
      "",
      staffCookie,
      staffCookie.replace(
        "__Host-nfarinati_staff_v2",
        "__Host-nfarinati_admin_v2",
      ),
    ]) {
      const res = await handler({
        env,
        request: request("/admin/" + name, undefined, badCookie),
      });
      assert.ok([401, 403].includes(res.status), name + " " + res.status);
    }
  }
});

test("existing staff password is retained, upgraded once, and role, expiry and logout are enforced", async () => {
  const { env, db } = fixture();
  const original = db
    .prepare(
      "SELECT password_hash FROM staff_users WHERE username='CONOSCENTI'",
    )
    .get().password_hash;
  const login = await staffLogin({
    env,
    request: request("/staff/login", {
      username: "CONOSCENTI",
      password: "CONOSCENTI",
    }),
  });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly; Secure;/);
  assert.match(setCookie, /SameSite=Strict/);
  const cookie = setCookie.split(";")[0];
  const encoded = db
    .prepare(
      "SELECT password_hash FROM staff_users WHERE username='CONOSCENTI'",
    )
    .get().password_hash;
  assert.notEqual(encoded, original);
  assert.equal(await verifyPassword("CONOSCENTI", encoded), true);
  assert.equal(await verifyPassword("wrong", encoded), false);
  assert.equal(
    (await session(env, request("/staff/check", undefined, cookie), "staff"))
      .role,
    "staff",
  );
  db.prepare(
    "UPDATE staff_users SET active=0 WHERE username='CONOSCENTI'",
  ).run();
  assert.equal(
    await session(env, request("/staff/check", undefined, cookie), "staff"),
    null,
  );
  db.prepare(
    "UPDATE staff_users SET active=1 WHERE username='CONOSCENTI'",
  ).run();
  await logout(env, request("/staff/logout", {}, cookie), "staff");
  assert.equal(
    await session(env, request("/staff/check", undefined, cookie), "staff"),
    null,
  );
  const admin = await adminCookie(env);
  db.prepare("UPDATE security_sessions SET expires_at=1").run();
  assert.equal(
    await session(env, request("/admin/check", undefined, admin), "admin"),
    null,
  );
});

test("admin login verifies a salted password without resetting it; brute force is limited", async () => {
  const { env, db } = fixture();
  await ensureAuth(env);
  const salt = "1234567890abcdef";
  const hash =
    "pbkdf2-sha256$100000$" +
    salt +
    "$" +
    pbkdf2Sync("AuditTestPassword", salt, 100000, 32, "sha256").toString("hex");
  db.prepare(
    "INSERT INTO security_credentials(kind,username,password_hash) VALUES(?,?,?)",
  ).run("admin", "TEST", hash);
  const ok = await adminLogin({
    env,
    request: request("/admin/login", {
      username: "TEST",
      password: "AuditTestPassword",
    }),
  });
  assert.equal(ok.status, 200);
  assert.ok(
    await session(
      env,
      request(
        "/admin/check",
        undefined,
        ok.headers.get("set-cookie").split(";")[0],
      ),
      "admin",
    ),
  );
  for (let i = 0; i < 9; i++)
    assert.equal(
      (
        await adminLogin({
          env,
          request: request("/admin/login", {
            username: "TEST",
            password: "wrong",
          }),
        })
      ).status,
      401,
    );
  assert.equal(
    (
      await adminLogin({
        env,
        request: request("/admin/login", {
          username: "TEST",
          password: "wrong",
        }),
      })
    ).status,
    429,
  );
  assert.equal(
    db
      .prepare(
        "SELECT password_hash FROM security_credentials WHERE username='TEST'",
      )
      .get().password_hash,
    hash,
  );
});

test("middleware rejects cross-origin writes, unsafe bodies, source files and anonymous admin routes", async () => {
  const { env } = fixture();
  const call = (req) =>
    middleware({ env, request: req, next: async () => new Response("ok") });
  assert.equal(
    (
      await call(
        new Request("https://example.com/admin/menu", {
          method: "POST",
          headers: {
            Origin: "https://evil.test",
            "Content-Type": "application/json",
          },
          body: "{}",
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        new Request("https://example.com/api/orders", {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: "{}",
        }),
      )
    ).status,
    415,
  );
  assert.equal(
    (await call(request("/api/orders", { x: "x".repeat(70000) }))).status,
    413,
  );
  for (const path of [
    "/schema.sql",
    "/schema%2esql",
    "/%66unctions/admin/login.js",
    "/wrangler.toml",
    "/tests/security.test.mjs",
    "/functions/admin/login.js",
  ])
    assert.equal((await call(request(path))).status, 404);
  assert.equal((await call(request("/admin/customers"))).status, 401);
  const page = await call(request("/menu.html"));
  assert.match(
    page.headers.get("Content-Security-Policy"),
    /frame-ancestors 'none'/,
  );
  assert.equal(page.headers.get("X-Frame-Options"), "DENY");
  assert.equal(page.headers.get("Access-Control-Allow-Origin"), null);
});

test("server prices formats, mandatory choices, extras, promotions and delivery and rejects tampering", async () => {
  const { env, db } = fixture();
  db.prepare(
    "INSERT INTO promo_codes(code,type,value) VALUES('TEST','fixed',3)",
  ).run();
  const input = cart();
  input.promoCode = "TEST";
  input.orderType = "delivery";
  input.deliveryAddress = "Via Test 1, Bagheria";
  const out = await priceOrder(env, input);
  assert.equal(out.subtotal, 46);
  assert.equal(out.promoDiscount, 3);
  assert.equal(out.deliveryFee, 2.5);
  assert.equal(out.total, 40.9);
  assert.equal(out.items[0].price, 23);
  for (const mutate of [
    (b) => (b.items[0].qty = -1),
    (b) => (b.items[0].qty = 1.5),
    (b) => (b.items[0].productId = 999999),
    (b) => (b.items[0].selections.variante = "Falso"),
    (b) => delete b.items[0].selections.Impasto,
    (b) => (b.items[0].multi.Salse = ["BBQ", "BBQ"]),
    (b) => (b.paymentMethod = "FREE"),
    (b) => (b.customerName = 123),
    (b) => (b.notes = "a".repeat(1001)),
  ]) {
    const bad = cart();
    mutate(bad);
    await assert.rejects(() => priceOrder(env, bad));
  }
  db.prepare("UPDATE products SET active=0 WHERE id=999").run();
  await assert.rejects(() => priceOrder(env, cart()));
});

test("cash confirmation is authorized by random receipt and idempotent including CRM updates", async () => {
  const { env, db } = fixture();
  const intent = await createIntent(env, request("/api/checkout", cart()));
  assert.equal(intent.order.total, 41.4);
  assert.match(intent.orderId, /^NFAR-/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders").get().n, 0);
  await assert.rejects(() =>
    confirmOrder(env, { orderId: intent.orderId, orderToken: "b".repeat(64) }),
  );
  await confirmOrder(env, intent);
  await confirmOrder(env, intent);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders").get().n, 1);
  assert.equal(
    db.prepare("SELECT order_count,total_spent FROM customers").get()
      .order_count,
    1,
  );
  assert.equal(db.prepare("SELECT total FROM orders").get().total, 41.4);
  const old = await saveOrder({
    env,
    request: request("/api/orders", {
      ...cart(),
      orderId: "INJECTED",
      total: 0.01,
    }),
  });
  assert.equal(old.status, 400);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders").get().n, 1);
});

test("card orders require server-confirmed SumUp status, amount, reference and successful transaction", async () => {
  const { env, db } = fixture();
  env.SUMUP_SECRET_KEY = "test";
  env.SUMUP_EMAIL = "merchant@test.invalid";
  const realFetch = globalThis.fetch;
  let paid = false,
    wrong = false,
    transaction = true;
  let ref;
  globalThis.fetch = async (url, options) => {
    if (options?.method === "POST") {
      ref = JSON.parse(options.body);
      return Response.json({ id: "sumup-test" });
    }
    return Response.json({
      id: "sumup-test",
      checkout_reference: ref.checkout_reference,
      amount: wrong ? 0.01 : ref.amount,
      currency: "EUR",
      status: paid ? "PAID" : "PENDING",
      pay_to_email: env.SUMUP_EMAIL,
      transactions: transaction
        ? [{ status: "SUCCESSFUL", amount: ref.amount, currency: "EUR" }]
        : [],
    });
  };
  try {
    const input = cart();
    input.paymentMethod = "carta";
    const intent = await createIntent(env, request("/api/checkout", input));
    assert.equal(ref.amount, 41.4);
    await assert.rejects(() => confirmOrder(env, intent));
    paid = true;
    wrong = true;
    await assert.rejects(() => confirmOrder(env, intent));
    wrong = false;
    transaction = false;
    await assert.rejects(() => confirmOrder(env, intent));
    transaction = true;
    await confirmOrder(env, intent);
    const row = db
      .prepare("SELECT * FROM checkout_intents WHERE id=?")
      .get(intent.orderId);
    await finalizeIntent(env, row);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders").get().n, 1);
    assert.equal(
      db.prepare("SELECT order_count FROM customers").get().order_count,
      1,
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("existing logout, setup and repair requests without JSON bodies remain supported", async () => {
  const { env } = fixture();
  const cookie = await adminCookie(env);
  for (const path of [
    "/admin/logout",
    "/staff/logout",
    "/admin/setup-magazzino",
    "/admin/upgrade-warehouse",
    "/admin/repair-menu-options",
  ]) {
    const res = await middleware({
      env,
      request: new Request("https://example.com" + path, {
        method: "POST",
        headers: { Cookie: cookie },
      }),
      next: async () => new Response("ok"),
    });
    assert.equal(res.status, 200, path);
  }
  for (const body of [
    "null",
    "[]",
    "{broken",
    '{"__proto__":{"polluted":true}}',
  ]) {
    const res = await middleware({
      env,
      request: new Request("https://example.com/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body,
      }),
      next: async () => new Response("ok"),
    });
    assert.equal(res.status, 400);
  }
});
