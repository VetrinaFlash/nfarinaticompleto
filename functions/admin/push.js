import { adminIdentity, json } from "../_lib/auth.js";
import {
  pushDiagnostics,registerDevice,unregisterDevice,sendPushTestToDevice,
  runPendingPush,pushConfigured
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
    const stage=typeof e?.stage==="string" ? e.stage : "diagnostics-read";
    const detail=String(e?.message||"Errore database non specificato")
      .replace(/https?:\/\/[^\s]+/gi,"[URL]").replace(/Bearer\s+[^\s]+/gi,"[riservato]").slice(0,180);
    console.error("Push diagnostics failed",stage,e?.name,detail);
    return json({
      error:"Database D1: problema durante '"+stage+"'. "+detail+
        " Controlla il binding DB di Preview e ripubblica il branch. Le chiavi VAPID non vanno reinserite.",
      code:"PUSH_D1_STAGE_FAILED",stage
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
      const r=await registerDevice(env,origin,body.subscription,{orders:true,bookings:false});
      return json({ok:true,id:r.id});
    }
    if(body.action==="unsubscribe"){
      return json(await unregisterDevice(env,origin,body.endpoint));
    }
    if(body.action==="test"){
      // A test is NEVER broadcast or enqueued. It targets ONLY the device
      // the currently authenticated admin selected on this browser.
      const result=await sendPushTestToDevice(env,origin,body.endpoint);
      return json(result);
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
