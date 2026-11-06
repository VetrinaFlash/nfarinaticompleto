import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { d1, adminCookie } from "./helpers.mjs";
import {
  ensureBookingSchema,bookingConfig,createBooking,changeStatus,fetchByToken,updateBooking,
  availableTimes,italyNow,addDays,weekday,timeText,validDate,extendBooking
} from "../functions/_lib/booking.js";
import {onRequestGet as adminGet,onRequestPost as adminPost} from "../functions/admin/bookings.js";
import {onRequestPost as publicPost} from "../functions/api/bookings.js";
import {onRequestPost as publicManage} from "../functions/api/booking-manage.js";

async function fixture() {
  const db=new DatabaseSync(":memory:"),env={DB:d1(db)};
  await ensureBookingSchema(env);
  let date=addDays(italyNow().date,2);
  while(weekday(date)===1)date=addDays(date,1);
  const req={name:"Mario Rossi",phone:"+39 333 1234567",email:"",notes:"",date,time:"19:00",guests:2};
  return {db,env,date,req};
}
const request=(path,body,cookie="")=>new Request("https://example.com"+path,{
  method:body===undefined?"GET":"POST",
  headers:{"Content-Type":"application/json",Cookie:cookie,"CF-Connecting-IP":"203.0.113.12"},
  ...(body===undefined?{}:{body:JSON.stringify(body)})
});

