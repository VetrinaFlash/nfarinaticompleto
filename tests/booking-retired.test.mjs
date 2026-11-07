import test from "node:test";
import assert from "node:assert/strict";
import {readFile,access} from "node:fs/promises";
import {DatabaseSync} from "node:sqlite";
import {onRequestGet as bookingGet,onRequestPost as bookingPost} from "../functions/api/bookings.js";
import {onRequestGet as manageGet,onRequestPost as managePost} from "../functions/api/booking-manage.js";
import {onRequestGet as configGet} from "../functions/api/booking-config.js";
import {onRequestGet as adminGet,onRequestPost as adminPost} from "../functions/admin/bookings.js";
import {onRequestGet as customerPage} from "../functions/prenota.html.js";
import {onRequestGet as adminPage} from "../functions/admin-prenotazioni.html.js";

const routes=[
  ["customer availability",bookingGet],
  ["customer booking",bookingPost],
  ["customer manage GET",manageGet],
  ["customer manage POST",managePost],
  ["booking config",configGet],
  ["admin booking GET",adminGet],
  ["admin booking POST",adminPost]
];
test("all retired booking endpoints reject access before touching data",async()=>{
 const db=new DatabaseSync(":memory:");
 db.exec("CREATE TABLE booking_reservations(id TEXT PRIMARY KEY,name TEXT)");
 db.prepare("INSERT INTO booking_reservations(id,name) VALUES('legacy-1','Historical guest')").run();
 const env={DB:{prepare(){throw Error("Booking D1 should not be touched")}}};
 for(const [name,handler] of routes){
   const result=await handler({env,request:new Request("https://example.com/api/bookings",{
     method:name.includes("POST")||name==="customer booking"||name==="admin booking POST"?"POST":"GET"
   })});
   assert.equal(result.status,410,name);
   assert.equal((await result.json()).code,"TABLE_BOOKING_RETIRED",name);
   assert.equal(result.headers.get("Cache-Control"),"no-store");
 }
 assert.equal(db.prepare("SELECT name FROM booking_reservations WHERE id='legacy-1'").get().name,"Historical guest");
});
test("old reservation HTML routes are gone without deleting historical privacy notice",async()=>{
 for(const handler of [customerPage,adminPage]){
   const response=await handler({});
   assert.equal(response.status,410);
   assert.equal(response.headers.get("X-Robots-Tag"),"noindex");
 }
 for(const file of ["prenota.html","admin-prenotazioni.html","booking-admin-badge.js"]){
   await assert.rejects(()=>access(file),"Removed booking UI must not ship: "+file);
 }
 assert.ok((await readFile("privacy-prenotazioni.html","utf8")).length>50);
});
test("main website and menu no longer promote table reservations",async()=>{
 const [home,menu,admin,worker]=await Promise.all([
   readFile("index.html","utf8"),readFile("menu.html","utf8"),
   readFile("admin.html","utf8"),readFile("push-sw.js","utf8")
 ]);
 assert.ok(!/<a[^>]+href=["']\/?prenota\.html["']/i.test(home));
 assert.ok(!/<a[^>]+href=["']\/?prenota\.html["']/i.test(menu));
 assert.ok(!admin.includes("admin-prenotazioni.html"));
 assert.ok(!admin.includes("booking-admin-badge.js"));
 assert.ok(admin.includes('id="nf-push-runtime-inline"'),
   "the existing order-only push setup remains available");
 assert.ok(worker.includes('info.kind!=="order"'),
   "old booking pushes must be filtered on device");
 assert.ok(worker.includes('info.manualTest===true'),
   "test pushes must require explicit manual flag");
});
