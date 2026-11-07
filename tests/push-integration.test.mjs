import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {d1} from "./helpers.mjs";
import {finalizeIntent} from "../functions/_lib/checkout.js";

test("confirmed cash orders enqueue a single durable push without changing checkout status",async()=>{
 const db=new DatabaseSync(":memory:");
 const tables=[
 "CREATE TABLE checkout_intents(id TEXT PRIMARY KEY,finalized_at INTEGER)",
 "CREATE TABLE orders(id TEXT PRIMARY KEY,customer_name TEXT,customer_phone TEXT,pickup_time TEXT,order_type TEXT,delivery_address TEXT,notes TEXT,items_json TEXT,subtotal REAL,discount_rate REAL,promo_code TEXT,promo_discount REAL,delivery_fee REAL,total REAL,status TEXT,payment_method TEXT,created_at TEXT)",
 "CREATE TABLE customers(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,phone TEXT,order_count INTEGER,total_spent REAL,first_order_at TEXT,last_order_at TEXT)"
 ];tables.forEach(sql=>db.exec(sql));
 const env={DB:d1(db)};
 db.prepare("INSERT INTO checkout_intents(id,finalized_at) VALUES('paid-order',NULL)").run();
 const order={orderId:"paid-order",customerName:"Cliente Test",customerPhone:"+393331234567",
  pickupTime:"20:00",orderType:"takeaway",deliveryAddress:"",notes:"",items:[],
  subtotal:24,discountRate:0,promoCode:"",promoDiscount:0,deliveryFee:0,total:24,paymentMethod:"contanti"};
 const intent={id:"paid-order",payload_json:JSON.stringify(order),finalized_at:null};
 await finalizeIntent(env,intent,"https://preview.example.com");
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders").get().n,1);
 assert.equal(db.prepare("SELECT status FROM orders").get().status,"nuovo");
 assert.equal(db.prepare("SELECT kind,title,target FROM nf_webpush_events").get().kind,"order");
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM nf_webpush_events").get().n,1);
 await finalizeIntent(env,{...intent,finalized_at:Date.now()},"https://preview.example.com");
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders").get().n,1);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM nf_webpush_events").get().n,1);
});


test("replayed finalized checkout that predates push does NOT generate a surprise notification",async()=>{
 const db=new DatabaseSync(":memory:");
 db.exec("CREATE TABLE checkout_intents(id TEXT PRIMARY KEY,finalized_at INTEGER)");
 const env={DB:d1(db)};
 const order={orderId:"old-123",paymentMethod:"contanti"};
 const result=await finalizeIntent(env,{
   id:"old-123",payload_json:JSON.stringify(order),finalized_at:Date.now()-86400000
 },"https://preview.example.com");
 assert.equal(result.orderId,"old-123");
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='nf_webpush_events'").get().n,0);
});
