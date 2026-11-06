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
 await page.goto(ROOT+"/prenota.html",{waitUntil:"domcontentloaded"});
 await page.locator(".time").first().waitFor();
 assert.ok(await page.locator("body").evaluate(e=>getComputedStyle(e).fontFamily.includes("Poppins")));
 assert.equal(await page.locator("body").evaluate(e=>getComputedStyle(e).backgroundColor),"rgb(255, 255, 255)");
 await clearOverflow(page,viewport.label+" public");
 await page.screenshot({path:"artifacts/booking-browser/"+viewport.label+"-public.png",fullPage:true});
 await page.getByRole("button",{name:"20:30",exact:true}).click();
 await page.locator("#name").fill("Mario Rossi");
 await page.locator("#phone").fill("+393331234567");
 await page.locator("#privacy").check();
 await page.locator("#submit").click();
 await page.locator("#done").waitFor({state:"visible"});
 assert.equal(await page.locator("#done-details").getByText("20:30").count(),1);
 await page.screenshot({path:"artifacts/booking-browser/"+viewport.label+"-confirmation.png",fullPage:true});
 assert.ok((await page.locator("#google").getAttribute("href")).startsWith("https://calendar.google.com/"));
 const [download]=await Promise.all([page.waitForEvent("download"),page.locator("#ics").click()]);
 const ics=await readFile(await download.path(),"utf8");
 assert.match(ics,/BEGIN:VCALENDAR/);assert.match(ics,/TRIGGER:-P1D/);assert.match(ics,/TRIGGER:-PT2H/);
 const link=await page.locator("#manage-link").getAttribute("href");
 assert.ok(link.includes("token="+fixture.token));
 await page.goto(link,{waitUntil:"domcontentloaded"});
 await page.locator("#manage").waitFor({state:"visible"});
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
 closures:[],tables:[{id:"t1",label:"Sala 1",seats:4,zone:"Sala",active:1}]};
for(const viewport of VIEWS.slice(0,2)){
 const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height}});
 const page=await context.newPage(),errors=agentError(page);
 let manual={id:"99999999-1234-4123-9123-123456789abc",source:"manual",
  name:"Cliente telefonico",phone:"+393331231234",email:"",notes:"",date,
  start_min:1200,end_min:1305,guests:3,status:"confirmed",table_id:null,created_at:"2026-11-10"};
 await page.route("**/admin/check",r=>r.fulfill({json:{authenticated:true}}));
 await page.route(/\/admin\/bookings(?:\?|$)/,r=>{
   if(r.request().method()==="GET"){
     const mode=new URL(r.request().url()).searchParams.get("mode");
     if(mode==="settings")return r.fulfill({json:settings});
     if(mode==="alerts")return r.fulfill({json:{unread:1,last_id:1,recent:[]}});
     return r.fulfill({json:{bookings:[manual],total:1,booked:manual.guests,unread:1,
       capacity:50,page:1,limit:50,date}});
   }
   const data=r.request().postDataJSON();actions.push({kind:"admin",data});
   if(data.action==="create")manual={...manual,...data,start_min:Number(data.time.slice(0,2))*60,source:"manual",status:"confirmed"};
   if(data.action==="status")manual.status=data.status;
   return r.fulfill({json:{ok:true}});
 });
 await page.goto(ROOT+"/admin-prenotazioni.html",{waitUntil:"domcontentloaded"});
 await page.locator("#app").waitFor({state:"visible"});
 await page.locator("#filter-date").fill(date);
 await page.locator("#refresh").click();
 await clearOverflow(page,viewport.label+" admin");
 assert.ok(await page.locator("body").evaluate(e=>getComputedStyle(e).fontFamily.includes("Poppins")));
 assert.equal(await page.locator("body").evaluate(e=>getComputedStyle(e).backgroundColor),"rgb(15, 15, 15)");
 await page.screenshot({path:"artifacts/booking-browser/"+viewport.label+"-admin-agenda.png",fullPage:true});
 await page.getByRole("button",{name:/Capienza/}).click();
 assert.equal(await page.locator('input[name="capacity"]').inputValue(),"50");
 await page.screenshot({path:"artifacts/booking-browser/"+viewport.label+"-admin-settings.png",fullPage:true});
 await page.getByRole("button",{name:/Agenda/}).click();
 await page.locator("#new-booking").click();
 await page.locator('#booking-edit [name="name"]').fill("Cliente telefonico");
 await page.locator('#booking-edit [name="phone"]').fill("+393331231234");
 await page.locator('#booking-edit [name="guests"]').fill("3");
 await page.locator('#booking-edit [name="date"]').fill(date);
 await page.locator('#booking-edit [name="time"]').fill("20:00");
 await page.locator("#save-booking").click();
 await page.waitForFunction(()=>document.querySelector("#modal").classList.contains("hidden"));
 await page.getByRole("button",{name:/Apri \/ modifica/}).click();
 await page.locator("#status-no_show").click();
 assert.ok(actions.some(x=>x.kind==="admin"&&x.data.action==="create"&&x.data.guests===3));
 assert.ok(actions.some(x=>x.kind==="admin"&&x.data.action==="status"&&x.data.status==="no_show"));
 assert.equal(errors.length,0,viewport.label+" admin page errors: "+errors.join(";"));
 await context.close();
}
await browser.close();
console.log("PASS: mobile/desktop browser flows, responsive overflow, form, confirmation, calendar, admin manual booking, no-show.");