test("automatic and repeatable non-destructive schema setup, 90-minute default",async()=>{
 const {db,env}=await fixture();
 const cfg=await bookingConfig(env);
 assert.equal(cfg.duration_min,90);assert.equal(cfg.buffer_min,15);
 assert.equal(cfg.enabled,1);assert.equal(cfg.table_mode,0);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM booking_ticks").get().n,96);
 await ensureBookingSchema({DB:d1(db)});
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM booking_hours").get().n,7);
});
test("calendar dates are validated strictly",()=>{
 assert.equal(validDate("2026-02-30"),false);
 assert.equal(validDate("not-a-date"),false);
 assert.equal(validDate("2028-02-29"),true);
 assert.equal(timeText(1230),"20:30");
});
test("capacity is guaranteed by triggers and reservation is auto-confirmed",async()=>{
 const {db,env,req}=await fixture();
 db.prepare("UPDATE booking_config SET capacity=4,holdback=0").run();
 const [a,b]=await Promise.allSettled([createBooking(env,{...req,guests:3}),createBooking(env,{...req,name:"Luca Verde",guests:3})]);
 assert.equal([a,b].filter(x=>x.status==="fulfilled").length,1);
 const row=db.prepare("SELECT COUNT(*) AS n, SUM(guests) AS people FROM booking_reservations").get();
 assert.equal(row.n,1);assert.equal(row.people,3);
 const occupied=db.prepare("SELECT COUNT(*) AS n FROM booking_slot_inventory WHERE total=3").get().n;
 assert.equal(occupied,7); // 90 minutes plus 15-minute buffer, 15-minute occupancy buckets
 const winner=[a,b].find(x=>x.status==="fulfilled").value;
 assert.equal(winner.duration_min,90);
 assert.equal((await fetchByToken(env,winner.id,winner.token)).id,winner.id);
 assert.equal(await fetchByToken(env,winner.id,"a".repeat(64)),null);
 assert.equal((await changeStatus(env,winner.id,"cancelled")).ok,true);
 assert.equal(db.prepare("SELECT SUM(total) AS s FROM booking_slot_inventory").get().s,0);
 const fresh=await createBooking(env,{...req,guests:4});
 assert.equal(fresh.guests,4);
});
test("90-minute occupancy and 15-minute reset buffer prevent premature rebooking",async()=>{
 const {db,env,req}=await fixture();
 db.prepare("UPDATE booking_config SET capacity=2,holdback=0").run();
 await createBooking(env,req);
 await assert.rejects(createBooking(env,{...req,time:"20:30"}),/Disponibilità terminata|Posti esauriti/);
 const free=await createBooking(env,{...req,time:"21:00"});
 assert.equal(free.time,"21:00");
});
test("online holdback protects telephone slots but respects physical maximum",async()=>{
 const {db,env,req}=await fixture();
 db.prepare("UPDATE booking_config SET capacity=6,holdback=2").run();
 await createBooking(env,{...req,guests:4});
 await assert.rejects(createBooking(env,{...req,guests:1}),/Posti esauriti|Disponibilità terminata/);
 await createBooking(env,{...req,guests:2,name:"Cliente telefonico"},"manual");
 assert.equal(db.prepare("SELECT total FROM booking_slot_inventory LIMIT 1").get().total,6);
});
test("physical table mode forbids overlapping assignments independently of cap",async()=>{
 const {db,env,req}=await fixture();
 db.prepare("UPDATE booking_config SET capacity=10,holdback=0,table_mode=1").run();
 db.prepare("INSERT INTO booking_tables(id,label,seats) VALUES('t1','Tavolo 1',4)").run();
 const first=await createBooking(env,{...req,guests:4});
 assert.equal(db.prepare("SELECT table_id FROM booking_reservations WHERE id=?").get(first.id).table_id,"t1");
 await assert.rejects(createBooking(env,{...req,guests:2}),/tavoli disponibili|Disponibilità terminata/);
 db.prepare("INSERT INTO booking_tables(id,label,seats) VALUES('t2','Tavolo 2',4)").run();
 const second=await createBooking(env,{...req,guests:2});
 assert.equal(db.prepare("SELECT table_id FROM booking_reservations WHERE id=?").get(second.id).table_id,"t2");
});
test("editing a reservation reallocates capacity safely",async()=>{
 const {db,env,req}=await fixture();
 db.prepare("UPDATE booking_config SET capacity=4,holdback=0").run();
 const a=await createBooking(env,req);
 await updateBooking(env,a.id,{time:"21:00",guests:3});
 assert.equal(db.prepare("SELECT total FROM booking_slot_inventory WHERE minute=1140").get().total,0);
 assert.equal(db.prepare("SELECT total FROM booking_slot_inventory WHERE minute=1260").get().total,3);
 const b=await createBooking(env,req);
 await assert.rejects(updateBooking(env,b.id,{time:"21:00",guests:2}),/Posti insufficienti/);
 assert.equal(db.prepare("SELECT start_min FROM booking_reservations WHERE id=?").get(b.id).start_min,1140);
});
test("closed dates are excluded and server rejects late or invalid reservations",async()=>{
 const {db,env,req,date}=await fixture();
 const before=await availableTimes(env,date,2);
 assert.ok(before.times.includes("19:00"));
 db.prepare("INSERT INTO booking_closed_dates(date,reason) VALUES(?,?)").run(date,"Evento privato");
 const after=await availableTimes(env,date,2);
 assert.deepEqual(after.times,[]);
 await assert.rejects(createBooking(env,req),/Locale chiuso/);
});
test("public cancellation enforces customer token, returns availability",async()=>{
 const {env,req}=await fixture();
 const b=await createBooking(env,req);
 const fail=await publicManage({env,request:request("/api/booking-manage",{action:"cancel",id:b.id,token:"0".repeat(64)})});
 assert.equal(fail.status,404);
 const ok=await publicManage({env,request:request("/api/booking-manage",{action:"cancel",id:b.id,token:b.token})});
 assert.equal(ok.status,200);
 assert.equal((await ok.json()).status,"cancelled");
});
test("public booking accepts a valid request but does not accept missing phone",async()=>{
 const {env,req}=await fixture();
 const invalid=await publicPost({env,request:request("/api/bookings",{...req,phone:"123"})});
 assert.equal(invalid.status,400);
 const valid=await publicPost({env,request:request("/api/bookings",req)});
 assert.equal(valid.status,201);
 assert.equal((await valid.json()).booking.guests,2);
});
test("admin endpoints require login and allow configuration with existing session",async()=>{
 const {env}=await fixture();
 const unauthorized=await adminGet({env,request:request("/admin/bookings?mode=settings")});
 assert.equal(unauthorized.status,401);
 const cookie=await adminCookie(env);
 const authorized=await adminGet({env,request:request("/admin/bookings?mode=settings",undefined,cookie)});
 assert.equal(authorized.status,200);
 const saved=await adminPost({env,request:request("/admin/bookings",{action:"settings",config:{
   enabled:1,table_mode:0,capacity:40,holdback:4,max_party:8,duration_min:90,buffer_min:15,interval_min:30,
   advance_days:60,notice_min:60,grace_min:15
 }},cookie)});
 assert.equal(saved.status,200);
 assert.equal((await bookingConfig(env)).capacity,40);
});

