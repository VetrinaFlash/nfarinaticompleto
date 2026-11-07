import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";

const ROOT="http://127.0.0.1:8874";
const VIEWS=[{label:"desktop",width:1440,height:900},{label:"mobile",width:390,height:844},{label:"small",width:320,height:700}];
await mkdir("artifacts/booking-browser",{recursive:true});
const browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
const fixture={id:"12345678-1234-4123-9123-123456789abc",token:"a".repeat(64),code:"NF-12345678",
 name:"Mario Rossi",phone:"+393331234567",email:"",notes:"",date,time:"20:30",guests:4,
 duration_min:90,buffer_min:15,status:"confirmed"};
const times=["18:30","19:00","19:30","20:00","20:30","21:00","21:30"];
const config={enabled:true,max_party:8,advance_days:60,duration_min:90,buffer_min:15,interval_min:30,turnstile_site_key:null};
const actions=[];
const mainAdminSource=await readFile("admin.html","utf8");
assert.equal((mainAdminSource.match(/class="nav-item" href="admin-prenotazioni\.html"/g)||[]).length,1,
  "Admin sidebar has exactly one Prenotazioni e tavoli entry");
assert.ok(mainAdminSource.includes("Prenotazioni e tavoli"));
function agentError(page){const errors=[];page.on("pageerror",error=>errors.push(String(error)));return errors}
async function clearOverflow(page,label) {
 const x=await page.evaluate(()=>({width:innerWidth,content:document.documentElement.scrollWidth}));
 assert.ok(x.content <= x.width+3,label+" overflow: "+JSON.stringify(x));
}
for(const viewport of VIEWS){
 const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},acceptDownloads:true});
 const page=await context.newPage(),errors=agentError(page);
 await page.route("**/api/booking-config",r=>r.fulfill({json:config}));
 await page.route(/\/api\/bookings(?:\?|$)/,r=>{
   if(r.request().method()==="GET")return r.fulfill({json:{date,guests:4,times,...config}});
   const body=r.request().postDataJSON();
   assert.equal(body.guests,4);assert.equal(body.time,"20:30");assert.equal(body.phone,"+393331234567");
   assert.equal(body.request_token.length,64);
   actions.push({kind:"public",body});
   return r.fulfill({status:201,json:{ok:true,booking:fixture}});
 });
 await page.route(/\/api\/booking-manage(?:\?|$)/,r=>{
   if(r.request().method()==="GET")return r.fulfill({json:{booking:{...fixture}}});
   const data=r.request().postDataJSON();actions.push({kind:"manage",data});
   return r.fulfill({json:data.action==="cancel"?{ok:true,status:"cancelled"}:{ok:true,date:data.date,time:data.time,guests:data.guests}});
 });
 await page.goto(ROOT+"/index.html",{waitUntil:"domcontentloaded"});
 await clearOverflow(page,viewport.label+" original homepage with reservation CTA");
 assert.equal(await page.locator('a[href="prenota.html"]').count(),0,
   "the table-booking button must remain hidden on the homepage");
 assert.ok(await page.locator('a[href="menu.html"]').count()>0,"the existing online-order links remain visible");
 await page.goto(ROOT+"/prenota.html",{waitUntil:"domcontentloaded"});
 await page.locator(".time").first().waitFor();
 await page.locator("#guests").selectOption("4");
 await page.locator(".time").first().waitFor();
 assert.ok(await page.locator("body").evaluate(e=>getComputedStyle(e).fontFamily.includes("Poppins")));
 assert.equal(await page.locator("body").evaluate(e=>getComputedStyle(e).backgroundColor),"rgb(255, 255, 255)");
 await clearOverflow(page,viewport.label+" public");
 await page.screenshot({path:"artifacts/booking-browser/"+viewport.label+"-public.png",fullPage:true});
 await page.getByRole("button",{name:/Primo turno/}).click();
 assert.equal(await page.getByRole("button",{name:"20:30",exact:true}).count(),0);
 await page.getByRole("button",{name:/Secondo turno/}).click();
 await page.getByRole("button",{name:"20:30",exact:true}).click();
 await page.locator("#name").fill("Mario Rossi");
 await page.locator("#phone").fill("+393331234567");
 await page.locator("#privacy").check();
 await page.locator("#submit").click();
 await page.locator("#done").waitFor({state:"visible"});
 assert.equal(await page.locator("#done-details").getByText("20:30").count(),1);
 assert.match(await page.locator("#done-duration-note").textContent(),/90 minuti.*75 minuti.*15 minuti/);
 await page.screenshot({path:"artifacts/booking-browser/"+viewport.label+"-confirmation.png",fullPage:true});
 const googleUrl=await page.locator("#google").getAttribute("href");
 assert.ok(googleUrl.startsWith("https://calendar.google.com/"));
 assert.match(new URL(googleUrl).searchParams.get("dates"),/T203000\/.*T214500$/,
   "Google Calendar must last only 75 dining minutes");
 const [download]=await Promise.all([page.waitForEvent("download"),page.locator("#ics").click()]);
 const ics=await readFile(await download.path(),"utf8");
 assert.match(ics,/BEGIN:VCALENDAR/);assert.match(ics,/TRIGGER:-P1D/);assert.match(ics,/TRIGGER:-PT2H/);
 const startStamp=ics.match(/^DTSTART:(\d{8}T\d{6}Z)$/m)?.[1];
 const endStamp=ics.match(/^DTEND:(\d{8}T\d{6}Z)$/m)?.[1];
 assert.ok(startStamp&&endStamp);
 const parseStamp=x=>Date.UTC(Number(x.slice(0,4)),Number(x.slice(4,6))-1,Number(x.slice(6,8)),
   Number(x.slice(9,11)),Number(x.slice(11,13)),Number(x.slice(13,15)));
 assert.equal((parseStamp(endStamp)-parseStamp(startStamp))/60000,75,
   "Downloaded iCalendar event excludes the 15-minute cleaning time");
 const link=await page.locator("#manage-link").getAttribute("href");
 assert.ok(link.includes("token="+fixture.token));
 await page.goto(link,{waitUntil:"domcontentloaded"});
 await page.locator("#manage").waitFor({state:"visible"});
 await page.waitForFunction(()=>document.querySelector("#manage-status").textContent.includes("Confermata"));
 assert.match(await page.locator("#manage-status").textContent(),/Confermata/);
 page.once("dialog",dialog=>dialog.accept());
 await page.locator("#cancel").click();
 await page.waitForFunction(()=>document.querySelector("#manage-status").textContent.includes("Cancellata"));
 assert.equal(errors.length,0,viewport.label+" public page errors: "+errors.join(";"));
 await context.close();
}
const settings={config:{id:1,enabled:1,capacity:50,holdback:5,max_party:8,duration_min:90,buffer_min:15,
 interval_min:30,advance_days:60,notice_min:0,grace_min:15,table_mode:1},
 hours:Array.from({length:7},(_,i)=>({weekday:i,enabled:i===1?0:1,opens:"18:30",closes:"23:30"})),
 closures:[],tables:[{id:"t1",label:"Sala 1",seats:4,zone:"Sala",active:1},
 {id:"t2",label:"Veranda 2",seats:2,zone:"Veranda",active:1}]};
