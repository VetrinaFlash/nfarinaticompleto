import {json,rateLimit} from "../_lib/auth.js";
import {bookingConfig,fetchByToken,changeStatus,updateBooking,bookingError,timeText,italyNow} from "../_lib/booking.js";
async function guard(env,request,id,token) {
  if(!(await rateLimit(env,request,"booking_manage",60,900))) return {error:json({error:"Troppe richieste"},429)};
  const booking=await fetchByToken(env,id,token);
  return booking?{booking}:{error:json({error:"Prenotazione non trovata"},404)};
}
export async function onRequestGet({env,request}) {
  try {
    const u=new URL(request.url),r=await guard(env,request,u.searchParams.get("id"),u.searchParams.get("token"));
    if(r.error)return r.error;
    const b=r.booking,c=await bookingConfig(env);
    return json({booking:{id:b.id,code:"NF-"+b.id.slice(0,8).toUpperCase(),name:b.name,phone:b.phone,
      email:b.email,date:b.date,time:timeText(b.start_min),guests:b.guests,status:b.status,notes:b.notes,
      duration_min:c.duration_min}});
  } catch(e){return bookingError(e);}
}
export async function onRequestPost({env,request}) {
  try {
    const body=await request.json(),r=await guard(env,request,body?.id,body?.token);
    if(r.error)return r.error;
    if(body.action==="cancel") {
      if(r.booking.date<italyNow().date)return json({error:"Non puoi cancellare una prenotazione passata"},400);
      return json(await changeStatus(env,body.id,"cancelled"));
    }
    if(body.action==="reschedule") {
      if(r.booking.date<italyNow().date)return json({error:"Prenotazione non più modificabile"},400);
      return json(await updateBooking(env,body.id,{date:body.date,time:body.time,guests:body.guests}));
    }
    return json({error:"Operazione non valida"},400);
  } catch(e){return bookingError(e);}
}
