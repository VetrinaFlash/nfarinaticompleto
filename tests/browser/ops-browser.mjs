import assert from "node:assert/strict";
import {mkdir,readFile} from "node:fs/promises";
import {chromium} from "playwright";

const ROOT="http://127.0.0.1:8874";
const VIEWS=[
 {name:"desktop",width:1440,height:900},
 {name:"mobile",width:390,height:844},
 {name:"small",width:320,height:700}
];
const [adminSource,menuSource]=await Promise.all([
 readFile("admin.html","utf8"),readFile("menu.html","utf8")
]);
assert.equal((adminSource.match(/href="admin-prenotazioni\.html"/g)||[]).length,0);
assert.ok(!menuSource.includes('href="/prenota.html"'));
assert.ok(adminSource.includes('id="nf-push-runtime-inline"'));
await mkdir("artifacts/booking-browser",{recursive:true});
const browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});

for(const viewport of VIEWS){
 const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height}});
 await context.addInitScript(()=>{
   let subscription=null;
   const registration={
     pushManager:{
       getSubscription:async()=>subscription,
       subscribe:async()=>{
         subscription={
           endpoint:"https://fcm.googleapis.com/fcm/send/mock-device",
           keys:{p256dh:"mock",auth:"mock"},
           toJSON(){return {endpoint:this.endpoint,keys:this.keys}},
           async unsubscribe(){subscription=null;return true}
         };
         return subscription;
       }
     }
   };
   Object.defineProperty(window,"PushManager",{configurable:true,value:class FakePushManager{}});
   const FakeNotification={permission:"default",requestPermission:async()=>{
     FakeNotification.permission="granted";return "granted";
   }};
   Object.defineProperty(window,"Notification",{configurable:true,value:FakeNotification});
   Object.defineProperty(navigator,"serviceWorker",{configurable:true,value:{
     getRegistration:async()=>registration,register:async()=>registration,ready:Promise.resolve(registration)
   }});
 });
 const page=await context.newPage();
 const actions=[];
 await page.route("**/admin/check",r=>r.fulfill({json:{authenticated:true}}));
 await page.route("**/admin/push",r=>{
   if(r.request().method()==="GET")return r.fulfill({json:{
     configured:true,publicKey:"BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
     keyStatus:{public:"ok",private:"ok"},activeDevices:actions.some(x=>x.action==="subscribe")?1:0,pending:0
   }});
   const body=r.request().postDataJSON();
   actions.push(body);
   return r.fulfill({json:body.action==="test"?{ok:true,accepted:1,failed:0}:{ok:true,id:"mock"}});
 });
 await page.route("**/admin/stats",r=>r.fulfill({json:{
   today:{revenue:0,orders:0},total:{revenue:0,orders:0},daily:[]
 }}));
 await page.route("**/admin/orders?*",r=>r.fulfill({json:{orders:[],total:0,page:1,limit:30}}));
 await page.goto(ROOT+"/index.html",{waitUntil:"domcontentloaded"});
 assert.equal(await page.locator('a[href="/prenota.html"],a[href="prenota.html"]').count(),0);
 await page.goto(ROOT+"/menu.html",{waitUntil:"domcontentloaded"});
 assert.equal(await page.locator('a[href="/prenota.html"],a[href="prenota.html"]').count(),0);
 await page.goto(ROOT+"/admin.html",{waitUntil:"domcontentloaded"});
 await page.locator("#nf-push-widget").waitFor({state:"attached"});
 assert.equal(await page.locator('a[href="admin-prenotazioni.html"]').count(),0);
 assert.equal(await page.locator('script[src="/booking-admin-badge.js"]').count(),0);
 assert.ok(await page.locator('#nf-push-enable').count()===1,"order push controls remain in admin");
 await page.waitForFunction(()=>/Notifiche non attive|Attiva per ricevere/.test(document.querySelector("#nf-push-status")?.textContent||""));
 await page.locator("#nf-push-enable").evaluate(e=>e.click());
 await page.waitForFunction(()=>!document.querySelector("#nf-push-test")?.hidden);
 assert.equal(actions.filter(x=>x.action==="subscribe").length,1);
 assert.equal(actions.find(x=>x.action==="subscribe").bookings,false);
 await page.locator("#nf-push-test").evaluate(e=>e.click());
 await page.waitForFunction(()=>actions.length>0 && document.querySelector("#nf-push-status")?.textContent.includes("Prova")===false).catch(()=>{});
 const tests=actions.filter(x=>x.action==="test");
 assert.equal(tests.length,1);
 assert.equal(tests[0].endpoint,"https://fcm.googleapis.com/fcm/send/mock-device",
   "a manual test may not be broadcast to all registered phones");
 assert.ok(actions.every(x=>x.action==="subscribe"||x.action==="test"));
 if(viewport.width<=390){
   const width=await page.evaluate(()=>document.documentElement.scrollWidth);
   assert.ok(width<=viewport.width+5,"admin mobile overflow "+width);
 }
 await page.screenshot({path:"artifacts/booking-browser/"+viewport.name+"-order-admin.png",fullPage:true});
 await context.close();
}
const get=await fetch(ROOT+"/prenota.html");
assert.equal(get.status,404,"removed public booking static page must not remain in build output");
await browser.close();
console.log("PASS: old booking UI removed, order admin intact and push test targets requesting device");
