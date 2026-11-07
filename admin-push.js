/* Shared opt-in for the main admin and the reservation console. */
(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  let config=null, busy=false;
  function mount(){
    if($("nf-push-widget"))return;
    const parent=document.querySelector(".sidebar-footer")||
      document.querySelector("main .top")||document.querySelector("main");
    if(!parent)return;
    const box=document.createElement("section");
    box.id="nf-push-widget";box.setAttribute("aria-label","Notifiche push amministratore");
    box.innerHTML='<strong>🔔 Notifiche ordini e tavoli</strong>'+
      '<button id="nf-push-enable" type="button">Attiva push su questo dispositivo</button>'+
      '<button id="nf-push-test" type="button" hidden>Invia una prova</button>'+
      '<button id="nf-push-disable" type="button" hidden>Disattiva</button>'+
      '<small role="status" aria-live="polite" id="nf-push-status">Verifica disponibilità...</small>';
    if(parent.classList.contains("sidebar-footer"))parent.prepend(box);else parent.append(box);
    $("nf-push-enable").addEventListener("click",enable);
    $("nf-push-disable").addEventListener("click",disable);
    $("nf-push-test").addEventListener("click",test);
  }
  const available=()=>window.isSecureContext&&"serviceWorker" in navigator&&
    "PushManager" in window&&"Notification" in window;
  const say=(msg,kind="")=>{
    const el=$("nf-push-status");if(el){el.textContent=msg;el.dataset.kind=kind}
  };
  function buttons(active,configured){
    const e=$("nf-push-enable"),t=$("nf-push-test"),d=$("nf-push-disable");
    if(!e)return;
    e.hidden=active;e.disabled=busy||!configured;
    t.hidden=!active;t.disabled=busy;
    d.hidden=!active;d.disabled=busy;
  }
  async function api(body){
    const response=await fetch("/admin/push",{method:body?"POST":"GET",credentials:"same-origin",
      cache:"no-store",...(body?{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||"Servizio notifiche non disponibile");
    return data;
  }
  function decode(key){
    const s=atob(key.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(key.length/4)*4,"="));
    return Uint8Array.from(s,x=>x.charCodeAt(0));
  }
  async function refresh(){
    mount();
    if(busy||!$("nf-push-enable"))return;
    if(!available()){
      say("Browser non compatibile. Su iPhone aggiungi il sito alla schermata Home prima di attivare le push.","error");
      buttons(false,false);return;
    }
    try{
      config=await api();
      if(!config.configured||!config.publicKey){
        say("Configurazione richiesta: VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY nei secret Cloudflare.","error");
        buttons(false,false);return;
      }
      if(Notification.permission==="denied"){
        say("Permesso negato: abilita le notifiche nelle impostazioni di questo sito.","error");
        buttons(false,true);return;
      }
      const reg=await navigator.serviceWorker.getRegistration("/");
      const sub=reg?await reg.pushManager.getSubscription():null;
      const active=Notification.permission==="granted"&&!!sub;
      buttons(active,true);
      say(active?"Push abilitate su questo telefono · Dispositivi attivi: "+config.activeDevices+
        " · In attesa: "+config.pending+".":"Attiva per ricevere ordini e prenotazioni anche a pannello chiuso.",active?"success":"");
    }catch(e){say(e.message||"Controllo push non disponibile","error");buttons(false,false)}
  }
  async function enable(){
    if(busy)return;
    busy=true;say("Richiesta di autorizzazione...");
    try{
      if(!available())throw Error("Browser o contesto HTTPS non compatibile");
      // The permission prompt must be triggered by an explicit tap.
      const permission=await Notification.requestPermission();
      if(permission!=="granted")throw Error("Permesso negato nelle impostazioni del browser");
      config=await api();
      if(!config.configured||!config.publicKey)throw Error("Chiavi Web Push non configurate sul server");
      const registration=await navigator.serviceWorker.register("/push-sw.js",{scope:"/",updateViaCache:"none"});
      await navigator.serviceWorker.ready;
      let sub=await registration.pushManager.getSubscription();
      if(sub&&sub.options?.applicationServerKey){
        const old=new Uint8Array(sub.options.applicationServerKey),next=decode(config.publicKey);
        if(old.length!==next.length||old.some((n,i)=>n!==next[i])){await sub.unsubscribe();sub=null}
      }
      if(!sub)sub=await registration.pushManager.subscribe({
        userVisibleOnly:true,applicationServerKey:decode(config.publicKey)
      });
      await api({action:"subscribe",subscription:sub.toJSON(),orders:true,bookings:true});
      say("Attivate! Riceverai push per ordini e prenotazioni. Prova il pulsante di test.","success");
    }catch(e){say("Attivazione non riuscita: "+(e.message||"errore"),"error")}
    finally{busy=false;await refresh()}
  }
  async function disable(){
    if(busy)return;busy=true;
    try{
      const reg=await navigator.serviceWorker.getRegistration("/");
      const sub=reg?await reg.pushManager.getSubscription():null;
      if(sub){await api({action:"unsubscribe",endpoint:sub.endpoint});await sub.unsubscribe()}
      say("Push disattivate su questo telefono.","success");
    }catch(e){say(e.message,"error")}
    finally{busy=false;await refresh()}
  }
  async function test(){
    if(busy)return;busy=true;buttons(true,true);
    say("Invio notifica di prova...");
    try{
      const r=await api({action:"test"});
      say(r.accepted>0?"Push accettata su "+r.accepted+" dispositivo/i. Controlla il telefono.":
        "Nessuna push accettata: verifica impostazioni e connettività.",r.accepted>0?"success":"error");
    }catch(e){say("Test fallito: "+e.message,"error")}
    finally{busy=false;buttons(true,true)}
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",refresh,{once:true});
  else refresh();
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)refresh()});
  window.addEventListener("nf-admin-login",refresh);
  setInterval(refresh,60000);
})();