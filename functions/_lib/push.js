/*
 * N'Farinati Web Push transport, built from WebCrypto (RFC 8291 / 8292).
 * No third-party runtime, external messaging provider or paid API required.
 * Delivery acknowledges acceptance by the browser's push service, not a
 * guarantee that the operating system displayed a notification.
 */
import { sha256 } from "./auth.js";

const encoder = new TextEncoder(), init = new WeakMap();
const ALLOWED = /^(?:fcm(?:-[a-z0-9]+)?\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|(?:[a-z0-9-]+\.)?push\.apple\.com|(?:[a-z0-9-]+\.)?notify\.windows\.com)$/i;
const concat = (...bytes) => {
  const out = new Uint8Array(bytes.reduce((n,b)=>n+b.length,0));
  let at=0;for(const x of bytes){out.set(x,at);at+=x.length;}return out;
};
const b64url = data => {
  let text="";for(const b of data)text+=String.fromCharCode(b);
  return btoa(text).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
};
const decode = value => {
  if(typeof value!=="string"|| !/^[A-Za-z0-9_-]+$/.test(value)||value.length>512)throw Error("Chiave Web Push non valida");
  const text=atob(value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"="));
  return Uint8Array.from(text,c=>c.charCodeAt(0));
};
export const pushConfigured = env => !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
export function isAllowedPushEndpoint(endpoint) {
  try {
    const u=new URL(endpoint);
    return u.protocol==="https:" && !u.username && !u.password && !u.port &&
      u.hash==="" && endpoint.length<=2048 && ALLOWED.test(u.hostname);
  } catch{return false;}
}
export function validateSubscription(subscription) {
  if(!subscription || typeof subscription!=="object" || !isAllowedPushEndpoint(subscription.endpoint))
    throw Error("Provider push non supportato");
  const p256dh=decode(subscription.keys?.p256dh),auth=decode(subscription.keys?.auth);
  if(p256dh.length!==65 || p256dh[0]!==4 || auth.length!==16)throw Error("Chiavi push del dispositivo non valide");
  return {endpoint:subscription.endpoint,p256dh:subscription.keys.p256dh,auth:subscription.keys.auth};
}
export async function buildWebPushRequest(message,subscription,env,now=Date.now()){
  if(!pushConfigured(env))throw Error("VAPID non configurato");
  const sub=validateSubscription({endpoint:subscription.endpoint,
    keys:{p256dh:subscription.p256dh || subscription.keys?.p256dh,auth:subscription.auth || subscription.keys?.auth}});
  const vapidPublic=decode(env.VAPID_PUBLIC_KEY),vapidPrivate=decode(env.VAPID_PRIVATE_KEY);
  if(vapidPublic.length!==65||vapidPublic[0]!==4||vapidPrivate.length!==32)throw Error("Chiavi VAPID non valide");
  const userPublic=decode(sub.p256dh),auth=decode(sub.auth);
  const pair=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
  const localPublic=new Uint8Array(await crypto.subtle.exportKey("raw",pair.publicKey));
  const remote=await crypto.subtle.importKey("raw",userPublic,{name:"ECDH",namedCurve:"P-256"},false,[]);
  const shared=new Uint8Array(await crypto.subtle.deriveBits({name:"ECDH",public:remote},pair.privateKey,256));
  // RFC 8291: the first HKDF info includes BOTH public keys (not just text).
  const secretKey=await crypto.subtle.importKey("raw",shared,"HKDF",false,["deriveBits"]);
  const ikm=new Uint8Array(await crypto.subtle.deriveBits({
    name:"HKDF",hash:"SHA-256",salt:auth,
    info:concat(encoder.encode("WebPush: info\0"),userPublic,localPublic)
  },secretKey,256));
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const ikmKey=await crypto.subtle.importKey("raw",ikm,"HKDF",false,["deriveBits"]);
  const cek=await crypto.subtle.deriveBits({name:"HKDF",hash:"SHA-256",salt,
    info:encoder.encode("Content-Encoding: aes128gcm\0")},ikmKey,128);
  const nonce=await crypto.subtle.deriveBits({name:"HKDF",hash:"SHA-256",salt,
    info:encoder.encode("Content-Encoding: nonce\0")},ikmKey,96);
  const plain=concat(encoder.encode(JSON.stringify(message)),Uint8Array.of(2));
  if(plain.length>3600)throw Error("Notifica troppo grande");
  const aes=await crypto.subtle.importKey("raw",cek,{name:"AES-GCM"},false,["encrypt"]);
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce,tagLength:128},aes,plain));
  const body=concat(salt,new Uint8Array([0,0,16,0,65]),localPublic,ciphertext);
  const key=await crypto.subtle.importKey("jwk",{
    kty:"EC",crv:"P-256",x:b64url(vapidPublic.slice(1,33)),y:b64url(vapidPublic.slice(33,65)),
    d:b64url(vapidPrivate),ext:false
  },{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
  const header=b64url(encoder.encode(JSON.stringify({typ:"JWT",alg:"ES256"})));
  const payload=b64url(encoder.encode(JSON.stringify({
    aud:new URL(sub.endpoint).origin,exp:Math.floor(now/1000)+12*3600,
    sub:env.VAPID_SUBJECT||"https://nfarinatimodernpizza.it"
  })));
  const signed=header+"."+payload;
  const signature=new Uint8Array(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key,encoder.encode(signed)));
  return {url:sub.endpoint,options:{
    method:"POST",headers:{
      "Authorization":"vapid t="+signed+"."+b64url(signature)+", k="+env.VAPID_PUBLIC_KEY,
      "Content-Encoding":"aes128gcm","Content-Type":"application/octet-stream",
      "TTL":"21600","Urgency":message.kind==="order"?"high":"normal"
    },body
  }};
}
/*
 * These dedicated nf_webpush_* tables intentionally DO NOT share the
 * old push_subscriptions table: existing D1 installations may contain
 * an unrelated legacy push system lacking an origin column. New push
 * subscriptions are origin-scoped and must be explicitly opt-in.
 * Existing legacy rows remain untouched; re-activate on each device.
 */