test("idempotent booking submissions never reserve the same places twice",async()=>{
 const {db,env,req}=await fixture();
 db.prepare("UPDATE booking_config SET capacity=2,holdback=0").run();
 const request_token="c".repeat(64);
 const first=await createBooking(env,{...req,request_token});
 const repeat=await createBooking(env,{...req,request_token});
 assert.equal(first.id,repeat.id);
 assert.equal(first.token,repeat.token);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM booking_reservations").get().n,1);
 assert.equal(db.prepare("SELECT MAX(total) AS n FROM booking_slot_inventory").get().n,2);
});
test("calendar reminders use correct Rome summer/winter UTC offsets",async()=>{
 const {readFileSync}=await import("node:fs");
 const source=readFileSync(new URL("../prenota.html",import.meta.url),"utf8");
 const section=source.slice(source.indexOf("function romeAsUtc("),source.indexOf("function localIcs("));
 const rome=new Function(section+";return romeAsUtc;")();
 assert.equal(new Date(rome("2026-07-10","19:00")).toISOString(),"2026-07-10T17:00:00.000Z");
 assert.equal(new Date(rome("2026-12-10","19:00")).toISOString(),"2026-12-10T18:00:00.000Z");
 assert.match(source,/TRIGGER:-P1D/);assert.match(source,/TRIGGER:-PT2H/);
});

test("extending an occupied table cannot overlap a full later slot",async()=>{
 const {db,env,req}=await fixture();
 db.prepare("UPDATE booking_config SET capacity=2,holdback=0").run();
 const a=await createBooking(env,req);
 const b=await createBooking(env,{...req,time:"21:00"});
 await assert.rejects(extendBooking(env,a.id,30),/Impossibile prolungare/);
 assert.equal(db.prepare("SELECT end_min FROM booking_reservations WHERE id=?").get(a.id).end_min,1245);
 await changeStatus(env,b.id,"cancelled");
 const r=await extendBooking(env,a.id,30);
 assert.equal(r.end_min,1275);
 assert.equal(db.prepare("SELECT total FROM booking_slot_inventory WHERE minute=1260").get().total,2);
});

test("original 90-minute duration is preserved after future booking settings change",async()=>{
 const {db,env,req}=await fixture();
 const b=await createBooking(env,req);
 db.prepare("UPDATE booking_config SET duration_min=120,buffer_min=30").run();
 const original=await fetchByToken(env,b.id,b.token);
 assert.equal(original.duration_min,90);assert.equal(original.buffer_min,15);
 await updateBooking(env,b.id,{time:"21:00"});
 const row=db.prepare("SELECT end_min,duration_min,buffer_min FROM booking_reservations WHERE id=?").get(b.id);
 assert.equal(row.end_min,1260+90+15);
 assert.equal(row.duration_min,90);
 assert.equal(row.buffer_min,15);
});

test("lowering the cap never traps existing bookings: arrival and cancellation remain possible",async()=>{
 const {db,env,req}=await fixture();
 db.prepare("UPDATE booking_config SET capacity=10,holdback=0").run();
 const first=await createBooking(env,{...req,guests:5});
 const second=await createBooking(env,{...req,name:"Luca Rossi",guests:5});
 db.prepare("UPDATE booking_config SET capacity=4").run();
 await changeStatus(env,first.id,"arrived");
 assert.equal(db.prepare("SELECT MAX(total) AS n FROM booking_slot_inventory").get().n,10);
 await changeStatus(env,first.id,"cancelled");
 assert.equal(db.prepare("SELECT MAX(total) AS n FROM booking_slot_inventory").get().n,5);
 await changeStatus(env,second.id,"cancelled");
 assert.equal(db.prepare("SELECT MAX(total) AS n FROM booking_slot_inventory").get().n,0);
 const fresh=await createBooking(env,{...req,guests:4});
 assert.equal(fresh.guests,4);
});
test("relocating an existing table reservation automatically picks another suitable table",async()=>{
 const {db,env,req}=await fixture();
 db.prepare("UPDATE booking_config SET table_mode=1,capacity=12,holdback=0").run();
 db.prepare("INSERT INTO booking_tables(id,label,seats) VALUES('small','2 posti',2),('large','4 posti',4)").run();
 const a=await createBooking(env,req);
 assert.equal(db.prepare("SELECT table_id FROM booking_reservations WHERE id=?").get(a.id).table_id,"small");
 const result=await updateBooking(env,a.id,{guests:4});
 assert.equal(result.guests,4);
 assert.equal(db.prepare("SELECT table_id FROM booking_reservations WHERE id=?").get(a.id).table_id,"large");
});

