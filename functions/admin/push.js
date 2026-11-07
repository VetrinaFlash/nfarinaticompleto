import { adminIdentity, json } from "../_lib/auth.js";
import {
  pushDiagnostics,registerDevice,unregisterDevice,enqueuePushEvent,
  runPendingPush,pushConfigured,ensurePushSchema
} from "../_lib/push.js";

export async function onRequestGet({env,request}) {
  try {
    if(!await adminIdentity(env,request))return json({error:"Accesso amministratore richiesto"},401);
    if(!env.DB)return json({
      error:"Binding D1 'DB' assente nell'ambiente Cloudflare Preview. Configura D1 e ripubblica il branch.",
      code:"PUSH_D1_MISSING"
    },503);
    const origin=new URL(request.url).origin;
    const data=await pushDiagnostics(env,origin);
    return json({...data,permissionRequired:true});
  }catch(e){
    console.error("Push diagnostics failed",e?.name,String(e?.message||"").slice(0,240));
    return json({
      error:"Impossibile inizializzare le tabelle push nel database D1. Verifica il binding DB e i log Cloudflare Pages Functions: aggiungere le chiavi VAPID da solo non risolve questo errore.",
      code:"PUSH_D1_INIT_FAILED"
    },503);
  }
}
export async function onRequestPost(context){
  const {env,request}=context;
  if(!await adminIdentity(env,request))return json({error:"Accesso amministratore richiesto"},401);
  let body;
  try{body=await request.json()}catch{return json({error:"Richiesta non valida"},400)}
  const origin=new URL(request.url).origin;
  if(!body||typeof body!=="object"||Array.isArray(body))return json({error:"Dati non validi"},400);
  try{
    if(body.action==="subscribe"){
      if(!pushConfigured(env))return json({error:"Configurare prima le chiavi VAPID su Cloudflare"},503);
      const r=await registerDevice(env,origin,body.subscription,{
        orders:body.orders!==false,bookings:body.bookings!==false
      });
      return json({ok:true,id:r.id});
    }
    if(body.action==="unsubscribe"){
      return json(await unregisterDevice(env,origin,body.endpoint));
    }
    if(body.action==="test"){
      if(!pushConfigured(env))return json({error:"Web Push non configurato"},503);
      const state=await pushDiagnostics(env,origin);
      if(!state.activeDevices)return json({error:"Nessun dispositivo attivato per questo indirizzo del sito"},409);
      await enqueuePushEvent(env,origin,{kind:"test",id:crypto.randomUUID(),
        title:"🔔 Prova notifiche N'Farinati",
        body:"Le push di ordini e prenotazioni sono configurate per questo dispositivo.",
        target:"/admin.html?section=orders"});
      const result=await runPendingPush(env,origin,{limit:10});
      return json({ok:true,accepted:result.sent,failed:result.failed,
        message:result.sent?"Notifica accettata dal servizio push":"Nessuna notifica ancora accettata"});
    }
    if(body.action==="retry"){
      const r=await runPendingPush(env,origin,{limit:10});
      return json({ok:true,...r});
    }
    return json({error:"Operazione push non valida"},400);
  }catch(e){
    const safe=/^(Chiav|Provider|Endpoint|Notifica|Evento|Destinazione)/.test(String(e?.message||""));
    if(safe)return json({error:String(e.message)},400);
    console.error("Admin push operation failed",e?.name);
    return json({error:"Notifiche temporaneamente non disponibili"},503);
  }
}
