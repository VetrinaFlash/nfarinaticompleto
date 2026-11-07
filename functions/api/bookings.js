import {json,rateLimit} from "../_lib/auth.js";
import {bookingConfig,availableTimes,createBooking,bookingError,validDate} from "../_lib/booking.js";
import {enqueuePushEvent,runPendingPush} from "../_lib/push.js";

export async function onRequestGet({env,request}) {
  try {
    if(!(await rateLimit(env,request,"booking_availability",90,300)))
      return json({error:"Troppe richieste. Riprova tra qualche minuto."},429,{"Retry-After":"300"});
    const u=new URL(request.url), date=u.searchParams.get("date"), guests=Number(u.searchParams.get("guests")||2);
    const config=await bookingConfig(env);
    if (!date || !validDate(date) || !Number.isInteger(guests) || guests<1 || guests>config.max_party)
      return json({error:"Data o numero di persone non valido"},400);
    const {times}=await availableTimes(env,date,guests);
    return json({date,guests,times,duration_min:config.duration_min,buffer_min:config.buffer_min,
      max_party:config.max_party, enabled:!!config.enabled});
  } catch(e) {return bookingError(e);}
}
export async function onRequestPost(context) {
  const {env,request}=context;
  try {
    if(!(await rateLimit(env,request,"booking_create",8,600)))
      return json({error:"Troppe richieste. Riprova più tardi."},429,{"Retry-After":"600"});
    const body=await request.json();
    if(!body || typeof body!=="object" || Array.isArray(body)) return json({error:"Dati non validi"},400);
    if(env.TURNSTILE_SECRET_KEY) {
      if(typeof body.turnstile_token!=="string" || body.turnstile_token.length>4096) return json({error:"Verifica antispam richiesta"},400);
      const f=new FormData();
      f.set("secret",env.TURNSTILE_SECRET_KEY);f.set("response",body.turnstile_token);
      f.set("remoteip",request.headers.get("CF-Connecting-IP")||"");
      const response=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body:f});
      if(!response.ok || !(await response.json()).success) return json({error:"Verifica antispam non superata"},403);
    }
    const booking=await createBooking(env,body,"online");
    try{
      const origin=new URL(request.url).origin;
      await enqueuePushEvent(env,origin,{kind:"booking",id:booking.id,
        title:"📅 Nuova prenotazione tavolo",
        body:booking.date+" · ore "+booking.time+" · "+booking.guests+" persone",
        target:"/admin-prenotazioni.html?date="+booking.date+"#agenda"});
      const task=runPendingPush(env,origin).catch(e=>console.error("Booking push dispatch",e?.name));
      if(context.waitUntil)context.waitUntil(task);else await task;
    }catch(e){console.error("Booking push queue failed",e?.name)}
    return json({ok:true,booking},201);
  } catch(e) {return bookingError(e);}
}
