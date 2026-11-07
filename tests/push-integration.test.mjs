import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {d1} from "./helpers.mjs";
import {finalizeIntent} from "../functions/_lib/checkout.js";
import {onRequestPost as bookingPost} from "../functions/api/bookings.js";
import {addDays,italyNow,weekday} from "../functions/_lib/booking.js";

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

test("confirmed customer booking queues an admin push, idempotent customer retries do not duplicate it",async()=>{
 const db=new DatabaseSync(":memory:"),env={DB:d1(db)};
 let date=addDays(italyNow().date,4);
 while(weekday(date)===1)date=addDays(date,1);
 const payload={date,time:"19:00",guests:2,name:"Mario Rossi",phone:"+393331234567",request_token:"d".repeat(64)};
 const makeRequest=()=>new Request("https://preview.example.com/api/bookings",{
   method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
 const first=await bookingPost({env,request:makeRequest()});
 assert.equal(first.status,201);
 const result=await first.json();
 assert.ok(result.booking.id);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM nf_webpush_events").get().n,1);
 const event=db.prepare("SELECT kind,target FROM nf_webpush_events").get();
 assert.equal(event.kind,"booking");assert.ok(event.target.includes(date));
 const second=await bookingPost({env,request:makeRequest()});
 assert.equal(second.status,201);
 assert.equal((await second.json()).booking.id,result.booking.id);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM booking_reservations").get().n,1);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM nf_webpush_events").get().n,1);
});