for(const viewport of VIEWS){
 const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height}});
 const page=await context.newPage(),errors=agentError(page);
 let manual={id:"99999999-1234-4123-9123-123456789abc",source:"manual",
  name:"Cliente telefonico",phone:"+393331231234",email:"",notes:"",date,
  start_min:1200,end_min:1305,guests:3,status:"confirmed",table_id:null,created_at:"2026-11-10"};
 await page.route("**/admin/check",r=>r.fulfill({json:{authenticated:true}}));
 await page.route("**/admin/push",r=>r.fulfill({json:{configured:false,publicKey:null,activeDevices:0,pending:0}}));
 await page.route(/\/admin\/bookings(?:\?|$)/,r=>{
   if(r.request().method()==="GET"){
     const mode=new URL(r.request().url()).searchParams.get("mode");
     if(mode==="settings")return r.fulfill({json:settings});
     if(mode==="alerts")return r.fulfill({json:{unread:1,last_id:1,recent:[]}});
     if(mode==="timeline")return r.fulfill({json:{
       date,open:true,capacity:50,holdback:5,duration_min:90,buffer_min:15,
       table_mode:true,tables:settings.tables,
       slots:[{time:"18:30",start:1110,end:1200,used:0,onlineFree:45,capacity:50,arrivals:0,peopleArriving:0},
        {time:"19:00",start:1140,end:1230,used:4,onlineFree:41,capacity:50,arrivals:1,peopleArriving:4},
        {time:"20:30",start:1230,end:1320,used:0,onlineFree:45,capacity:50,arrivals:0,peopleArriving:0}],
       booked:[{id:"occupied-1",name:"Marco Bianchi",guests:4,status:"confirmed",source:"online",
          start_min:1140,end_min:1230,table_id:"t1"}]}}); 
     return r.fulfill({json:{bookings:[manual],total:1,booked:manual.guests,unread:1,
       capacity:50,page:1,limit:50,date}});
   }
   const data=r.request().postDataJSON();actions.push({kind:"admin",data});
   if(data.action==="create")manual={...manual,...data,id:manual.id,start_min:Number(data.time.slice(0,2))*60,source:"manual",status:"confirmed"};
   if(data.action==="status")manual.status=data.status;
   return r.fulfill({json:{ok:true}});
 });
 await page.goto(ROOT+"/admin-prenotazioni.html",{waitUntil:"domcontentloaded"});
 await page.locator("#app").waitFor({state:"visible"});
 // Production safety: all booking styles must remain available even if the
 // external theme asset cannot be fetched (stale cache / missing Pages asset).
 assert.equal(await page.locator("#booking-admin-theme-inline").count(),1,
   "the reservations stylesheet must be embedded in the HTML response");
 assert.equal(await page.locator('link[href="/booking-admin-theme.css"]').count(),0,
   "the reservations layout must not depend on a second HTTP request");
 assert.equal(await page.locator(".fork-service-tabs").evaluate(e=>getComputedStyle(e).display),"grid",
   "service turn tabs must be styled instead of using native buttons");
 assert.equal(await page.locator(".fork-date-navigation").evaluate(e=>getComputedStyle(e).display),"flex",
   "date arrows and picker must stay on one row");
 assert.equal(await page.locator(".fork-date-label span").evaluate(e=>getComputedStyle(e).display),"none",
   "compact date header must not show the fallback giant label");
 await page.locator("#slot-date").fill(date);
 await page.locator("#refresh").click();
 await page.locator(".fork-time-group").first().waitFor();
 assert.equal(await page.locator(".fork-time-head").first().evaluate(e=>getComputedStyle(e).display),"flex");
 await page.waitForFunction(()=>{
   const el=document.querySelector(".fork-reservation-summary");
   return el?.isConnected && getComputedStyle(el).display==="flex";
 },null,{timeout:10000});
 // Layout was already checked atomically by waitForFunction above.
 // Re-querying the same node is racy with live agenda refresh.
 assert.ok(await page.locator("#agenda-tab").isVisible(),"reservations is the default admin view");
 assert.ok(!await page.locator("#availability-tab").isVisible(),"availability must live in a separate tab");
 assert.equal(await page.locator(".fork-time-group").count(),1);
 assert.equal(await page.locator(".fork-reservation").count(),1);
 assert.equal(await page.locator(".fork-time-chip").first().textContent(),"20:00");
 assert.ok(await page.locator(".fork-reservation-name").getByText("Cliente telefonico").isVisible());
 assert.equal(await page.locator(".fork-reservation-status.confirmed").first().textContent(),"Prenotato");
 assert.ok(!await page.locator(".fork-reservation-details").first().isVisible(),
   "expanded actions must not clutter the booking register");
 await page.locator(".fork-reservation-summary").first().click();
 assert.ok(await page.locator(".fork-reservation-details").first().isVisible());
 assert.ok(await page.getByRole("button",{name:"Dettagli",exact:true}).isVisible());
 await page.locator(".fork-reservation-summary").first().click();
 assert.ok(!await page.locator(".fork-reservation-details").first().isVisible());
 assert.equal(await page.locator("#nf-push-widget").count(),1);
 assert.ok(!await page.locator("#nf-push-widget").isVisible(),"push settings must not clutter the booking agenda");
 assert.ok(await page.locator("#nf-push-quick").isVisible(),"push activation must be discoverable from the admin header");
 await page.locator("#nf-push-quick-settings").waitFor({state:"visible"});
 await page.locator("#nf-push-quick-settings").click();
 assert.ok(await page.locator("#nf-push-widget").isVisible(),"push diagnostic shortcut opens the settings tab");
 await page.locator('[data-tab="agenda"]').click();
 await page.locator('[data-slot-turn="first"]').click();
 assert.ok((await page.locator("#booking-view-title").textContent()).includes("Primo turno"));
 await page.locator('[data-slot-turn="second"]').click();
 assert.ok((await page.locator("#booking-view-title").textContent()).includes("Secondo turno"));
 await page.locator('[data-slot-turn="all"]').click();
 await page.waitForFunction(()=>document.querySelector("#booking-view-title").textContent.includes("Tutte le prenotazioni"));
 assert.equal(await page.locator("#first-turn-covers").textContent(),"4p");
 assert.equal(await page.locator("#second-turn-covers").textContent(),"0p");
 await clearOverflow(page,viewport.label+" compact booking agenda");
 if(viewport.width<=390){
   const dateInput=await page.locator("#slot-date").boundingBox();
   assert.ok(dateInput.width>=170,"agenda date must remain readable at "+viewport.width+"px");
 }
 assert.ok(await page.locator("body").evaluate(e=>getComputedStyle(e).fontFamily.includes("Poppins")));
 assert.equal(await page.locator("body").evaluate(e=>getComputedStyle(e).backgroundColor),"rgb(15, 15, 15)");
 await page.screenshot({path:"artifacts/booking-browser/"+viewport.label+"-admin-agenda.png",fullPage:true});
 await page.locator('[data-tab="availability"]').click();
 await page.locator("#availability-tab").waitFor({state:"visible"});
 assert.ok(!await page.locator("#agenda-tab").isVisible());
 await page.locator(".service-tile").first().waitFor();
 assert.equal(await page.locator(".service-tile").count(),3);
 await page.getByRole("button",{name:/Ore 19:00/}).click();
 await page.locator("#table-schedule-title").getByText("Tavoli · 19:00 – 20:30").waitFor();
 assert.equal(await page.locator(".schedule-table-card.is-occupied").count(),1);
 assert.equal(await page.locator(".schedule-table-card.is-free").count(),1);
 assert.ok(await page.getByText("Marco Bianchi").count()>=1);
 await page.locator(".schedule-table-card.is-free .schedule-table-action").click();
 assert.equal(await page.locator('#booking-edit [name="table_id"]').inputValue(),"t2");
 assert.equal(await page.locator('#booking-edit [name="time"]').inputValue(),"19:00");
 await page.locator("#close-modal").click();
 await page.screenshot({path:"artifacts/booking-browser/"+viewport.label+"-admin-availability.png",fullPage:true});
 await page.locator('[data-tab="agenda"]').click();
 await page.locator("#agenda-tab").waitFor({state:"visible"});
 await page.locator("#reset-slot").click();
 await page.getByRole("button",{name:/Capienza/}).click();
 assert.ok(await page.locator("#nf-push-widget").isVisible(),
   "push activation is preserved in the settings tab");
 assert.equal(await page.locator('input[name="capacity"]').inputValue(),"50");
 assert.match(await page.locator("#booking-window-preview").textContent(),/90 minuti totali = 75 minuti al tavolo \+ 15 minuti/);
 await page.locator('#config-form select[name="buffer_min"]').selectOption("30");
 assert.match(await page.locator("#booking-window-preview").textContent(),/90 minuti totali = 60 minuti al tavolo \+ 30 minuti/);
 await page.locator('#config-form select[name="buffer_min"]').selectOption("15");
 await page.screenshot({path:"artifacts/booking-browser/"+viewport.label+"-admin-settings.png",fullPage:true});
 await page.goto(ROOT+"/admin-prenotazioni.html#tables",{waitUntil:"domcontentloaded"});
 await page.locator("#tables-tab").waitFor({state:"visible"});
 assert.ok(await page.locator("#table-form").isVisible(),"Direct Tavoli link opens the actual table editor");
 assert.ok(await page.locator("#tables-list").getByText("Sala 1").count()>=1);
 await page.screenshot({path:"artifacts/booking-browser/"+viewport.label+"-admin-tables.png",fullPage:true});
 await page.locator('[data-tab="agenda"]').click();
 await page.locator("#book-selected").click();
 await page.locator('#booking-edit [name="name"]').fill("Cliente telefonico");
 await page.locator('#booking-edit [name="phone"]').fill("+393331231234");
 await page.locator('#booking-edit [name="guests"]').fill("3");
 await page.locator('#booking-edit [name="date"]').fill(date);
 await page.locator('#booking-edit [name="time"]').fill("20:00");
 await page.locator("#save-booking").click();
 await page.waitForFunction(()=>document.querySelector("#modal").classList.contains("hidden"));
 await page.locator(".fork-reservation-summary").first().click();
 await page.getByRole("button",{name:"Dettagli",exact:true}).first().click();
 page.once("dialog",dialog=>dialog.accept());
 await page.locator("#status-no_show").click();
 await page.waitForFunction(()=>document.querySelector("#modal").classList.contains("hidden"));
 assert.ok(actions.some(x=>x.kind==="admin"&&x.data.action==="create"&&x.data.guests===3));
 assert.ok(actions.some(x=>x.kind==="admin"&&x.data.action==="status"&&x.data.status==="no_show"));
 assert.equal(errors.length,0,viewport.label+" admin page errors: "+errors.join(";"));
 await context.close();
}

