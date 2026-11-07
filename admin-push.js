/* Shared opt-in for the main admin and the reservation console. */
(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  let config=null, busy=false, checking=false;
  // The inline copy on each admin page should never initialize twice.
  if(window.__nfPushInitialized)return;
  window.__nfPushInitialized=true;
  function mount(){
    const quickEnable=$("nf-push-quick-enable");
    const quickTest=$("nf-push-quick-test");
    const quickSettings=$("nf-push-quick-settings");
    if(quickEnable && !quickEnable.dataset.bound){
      quickEnable.addEventListener("click",()=>enable(false));
      quickEnable.dataset.bound="true";
    }
    if(quickTest && !quickTest.dataset.bound){
      quickTest.addEventListener("click",test);
      quickTest.dataset.bound="true";
    }
    if(quickSettings && !quickSettings.dataset.bound){
      quickSettings.addEventListener("click",()=>{
        const tab=document.querySelector('.tab[data-tab="settings"]');
        if(tab)tab.click();
        const widget=$("nf-push-widget");
        if(widget)widget.scrollIntoView({behavior:"smooth",block:"center"});
        refresh();
      });
      quickSettings.dataset.bound="true";
    }
    if($("nf-push-widget"))return;
    const parent=document.querySelector(".sidebar-footer")||
      document.querySelector("main .top")||document.querySelector("main");
    if(!parent)return;
    const box=document.createElement("section");
    box.id="nf-push-widget";box.setAttribute("aria-label","Notifiche push amministratore");
    box.innerHTML='<strong>🔔 Notifiche nuovi ordini</strong>'+
      '<button id="nf-push-enable" type="button">Attiva push su questo dispositivo</button>'+
      '<button id="nf-push-test" type="button" hidden>Invia una prova</button>'+
      '<button id="nf-push-reconnect" type="button" hidden>↻ Riattiva push</button>'+
      '<button id="nf-push-disable" type="button" hidden>Disattiva</button>'+
      '<small role="status" aria-live="polite" id="nf-push-status">Verifica disponibilità...</small>';
    if(parent.classList.contains("sidebar-footer"))parent.prepend(box);else parent.append(box);
    $("nf-push-enable").addEventListener("click",()=>enable(false));
    $("nf-push-disable").addEventListener("click",disable);
    $("nf-push-test").addEventListener("click",test);
    $("nf-push-reconnect").addEventListener("click",()=>enable(true));
  }
  const available=()=>window.isSecureContext&&"serviceWorker" in navigator&&
    "PushManager" in window&&"Notification" in window;
  const say=(msg,kind="",summary="")=>{
    const el=$("nf-push-status");if(el){el.textContent=msg;el.dataset.kind=kind}
    const quick=$("nf-push-quick-status");
    if(quick){
      quick.textContent=summary||msg.slice(0,72)+(msg.length>72?"…":"");
      quick.dataset.kind=kind;
      quick.title=msg;
    }
  };
  function buttons(active,configured){
    const e=$("nf-push-enable"),t=$("nf-push-test"),d=$("nf-push-disable"),
      reconnect=$("nf-push-reconnect");
    const blocked=available()&&Notification.permission==="denied";
    if(e){
      e.hidden=active;e.disabled=busy||!configured||blocked;
      t.hidden=!active;t.disabled=busy;
      d.hidden=!active;d.disabled=busy;
      reconnect.hidden=!active;reconnect.disabled=busy;
    }
    const quickEnable=$("nf-push-quick-enable"),quickTest=$("nf-push-quick-test"),
      quickSettings=$("nf-push-quick-settings");
    if(quickEnable){
      quickEnable.hidden=active||!configured||blocked;
      quickEnable.disabled=busy;
      quickTest.hidden=!active;
      quickTest.disabled=busy;
      quickSettings.hidden=active||(configured&&!blocked&&available());
      quickSettings.disabled=busy;
    }
  }
  function deadline(operation,ms=6500){
    // Prevent the UI hanging forever when a Pages Function or a Service Worker stalls.
    let timer;
    return Promise.race([
      Promise.resolve().then(operation),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("Tempo scaduto. Verifica connessione e servizio notifiche.")),ms)})
    ]).finally(()=>clearTimeout(timer));
  }
  async function api(body){
    const controller=new AbortController();
    let timer=setTimeout(()=>controller.abort(),6500);
    try{
      const response=await fetch("/admin/push",{method:body?"POST":"GET",credentials:"same-origin",
        cache:"no-store",signal:controller.signal,
        ...(body?{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})});
      const data=await deadline(()=>response.json(),3500);
      if(!response.ok)throw Error(data.error||"Servizio notifiche non disponibile ("+response.status+")");
      return data;
    }catch(e){
      if(e.name==="AbortError")throw Error("Il controllo push non risponde (timeout). Apri Impostazioni e riprova.");
      throw e;
    }finally{clearTimeout(timer)}
  }
  function decode(key){
    const s=atob(key.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(key.length/4)*4,"="));
    return Uint8Array.from(s,x=>x.charCodeAt(0));
  }
  async function refresh(){
    mount();
    if(busy||checking||!$("nf-push-enable"))return;
    checking=true;
    const settings=$("nf-push-quick-settings");
    if(settings)settings.hidden=false;
    say("Verifica stato notifiche in corso...","","Verifica push…");
    try{
      if(!available()){
        say("Browser non compatibile. Su iPhone aggiungi il sito alla schermata Home prima di attivare le push.","error","Push non supportate");
        buttons(false,false);return;
      }
      config=await api();
      if(!config.configured||!config.publicKey){
        const states=config.keyStatus||{},missing=[];
        if(states.public!=="ok")missing.push("VAPID_PUBLIC_KEY: "+(states.public==="invalid"?"formato non valido":"assente"));
        if(states.private!=="ok")missing.push("VAPID_PRIVATE_KEY: "+(states.private==="invalid"?"formato non valido":"assente"));
        const envName=config.runtimeBranch==="main"?"Production":"Preview";
        say("Questo deploy non legge le chiavi Web Push correttamente ("+envName+"): "+
          (missing.join(" · ")||"verifica configurazione")+
          ". Apri le impostazioni Cloudflare e ridistribuisci il sito dopo aver salvato i secret.",
          "error","Chiavi push da verificare");
        buttons(false,false);return;
      }
      if(Notification.permission==="denied"){
        say("Permesso notifiche negato. Abilitalo nelle impostazioni del browser.","error","Push bloccate");
        buttons(false,true);return;
      }
      const registration=await deadline(()=>navigator.serviceWorker.getRegistration("/"));
      const sub=registration?await deadline(()=>registration.pushManager.getSubscription()):null;
      const active=Notification.permission==="granted"&&!!sub;
      buttons(active,true);
      say(active?"Push attive su questo dispositivo · "+config.activeDevices+
        " dispositivi registrati · "+config.pending+" notifiche in attesa.":
        "Notifiche non attive su questo dispositivo. Tocca Attiva push per registrarlo.",
        active?"success":"",active?"Push attive":"Push non attive");
    }catch(e){
      say("Controllo push non riuscito: "+String(e?.message||"Errore sconosciuto")+
        ". Tocca Verifica push per riprovare, oppure controlla i log Cloudflare.",
        "error","Push non disponibili");
      buttons(false,false);
    }finally{
      checking=false;
      // A failed API call must never strand the quick panel in "Controllo push".
      if(settings && !config?.configured)settings.hidden=false;
    }
  }
  async function enable(replaceExisting=false){
    if(busy)return;
    busy=true;say("Richiesta di autorizzazione...","","Attivazione push…");buttons(false,!!config?.configured);
    try{
      if(!available())throw Error("Browser o contesto HTTPS non compatibile");
      // The permission prompt must be triggered by an explicit tap.
      const permission=await Notification.requestPermission();
      if(permission!=="granted")throw Error("Permesso negato nelle impostazioni del browser");
      config=await api();
      if(!config.configured||!config.publicKey)throw Error("Chiavi Web Push non configurate sul server");
      const registration=await deadline(()=>navigator.serviceWorker.register("/push-sw.js",{scope:"/",updateViaCache:"none"}),9000);
      await deadline(()=>navigator.serviceWorker.ready,9000);
      let sub=await deadline(()=>registration.pushManager.getSubscription(),9000);
      if(sub&&replaceExisting){await sub.unsubscribe();sub=null}
      if(sub&&sub.options?.applicationServerKey){
        const old=new Uint8Array(sub.options.applicationServerKey),next=decode(config.publicKey);
        if(old.length!==next.length||old.some((n,i)=>n!==next[i])){await sub.unsubscribe();sub=null}
      }
      if(!sub)sub=await deadline(()=>registration.pushManager.subscribe({
        userVisibleOnly:true,applicationServerKey:decode(config.publicKey)
      }),12000);
      await api({action:"subscribe",subscription:sub.toJSON(),orders:true,bookings:false});
      say("Attivate! Riceverai push soltanto per nuovi ordini confermati. Premi Prova per verificare questo telefono.","success","Push ordini attive");
    }catch(e){say("Attivazione non riuscita: "+(e.message||"errore"),"error","Attivazione fallita")}
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
    say("Invio notifica di prova SOLO su questo dispositivo...","","Prova in invio…");
    try{
      const reg=await deadline(()=>navigator.serviceWorker.getRegistration("/"));
      const sub=reg?await deadline(()=>reg.pushManager.getSubscription()):null;
      if(!sub?.endpoint)throw Error("Attiva le notifiche su questo dispositivo prima della prova");
      const r=await api({action:"test",endpoint:sub.endpoint});
      say(r.accepted>0?"Push accettata su "+r.accepted+" dispositivo/i. Controlla il telefono.":
        "Nessuna push accettata: verifica impostazioni e connettività.",r.accepted>0?"success":"error",
      r.accepted>0?"Prova inviata":"Prova non riuscita");
    }catch(e){say("Test fallito: "+e.message,"error","Prova non riuscita")}
    finally{busy=false;buttons(true,true)}
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",refresh,{once:true});
  else refresh();
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)refresh()});
  window.addEventListener("nf-admin-login",refresh);
  setInterval(refresh,60000);
})();