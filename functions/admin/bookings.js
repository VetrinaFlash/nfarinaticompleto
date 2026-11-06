import {adminIdentity,json} from "../_lib/auth.js";
import {ensureBookingSchema,bookingConfig,createBooking,updateBooking,changeStatus,extendBooking,bookingError,validDate,parseTime,timeText,italyNow,addDays} from "../_lib/booking.js";

async function admin(env,request) {
  const user=await adminIdentity(env,request);
  if(!user)return null;
  await ensureBookingSchema(env);
  return user;
}
const val=(v,min,max)=>Number.isInteger(Number(v)) && Number(v)>=min && Number(v)<=max ? Number(v) : null;
function settingsBody(body) {
  const limits={capacity:[1,1000],holdback:[0,999],max_party:[1,100],duration_min:[30,240],
    buffer_min:[0,60],interval_min:[15,60],advance_days:[1,365],notice_min:[0,10080],grace_min:[0,120],
    enabled:[0,1],table_mode:[0,1]};
  const result={};
  for(const [key,[min,max]] of Object.entries(limits)) {
    const v=val(body[key],min,max);
    if(v===null || (key==="interval_min" && ![15,30,60].includes(v)) ||
      (["duration_min","buffer_min"].includes(key) && v%15!==0)) throw Error("Impostazione non valida: "+key);
    result[key]=v;
  }
  if(result.holdback>=result.capacity) throw Error("I posti riservati devono essere inferiori alla capienza");
  return result;
}
export async function onRequestGet({env,request}) {
  try {
    if(!await admin(env,request))return json({error:"Non autorizzato"},401);
    const u=new URL(request.url),mode=u.searchParams.get("mode")||"bookings";
    if(mode==="settings") {
      const [config,hours,closures,tables]=await Promise.all([
        bookingConfig(env),
        env.DB.prepare("SELECT * FROM booking_hours ORDER BY weekday").all(),
        env.DB.prepare("SELECT date,reason FROM booking_closed_dates WHERE date>=date('now','-1 day') ORDER BY date LIMIT 150").all(),
        env.DB.prepare("SELECT id,label,seats,zone,active FROM booking_tables ORDER BY zone,label").all()
      ]);
      return json({config,hours:hours.results||[],closures:closures.results||[],tables:tables.results||[]});
    }
    if(mode==="alerts") {
      const row=await env.DB.prepare("SELECT COUNT(*) AS total, MAX(id) AS last_id FROM booking_notifications WHERE seen=0").first();
      const recent=await env.DB.prepare("SELECT n.id,n.kind,n.created_at,r.name,r.guests,r.date,r.start_min FROM booking_notifications n JOIN booking_reservations r ON r.id=n.reservation_id WHERE n.seen=0 ORDER BY n.id DESC LIMIT 5").all();
      return json({unread:Number(row?.total||0),last_id:Number(row?.last_id||0),recent:recent.results||[]});
    }
    const date=u.searchParams.get("date")||italyNow().date;
    if(!validDate(date))return json({error:"Data non valida"},400);
    const status=u.searchParams.get("status")||"";
    if(status && !["confirmed","arrived","seated","completed","cancelled","no_show"].includes(status))
      return json({error:"Stato non valido"},400);
    const page=Math.max(1,Math.min(1000,Number(u.searchParams.get("page"))||1));
    const limit=50,offset=(page-1)*limit;
    const where="date=?"+(status?" AND status=?":"");
    const binds=status?[date,status]:[date];
    const [rows,counts,notifications,config]=await Promise.all([
      env.DB.prepare("SELECT id,source,name,phone,email,date,start_min,end_min,guests,status,notes,table_id,created_at FROM booking_reservations WHERE "+where+" ORDER BY start_min,created_at LIMIT ? OFFSET ?").bind(...binds,limit,offset).all(),
      env.DB.prepare("SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN status IN('confirmed','arrived','seated') THEN guests ELSE 0 END),0) AS booked FROM booking_reservations WHERE date=?").bind(date).first(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM booking_notifications WHERE seen=0").first(),
      bookingConfig(env)
    ]);
    return json({bookings:rows.results||[],total:Number(counts?.total||0),booked:Number(counts?.booked||0),unread:Number(notifications?.total||0),
      capacity:config.capacity,page,limit,date});
  } catch(e){return bookingError(e);}
}
export async function onRequestPost({env,request}) {
  try {
    if(!await admin(env,request))return json({error:"Non autorizzato"},401);
    const body=await request.json();
    if(!body || typeof body!=="object" || Array.isArray(body))return json({error:"Richiesta non valida"},400);
    switch(body.action) {
      case "settings": {
        const c=settingsBody(body.config||{});
        const keys=Object.keys(c);
        await env.DB.prepare("UPDATE booking_config SET "+keys.map(k=>k+"=?").join(",")+" WHERE id=1").bind(...keys.map(k=>c[k])).run();
        return json({ok:true});
      }
      case "hours": {
        if(!Array.isArray(body.hours) || body.hours.length!==7)return json({error:"Servono sette giorni"},400);
        const seen=new Set(),statements=[];
        for(const h of body.hours){
          const d=val(h.weekday,0,6),en=val(h.enabled,0,1),o=parseTime(h.opens),c=parseTime(h.closes);
          if(d===null || en===null || o===null || c===null || c<=o || seen.has(d))
            return json({error:"Orari non validi"},400);
          seen.add(d);
          statements.push(env.DB.prepare("UPDATE booking_hours SET enabled=?,opens=?,closes=? WHERE weekday=?").bind(en,timeText(o),timeText(c),d));
        }
        await env.DB.batch(statements);return json({ok:true});
      }
      case "close_day": {
        if(!validDate(body.date) || String(body.reason||"").length>140)return json({error:"Data non valida"},400);
        await env.DB.prepare("INSERT INTO booking_closed_dates(date,reason) VALUES(?,?) ON CONFLICT(date) DO UPDATE SET reason=excluded.reason").bind(body.date,String(body.reason||"")).run();
        return json({ok:true});
      }
      case "open_day": {
        if(!validDate(body.date))return json({error:"Data non valida"},400);
        await env.DB.prepare("DELETE FROM booking_closed_dates WHERE date=?").bind(body.date).run();
        return json({ok:true});
      }
      case "table": {
        const seats=val(body.seats,1,40), label=String(body.label||"").trim(),zone=String(body.zone||"Sala").trim();
        const active=val(body.active===undefined?1:body.active,0,1);
        if(!seats || !label || label.length>50 || !zone || zone.length>45 || active===null)
          return json({error:"Dati tavolo non validi"},400);
        const id=body.id ? String(body.id) : crypto.randomUUID();
        if(!/^[0-9a-z-]{1,64}$/i.test(id))return json({error:"ID tavolo non valido"},400);
        await env.DB.prepare("INSERT INTO booking_tables(id,label,seats,zone,active) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,seats=excluded.seats,zone=excluded.zone,active=excluded.active")
          .bind(id,label,seats,zone,active).run();
        return json({ok:true,id});
      }
      case "create": return json({ok:true,booking:await createBooking(env,body,"manual")},201);
      case "edit": {
        if(typeof body.id!=="string" || body.id.length>80)return json({error:"ID non valido"},400);
        return json(await updateBooking(env,body.id,body));
      }
      case "extend": {
        if(typeof body.id!=="string" || body.id.length>80)return json({error:"ID non valido"},400);
        return json(await extendBooking(env,body.id,body.minutes));
      }
      case "status": {
        if(typeof body.id!=="string" || body.id.length>80)return json({error:"ID non valido"},400);
        return json(await changeStatus(env,body.id,body.status));
      }
      case "ack": {
        const id=body.id===undefined?null:val(body.id,1,Number.MAX_SAFE_INTEGER);
        if(body.id!==undefined && id===null)return json({error:"ID avviso non valido"},400);
        if(id)await env.DB.prepare("UPDATE booking_notifications SET seen=1 WHERE id=?").bind(id).run();
        else await env.DB.prepare("UPDATE booking_notifications SET seen=1 WHERE seen=0").run();
        return json({ok:true});
      }
      default:return json({error:"Operazione sconosciuta"},400);
    }
  } catch(e){return bookingError(e);}
}