/*
 * D1 schema bootstrap must survive interrupted deploys. All steps are
 * idempotent and label the exact failing D1 operation for diagnostics.
 */
export async function ensurePushSchema(env) {
  if(!env?.DB) {
    const error=new Error("Binding D1 DB assente");
    error.stage="binding";throw error;
  }
  if(init.has(env.DB))return init.get(env.DB);
  const promise=(async()=>{
    const exec=async(stage,sql)=>{
      try {return await env.DB.prepare(sql).run();}
      catch(e){
        const error=new Error(String(e?.message||"Errore D1"));
        error.name="PushSchemaError";error.stage=stage;
        throw error;
      }
    };
    await exec("subscriptions-table",`CREATE TABLE IF NOT EXISTS nf_webpush_subscriptions (
      id TEXT PRIMARY KEY,origin TEXT NOT NULL,endpoint TEXT NOT NULL,p256dh TEXT NOT NULL,auth TEXT NOT NULL,
      orders INTEGER NOT NULL DEFAULT 1,bookings INTEGER NOT NULL DEFAULT 1,active INTEGER NOT NULL DEFAULT 1,
      created_ms INTEGER NOT NULL,updated_ms INTEGER NOT NULL,last_error TEXT NOT NULL DEFAULT ''
    )`);
    await exec("events-table",`CREATE TABLE IF NOT EXISTS nf_webpush_events (
      id TEXT PRIMARY KEY,origin TEXT NOT NULL,kind TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,
      target TEXT NOT NULL,created_ms INTEGER NOT NULL,delivered_ms INTEGER,attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_ms INTEGER NOT NULL DEFAULT 0,claim_until_ms INTEGER NOT NULL DEFAULT 0,last_error TEXT NOT NULL DEFAULT ''
    )`);
    await exec("deliveries-table",`CREATE TABLE IF NOT EXISTS nf_webpush_deliveries (
      event_id TEXT NOT NULL,subscription_id TEXT NOT NULL,sent_ms INTEGER NOT NULL,
      PRIMARY KEY(event_id,subscription_id)
    )`);
    // Additive migration: do not delete subscriptions or pending alerts.
    const optional={
      nf_webpush_subscriptions:{
        orders:"INTEGER NOT NULL DEFAULT 1",bookings:"INTEGER NOT NULL DEFAULT 1",
        active:"INTEGER NOT NULL DEFAULT 1",created_ms:"INTEGER NOT NULL DEFAULT 0",
        updated_ms:"INTEGER NOT NULL DEFAULT 0",last_error:"TEXT NOT NULL DEFAULT ''"
      },
      nf_webpush_events:{
        delivered_ms:"INTEGER",attempts:"INTEGER NOT NULL DEFAULT 0",
        next_attempt_ms:"INTEGER NOT NULL DEFAULT 0",claim_until_ms:"INTEGER NOT NULL DEFAULT 0",
        last_error:"TEXT NOT NULL DEFAULT ''"
      }
    };
    const required={
      nf_webpush_subscriptions:["id","origin","endpoint","p256dh","auth"],
      nf_webpush_events:["id","origin","kind","title","body","target","created_ms"],
      nf_webpush_deliveries:["event_id","subscription_id","sent_ms"]
    };
    for(const table of ["nf_webpush_subscriptions","nf_webpush_events","nf_webpush_deliveries"]){
      let columns;
      try {
        const response=await env.DB.prepare("PRAGMA table_info("+table+")").all();
        columns=new Set((response.results||[]).map(row=>String(row.name)));
      }catch(e){
        const error=new Error(String(e?.message||"Errore PRAGMA"));
        error.name="PushSchemaError";error.stage="inspect-"+table;throw error;
      }
      for(const col of required[table]){
        if(!columns.has(col)){
          const error=new Error("La tabella push preesistente non contiene la colonna "+col+
            ". Migrazione manuale necessaria; nessuna informazione è stata cancellata.");
          error.name="PushSchemaError";error.stage="legacy-"+table;throw error;
        }
      }
      for(const [col,definition] of Object.entries(optional[table]||{})){
        if(!columns.has(col))
          await exec("upgrade-"+table+"-"+col,
            "ALTER TABLE "+table+" ADD COLUMN "+col+" "+definition);
      }
    }
    await exec("subscriptions-index","CREATE INDEX IF NOT EXISTS nf_webpush_subscriptions_active_idx ON nf_webpush_subscriptions(origin,active)");
    await exec("events-index","CREATE INDEX IF NOT EXISTS nf_webpush_events_queue_idx ON nf_webpush_events(origin,delivered_ms,next_attempt_ms,created_ms)");
  })();
  init.set(env.DB,promise);
  try {await promise} catch(e){init.delete(env.DB);throw e;}
}
export async function registerDevice(env,origin,raw,category={orders:true,bookings:true}){
  const sub=validateSubscription(raw);await ensurePushSchema(env);
  const id=await sha256(sub.endpoint),now=Date.now();
  await env.DB.prepare(`INSERT INTO nf_webpush_subscriptions
    (id,origin,endpoint,p256dh,auth,orders,bookings,active,created_ms,updated_ms)
    VALUES(?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET origin=excluded.origin,endpoint=excluded.endpoint,
    p256dh=excluded.p256dh,auth=excluded.auth,orders=excluded.orders,bookings=excluded.bookings,
    active=1,updated_ms=excluded.updated_ms,last_error=''`)
    .bind(id,origin,sub.endpoint,sub.p256dh,sub.auth,
      Number(category.orders!==false),Number(category.bookings!==false),1,now,now).run();
  return {ok:true,id};
}
export async function unregisterDevice(env,origin,endpoint){
  await ensurePushSchema(env);
  if(!isAllowedPushEndpoint(endpoint))throw Error("Endpoint non valido");
  await env.DB.prepare("UPDATE nf_webpush_subscriptions SET active=0,updated_ms=? WHERE id=? AND origin=?")
    .bind(Date.now(),await sha256(endpoint),origin).run();
  return {ok:true};
}
export async function enqueuePushEvent(env,origin,{kind,id,title,body,target},now=Date.now()){
  if(!["order","booking","test"].includes(kind) || typeof id!=="string"||id.length>180)
    throw Error("Evento push non valido");
  if(typeof origin!=="string" || !/^https:\/\/[^/]+$/.test(origin) ||
     !/^\/(?:admin\.html|admin-prenotazioni\.html)(?:\?[^#]{0,180})?(?:#[A-Za-z0-9_-]{0,30})?$/.test(target))
    throw Error("Destinazione push non valida");
  await ensurePushSchema(env);
  await env.DB.prepare(`INSERT OR IGNORE INTO nf_webpush_events
    (id,origin,kind,title,body,target,created_ms) VALUES(?,?,?,?,?,?,?)`)
    .bind(kind+":"+id,origin,kind,String(title).slice(0,110),
      String(body).slice(0,240),target,now).run();
}
export async function runPendingPush(env,origin,{now=Date.now(),fetcher=fetch,limit=10}={}){
  await ensurePushSchema(env);
  if(!pushConfigured(env))return {ok:false,reason:"vapid_missing",sent:0,failed:0};
  const claimed=await env.DB.prepare(`UPDATE nf_webpush_events
    SET claim_until_ms=?,attempts=attempts+1
    WHERE id IN (
      SELECT id FROM nf_webpush_events WHERE origin=? AND delivered_ms IS NULL
      AND next_attempt_ms<=? AND claim_until_ms<? AND created_ms>?
      ORDER BY created_ms ASC LIMIT ?
    )
    RETURNING id,kind,title,body,target,attempts`)
    .bind(now+60000,origin,now,now,now-12*3600000,Math.max(1,Math.min(20,limit))).all();
  const events=claimed.results||[];let sent=0,failed=0;
  for(const event of events){
    const list=await env.DB.prepare(`SELECT id,endpoint,p256dh,auth FROM nf_webpush_subscriptions
      WHERE origin=? AND active=1 AND (orders=1 AND ?='order' OR bookings=1 AND ?='booking' OR ?='test')`)
      .bind(origin,event.kind,event.kind,event.kind).all();
    let errors=0;
    for(const sub of (list.results||[])){
      const delivered=await env.DB.prepare("SELECT event_id FROM nf_webpush_deliveries WHERE event_id=? AND subscription_id=?")
        .bind(event.id,sub.id).first();
      if(delivered)continue;
      try{
        const payload={kind:event.kind,title:event.title,body:event.body,url:event.target,
          eventId:event.id,issuedAt:now};
        const {url,options}=await buildWebPushRequest(payload,sub,env,now);
        const response=await fetcher(url,{...options,signal:AbortSignal.timeout(6500)});
        if(response.status===404 || response.status===410){
          await env.DB.prepare("UPDATE nf_webpush_subscriptions SET active=0,last_error=? WHERE id=?")
            .bind("scaduta ("+response.status+")",sub.id).run();
          continue;
        }
        if(!response.ok){
          errors++;failed++;
          await env.DB.prepare("UPDATE nf_webpush_subscriptions SET last_error=? WHERE id=?")
            .bind("Push provider "+response.status,sub.id).run();
          continue;
        }
        await env.DB.prepare("INSERT OR IGNORE INTO nf_webpush_deliveries(event_id,subscription_id,sent_ms) VALUES(?,?,?)")
          .bind(event.id,sub.id,now).run();
        await env.DB.prepare("UPDATE nf_webpush_subscriptions SET last_error='',updated_ms=? WHERE id=?")
          .bind(now,sub.id).run();
        sent++;
      }catch(e){
        errors++;failed++;
        console.error("Push transport failed",String(e?.name||"Error"));
      }
    }
    if(!errors){
      await env.DB.prepare("UPDATE nf_webpush_events SET delivered_ms=?,claim_until_ms=0,last_error='' WHERE id=?")
        .bind(now,event.id).run();
    }else{
      const pause=Math.min(3600000,15000*2**Math.min(event.attempts,7));
      await env.DB.prepare("UPDATE nf_webpush_events SET claim_until_ms=0,next_attempt_ms=?,last_error=? WHERE id=?")
        .bind(now+pause,"Provider temporaneamente non disponibile",event.id).run();
    }
  }
  return {ok:true,processed:events.length,sent,failed};
}
export async function pushDiagnostics(env,origin){
  await ensurePushSchema(env);
  const [subs,events,errors]=await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count FROM nf_webpush_subscriptions WHERE origin=? AND active=1").bind(origin).first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM nf_webpush_events WHERE origin=? AND delivered_ms IS NULL AND created_ms>?").bind(origin,Date.now()-12*3600000).first(),
    env.DB.prepare("SELECT kind,created_ms,delivered_ms,attempts,last_error FROM nf_webpush_events WHERE origin=? ORDER BY created_ms DESC LIMIT 5").bind(origin).all()
  ]);
  return {configured:pushConfigured(env),publicKey:env.VAPID_PUBLIC_KEY||null,
    activeDevices:Number(subs?.count||0),pending:Number(events?.count||0),recent:(errors.results||[])};
}