test("empty service slots never advertise parties larger than the cap",async()=>{
 const {db,env,date,req}=await fixture();
 db.prepare("UPDATE booking_config SET capacity=4,holdback=1,max_party=8").run();
 assert.deepEqual((await availableTimes(env,date,5)).times,[]);
 assert.deepEqual((await availableTimes(env,date,4)).times,[]);
 assert.ok((await availableTimes(env,date,3)).times.includes("19:00"));
 await assert.rejects(createBooking(env,{...req,guests:4}),/Posti esauriti|Disponibilità/);
 const b=await createBooking(env,{...req,guests:3});
 assert.equal(b.guests,3);
});
test("minimum notice spans tomorrow and subsequent days",async()=>{
 const {db,env,date,req}=await fixture();
 db.prepare("UPDATE booking_config SET notice_min=10080").run(); // seven days
 assert.deepEqual((await availableTimes(env,date,2)).times,[]);
 await assert.rejects(createBooking(env,req),/troppo vicino/);
 const ahead=addDays(italyNow().date,10);
 let candidate=ahead;
 while(weekday(candidate)===1)candidate=addDays(candidate,1);
 assert.ok((await availableTimes(env,candidate,2)).times.includes("19:00"));
});
test("late-night bookings with occupancy extending past midnight are not accepted",async()=>{
 const {db,env,date,req}=await fixture();
 db.prepare("UPDATE booking_hours SET opens='20:00',closes='23:45' WHERE weekday=?").run(weekday(date));
 db.prepare("UPDATE booking_config SET duration_min=120,buffer_min=60,interval_min=15").run();
 const times=(await availableTimes(env,date,2)).times;
 assert.ok(times.includes("20:00"));
 assert.ok(!times.includes("21:15"));
 await assert.rejects(createBooking(env,{...req,time:"21:15"}),/Orario non disponibile/);
});
test("a phone booking uses the same capacity pool and can be marked no-show manually",async()=>{
 const {db,env,req,date}=await fixture();
 db.prepare("UPDATE booking_config SET capacity=3,holdback=0,max_party=3").run();
 const phone=await createBooking(env,{...req,name:"Cliente telefono",guests:3},"manual");
 assert.deepEqual((await availableTimes(env,date,2)).times.filter(t=>t==="19:00"),[]);
 const noshow=await changeStatus(env,phone.id,"no_show");
 assert.equal(noshow.status,"no_show");
 assert.ok((await availableTimes(env,date,2)).times.includes("19:00"));
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM booking_reservations WHERE status='no_show'").get().n,1);
});
test("automatic time-based reuse doesn't require manual status completion",async()=>{
 const {db,env,req,date}=await fixture();
 db.prepare("UPDATE booking_config SET capacity=4,holdback=0,max_party=4").run();
 const a=await createBooking(env,{...req,guests:4});
 await changeStatus(env,a.id,"seated");
 assert.equal(db.prepare("SELECT status FROM booking_reservations WHERE id=?").get(a.id).status,"seated");
 assert.ok(!(await availableTimes(env,date,4)).times.includes("20:30"));
 assert.ok((await availableTimes(env,date,4)).times.includes("21:00")); // 90 minutes + 15 buffer
 const b=await createBooking(env,{...req,time:"21:00",guests:4,name:"Cliente secondo turno"});
 assert.equal(b.time,"21:00");
});

test("customer cannot free an occupied table after staff marks arrival",async()=>{
 const {db,env,req}=await fixture();
 const b=await createBooking(env,req);
 await changeStatus(env,b.id,"arrived");
 const response=await publicManage({env,request:request("/api/booking-manage",
    {action:"cancel",id:b.id,token:b.token})});
 assert.equal(response.status,409);
 assert.equal(db.prepare("SELECT status FROM booking_reservations WHERE id=?").get(b.id).status,"arrived");
 assert.equal(db.prepare("SELECT MAX(total) AS n FROM booking_slot_inventory").get().n,2);
});