// Browser-level push journey: opt-in, test delivery and recovery from stale
// browser subscriptions. The provider and OS are mocked; no real push is sent.
{
 const ctx=await browser.newContext({viewport:{width:390,height:844}});
 await ctx.addInitScript(()=>{
   let subscription=null;
   const reg={
     pushManager:{
       getSubscription:async()=>subscription,
       subscribe:async()=>{
         subscription={
           endpoint:"https://fcm.googleapis.com/fcm/send/mock-registered-phone",
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
     getRegistration:async()=>reg,register:async()=>reg,ready:Promise.resolve(reg)
   }});
 });
 const page=await ctx.newPage();
 const actions=[];let devices=0;
 await page.route("**/admin/check",r=>r.fulfill({json:{authenticated:true}}));
 await page.route("**/admin/push",r=>{
   if(r.request().method()==="GET")
     return r.fulfill({json:{configured:true,publicKey:"BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
       activeDevices:devices,pending:0}});
   const payload=r.request().postDataJSON();
   actions.push(payload.action);
   if(payload.action==="subscribe"){
     devices=1;return r.fulfill({json:{ok:true,id:"mock-device"}});
   }
   if(payload.action==="test")return r.fulfill({json:{ok:true,accepted:1,failed:0}});
   if(payload.action==="unsubscribe"){devices=0;return r.fulfill({json:{ok:true}})}
   return r.fulfill({status:400,json:{error:"Azione non supportata"}});
 });
 await page.route(/\/admin\/bookings(?:\?|$)/,r=>{
   const mode=new URL(r.request().url()).searchParams.get("mode");
   if(mode==="settings")return r.fulfill({json:settings});
   if(mode==="alerts")return r.fulfill({json:{unread:0,last_id:0,recent:[]}});
   if(mode==="timeline")return r.fulfill({json:{date,open:true,slots:[],capacity:50,holdback:5,
     table_mode:true,tables:settings.tables,booked:[]}});
   return r.fulfill({json:{bookings:[],total:0,filtered_total:0,booked:0,
      capacity:50,page:1,limit:50,date}});
 });
 await page.goto(ROOT+"/admin-prenotazioni.html",{waitUntil:"domcontentloaded"});
 await page.locator("#app").waitFor({state:"visible"});
 assert.equal(await page.locator("#nf-push-runtime-inline").count(),1,
   "Push handler must be embedded; external JS may be blocked or unavailable");
 assert.equal(await page.locator('script[src="/admin-push.js"]').count(),0);
 await page.locator("#nf-push-quick-enable").waitFor({state:"visible"});
 assert.equal(await page.locator("#nf-push-quick-test").isVisible(),false,
   "test is available only after notifications have been activated");
 await page.locator("#nf-push-quick-enable").click();
 await page.locator("#nf-push-quick-test").waitFor({state:"visible"});
 assert.ok(actions.includes("subscribe"),"device is registered server-side");
 await page.locator("#nf-push-quick-test").click();
 await page.waitForFunction(()=>document.querySelector("#nf-push-quick-status")?.textContent==="Prova inviata");
 assert.ok(actions.includes("test"),"a test notification is requested from the server");
 await page.locator('[data-tab="settings"]').click();
 await page.locator("#nf-push-reconnect").waitFor({state:"visible"});
 await page.locator("#nf-push-reconnect").click();
 await page.locator("#nf-push-quick-test").waitFor({state:"visible"});
 assert.ok(actions.filter(a=>a==="subscribe").length>=2,
   "recovery control renews the server registration");
 assert.equal(await page.locator("#nf-push-quick-enable").isVisible(),false);
 await ctx.close();
}


// A hung Service Worker API must never leave "Controllo push" on screen.
{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(()=>{
   Object.defineProperty(window,"PushManager",{configurable:true,value:class FakePushManager{}});
   Object.defineProperty(window,"Notification",{configurable:true,value:{
      permission:"default",requestPermission:async()=>"granted"
   }});
   Object.defineProperty(navigator,"serviceWorker",{configurable:true,value:{
      getRegistration:()=>new Promise(()=>{}),register:()=>new Promise(()=>{}),
      ready:new Promise(()=>{})
   }});
 });
 const page=await context.newPage();
 await page.route("**/admin/check",r=>r.fulfill({json:{authenticated:true}}));
 await page.route("**/admin/push",r=>r.fulfill({json:{configured:true,
   publicKey:"BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
   activeDevices:0,pending:0}}));
 await page.route(/\/admin\/bookings(?:\?|$)/,r=>{
   const mode=new URL(r.request().url()).searchParams.get("mode");
   if(mode==="settings")return r.fulfill({json:settings});
   if(mode==="alerts")return r.fulfill({json:{unread:0,last_id:0,recent:[]}});
   if(mode==="timeline")return r.fulfill({json:{date,open:true,slots:[],capacity:50,holdback:5,
     table_mode:true,tables:settings.tables,booked:[]}});
   return r.fulfill({json:{bookings:[],total:0,filtered_total:0,booked:0,
      capacity:50,page:1,limit:50,date}});
 });
 await page.goto(ROOT+"/admin-prenotazioni.html",{waitUntil:"domcontentloaded"});
 await page.locator("#nf-push-quick-settings").waitFor({state:"visible",timeout:10000});
 await page.waitForFunction(()=>{
   const text=document.querySelector("#nf-push-quick-status")?.textContent||"";
   return text==="Push non disponibili";
 },null,{timeout:14000});
 assert.ok(!(await page.locator("#nf-push-quick-status").textContent()).includes("Controllo push"),
   "timeout must replace perpetual push check with actionable error");
 await context.close();
}

await browser.close();
console.log("PASS: mobile/desktop browser flows, responsive overflow, form, confirmation, calendar, admin manual booking, no-show.");
