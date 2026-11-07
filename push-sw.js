/* N'Farinati admin push service worker. No fetch interception or offline caching. */
self.addEventListener("install",event=>event.waitUntil(self.skipWaiting()));
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
self.addEventListener("push",event=>{
  event.waitUntil((async()=>{
    let info={};
    try{info=event.data?.json()||{}}catch{
      try{info={body:event.data?.text()||""}}catch{}
    }
    // Drop all stale booking pushes and historical queued test broadcasts.
    // Only finalized orders and explicitly requested per-device tests are shown.
    if(info.kind!=="order" && !(info.kind==="test" && info.manualTest===true))return;
    const targetUrl=new URL(typeof info.url==="string"?info.url:"/admin.html",self.location.origin);
    const allowed=targetUrl.origin===self.location.origin &&
      /^\/admin\.html$/.test(targetUrl.pathname);
    const target=allowed?targetUrl.pathname+targetUrl.search+targetUrl.hash:"/admin.html";
    const kind=info.kind;
    await self.registration.showNotification(String(info.title||"N'Farinati · Novità").slice(0,110),{
      body:String(info.body||"Apri il pannello amministrativo").slice(0,200),
      icon:"/images/logo.jpg",badge:"/images/logo.jpg",tag:String(info.eventId||"nf-"+Date.now()),
      renotify:false,requireInteraction:kind==="order",
      data:{url:target},actions:[{action:"open",title:"Apri il pannello"}]
    });
  })());
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const path=event.notification.data?.url||"/admin.html";
    const url=new URL(path,self.location.origin);
    if(url.origin!==self.location.origin)return;
    const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    const current=windows.find(w=>new URL(w.url).origin===url.origin);
    if(current){
      try{await current.navigate(url.href);await current.focus();return}catch{}
    }
    await self.clients.openWindow(url.href);
  })());
});
