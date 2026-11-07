import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {d1,adminCookie} from "./helpers.mjs";
import {validateSubscription,isAllowedPushEndpoint,buildWebPushRequest,
  ensurePushSchema,registerDevice,enqueuePushEvent,runPendingPush,pushDiagnostics
} from "../functions/_lib/push.js";
import {onRequestGet as getPush,onRequestPost as postPush} from "../functions/admin/push.js";

const text=new TextEncoder(),dec=new TextDecoder();
const b64=bytes=>Buffer.from(bytes).toString("base64url");
const from64=value=>Uint8Array.from(Buffer.from(value,"base64url"));
async function createFixture(){
 const db=new DatabaseSync(":memory:"),env={DB:d1(db)};
 const vapid=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);
 const vapidJwk=await crypto.subtle.exportKey("jwk",vapid.privateKey);
 env.VAPID_PUBLIC_KEY=b64(await crypto.subtle.exportKey("raw",vapid.publicKey));
 env.VAPID_PRIVATE_KEY=vapidJwk.d;
 env.VAPID_SUBJECT="https://nfarinatimodernpizza.it";
 const recipient=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
 const p256dh=b64(await crypto.subtle.exportKey("raw",recipient.publicKey));
 const auth=b64(crypto.getRandomValues(new Uint8Array(16)));
 const subscription={endpoint:"https://fcm.googleapis.com/fcm/send/valid-test-endpoint",keys:{p256dh,auth}};
 return {db,env,recipient,subscription,vapid};
}
const base="https://preview.nfarinatimodernpizza.it";
const req=(method,body)=>new Request(base+"/admin/push",{
 method,headers:{"Content-Type":"application/json"},
 ...(body?{body:JSON.stringify(body)}:{})
});
test("reject fake push destinations to avoid SSRF",async()=>{
 const {subscription}=await createFixture();
 assert.ok(isAllowedPushEndpoint(subscription.endpoint));
 assert.ok(isAllowedPushEndpoint("https://web.push.apple.com/anything"));
 assert.ok(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/test"));
 for(const url of ["https://localhost/push","http://fcm.googleapis.com/send/x",
  "https://fcm.googleapis.com.evil.test/send/x","https://169.254.169.254/meta",
  "https://user:pass@fcm.googleapis.com/send/x"])
  assert.ok(!isAllowedPushEndpoint(url),url);
 assert.throws(()=>validateSubscription({...subscription,endpoint:"https://127.0.0.1/x"}),/Provider/);
});
test("WebCrypto VAPID JWT is valid, and AES128GCM payload decrypts with subscriber private key",async()=>{
 const {env,recipient,subscription,vapid}=await createFixture();
 const payload={kind:"order",title:"Nuovo ordine",body:"Ordine asporto",url:"/admin.html?section=orders"};
 const {url,options}=await buildWebPushRequest(payload,subscription,env);
 assert.equal(url,subscription.endpoint);
 assert.equal(options.headers["Content-Encoding"],"aes128gcm");
 assert.equal(options.headers.Urgency,"high");
 const vapidToken=options.headers.Authorization.match(/^vapid t=([^,]+), k=(.+)$/);
 assert.ok(vapidToken);assert.equal(vapidToken[2],env.VAPID_PUBLIC_KEY);
 const pieces=vapidToken[1].split(".");
 assert.equal(pieces.length,3);
 assert.equal(JSON.parse(Buffer.from(pieces[1],"base64url").toString()).aud,"https://fcm.googleapis.com");
 assert.ok(await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},vapid.publicKey,
   from64(pieces[2]),text.encode(pieces[0]+"."+pieces[1])));
 const body=new Uint8Array(options.body),salt=body.slice(0,16),recordSize=new DataView(body.buffer).getUint32(16);
 assert.equal(recordSize,4096);assert.equal(body[20],65);
 const ephemeral=body.slice(21,86),cipher=body.slice(86);
 const remote=await crypto.subtle.importKey("raw",ephemeral,{name:"ECDH",namedCurve:"P-256"},false,[]);
 const shared=await crypto.subtle.deriveBits({name:"ECDH",public:remote},recipient.privateKey,256);
 const hkdf=async(secret,salt,info,n)=>{
   const key=await crypto.subtle.importKey("raw",secret,"HKDF",false,["deriveBits"]);
   return crypto.subtle.deriveBits({name:"HKDF",hash:"SHA-256",salt,info},key,n);
 };
 const auth=from64(subscription.keys.auth),receiver=from64(subscription.keys.p256dh);
 const info=new Uint8Array(text.encode("WebPush: info\0").length+receiver.length+ephemeral.length);
 info.set(text.encode("WebPush: info\0"));info.set(receiver,text.encode("WebPush: info\0").length);
 info.set(ephemeral,text.encode("WebPush: info\0").length+receiver.length);
 const ikm=await hkdf(shared,auth,info,256);
 const cek=await hkdf(ikm,salt,text.encode("Content-Encoding: aes128gcm\0"),128);
 const nonce=await hkdf(ikm,salt,text.encode("Content-Encoding: nonce\0"),96);
 const aes=await crypto.subtle.importKey("raw",cek,{name:"AES-GCM"},false,["decrypt"]);
 const plaintext=new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:nonce,tagLength:128},aes,cipher));
 assert.equal(plaintext.at(-1),2);
 assert.deepEqual(JSON.parse(dec.decode(plaintext.slice(0,-1))),payload);
});
test("D1 outbox sends each event once and does not duplicate on retry",async()=>{
 const {env,db,subscription}=await createFixture();
 await registerDevice(env,base,subscription);
 await enqueuePushEvent(env,base,{kind:"order",id:"order1",title:"Ordine",body:"Nuovo ordine",target:"/admin.html?section=orders"});
 await enqueuePushEvent(env,base,{kind:"order",id:"order1",title:"Ordine",body:"Nuovo ordine",target:"/admin.html?section=orders"});
 let deliveries=0;
 const fetcher=async(url,opts)=>{
   assert.equal(url,subscription.endpoint);assert.equal(opts.method,"POST");
   deliveries++;return new Response(null,{status:201});
 };
 let a=await runPendingPush(env,base,{fetcher});
 assert.equal(a.sent,1);assert.equal(a.failed,0);
 let b=await runPendingPush(env,base,{fetcher});
 assert.equal(b.processed,0);assert.equal(deliveries,1);
 assert.equal(db.prepare("SELECT COUNT(*) AS count FROM push_events").get().count,1);
 assert.equal(db.prepare("SELECT COUNT(*) AS count FROM push_deliveries").get().count,1);
});
test("expired subscriptions are disabled without retrying them forever",async()=>{
 const {env,db,subscription}=await createFixture();
 await registerDevice(env,base,subscription);
 await enqueuePushEvent(env,base,{kind:"booking",id:"b1",title:"Prenotazione",body:"4 ospiti",
    target:"/admin-prenotazioni.html?date=2026-11-08#agenda"});
 const outcome=await runPendingPush(env,base,{fetcher:async()=>new Response(null,{status:410})});
 assert.equal(outcome.failed,0);
 assert.equal(db.prepare("SELECT active FROM push_subscriptions").get().active,0);
 assert.ok(db.prepare("SELECT delivered_ms FROM push_events").get().delivered_ms);
});
test("push registration, diagnostics and sending require admin authentication",async()=>{
 const {env,subscription}=await createFixture();
 const denied=await getPush({env,request:req("GET")});
 assert.equal(denied.status,401);
 const cookie=await adminCookie(env);
 const authorized=new Request(base+"/admin/push",{headers:{Cookie:cookie}});
 const info=await getPush({env,request:authorized});
 assert.equal(info.status,200);assert.equal((await info.json()).configured,true);
 const post=await postPush({env,request:new Request(base+"/admin/push",{
   method:"POST",headers:{Cookie:cookie,"Content-Type":"application/json"},
   body:JSON.stringify({action:"subscribe",subscription})
 })});
 assert.equal(post.status,200);
 assert.equal((await pushDiagnostics(env,base)).activeDevices,1);
});
