import { json, randomToken, sha256 } from "./auth.js";

const cache = new WeakMap();
const ACTIVE = ["confirmed", "arrived", "seated"];
export const TZ = "Europe/Rome";
export const timeText = n => String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
export const parseTime = value => /^\d\d:\d\d$/.test(String(value)) && +value.slice(0, 2) < 24 && +value.slice(3) < 60 ? +value.slice(0, 2) * 60 + +value.slice(3) : null;
export const validDate = d => { if(!/^\d{4}-\d{2}-\d{2}$/.test(String(d))) return false; const date=new Date(d+'T00:00:00Z'); return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===d; };
export function italyNow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).map(p => [p.type, p.value]));
  return { date: parts.year + "-" + parts.month + "-" + parts.day, minute: +parts.hour * 60 + +parts.minute };
}
export const weekday = d => new Date(d + "T12:00:00Z").getUTCDay();
export function addDays(d, count) { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + count); return x.toISOString().slice(0,10); }
const schema = [
  `CREATE TABLE IF NOT EXISTS booking_config (
    id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)),
    capacity INTEGER NOT NULL DEFAULT 50 CHECK(capacity BETWEEN 1 AND 1000),
    holdback INTEGER NOT NULL DEFAULT 0 CHECK(holdback BETWEEN 0 AND 999),
    max_party INTEGER NOT NULL DEFAULT 8 CHECK(max_party BETWEEN 1 AND 100),
    duration_min INTEGER NOT NULL DEFAULT 90 CHECK(duration_min BETWEEN 30 AND 240),
    buffer_min INTEGER NOT NULL DEFAULT 15 CHECK(buffer_min BETWEEN 0 AND 60),
    interval_min INTEGER NOT NULL DEFAULT 30 CHECK(interval_min IN(15,30,60)),
    advance_days INTEGER NOT NULL DEFAULT 60 CHECK(advance_days BETWEEN 1 AND 365),
    notice_min INTEGER NOT NULL DEFAULT 60 CHECK(notice_min BETWEEN 0 AND 10080),
    grace_min INTEGER NOT NULL DEFAULT 15 CHECK(grace_min BETWEEN 0 AND 120),
    table_mode INTEGER NOT NULL DEFAULT 0 CHECK(table_mode IN(0,1)),
    CHECK(holdback < capacity)
  )`,
  `CREATE TABLE IF NOT EXISTS booking_hours (
    weekday INTEGER PRIMARY KEY CHECK(weekday BETWEEN 0 AND 6),
    enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
    opens TEXT NOT NULL DEFAULT '18:30', closes TEXT NOT NULL DEFAULT '23:30'
  )`,
  `CREATE TABLE IF NOT EXISTS booking_closed_dates (date TEXT PRIMARY KEY, reason TEXT NOT NULL DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS booking_tables (
    id TEXT PRIMARY KEY, label TEXT NOT NULL, seats INTEGER NOT NULL CHECK(seats BETWEEN 1 AND 40),
    zone TEXT NOT NULL DEFAULT 'Sala', active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1))
  )`,
  `CREATE TABLE IF NOT EXISTS booking_ticks (n INTEGER PRIMARY KEY CHECK(n BETWEEN 0 AND 95))`,
  `CREATE TABLE IF NOT EXISTS booking_slot_inventory (
    date TEXT NOT NULL, minute INTEGER NOT NULL,
    total INTEGER NOT NULL DEFAULT 0 CHECK(total>=0),
    online INTEGER NOT NULL DEFAULT 0 CHECK(online>=0),
    PRIMARY KEY(date,minute), CHECK(online<=total)
  )`,
  `CREATE TABLE IF NOT EXISTS booking_reservations (
    id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, source TEXT NOT NULL CHECK(source IN('online','manual')),
    name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL, start_min INTEGER NOT NULL, end_min INTEGER NOT NULL,
    duration_min INTEGER NOT NULL DEFAULT 90, buffer_min INTEGER NOT NULL DEFAULT 15,
    guests INTEGER NOT NULL CHECK(guests BETWEEN 1 AND 100),
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN('confirmed','arrived','seated','completed','cancelled','no_show')),
    notes TEXT NOT NULL DEFAULT '', table_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(table_id) REFERENCES booking_tables(id)
  )`,
  `CREATE INDEX IF NOT EXISTS booking_res_date_idx ON booking_reservations(date,start_min,status)`,
  `CREATE INDEX IF NOT EXISTS booking_res_phone_idx ON booking_reservations(phone,date)`,
  `CREATE TABLE IF NOT EXISTS booking_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT, reservation_id TEXT NOT NULL,
    kind TEXT NOT NULL, seen INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS booking_notif_seen_idx ON booking_notifications(seen,id)`,
  `CREATE TRIGGER IF NOT EXISTS booking_slot_insert_check BEFORE INSERT ON booking_slot_inventory
    WHEN NEW.total < 0 OR NEW.online < 0 OR NEW.online > NEW.total
      OR NEW.total > (SELECT capacity FROM booking_config WHERE id=1)
      OR NEW.online > (SELECT capacity-holdback FROM booking_config WHERE id=1)
    BEGIN SELECT RAISE(ABORT,'booking_full'); END`,
  `CREATE TRIGGER IF NOT EXISTS booking_slot_update_check BEFORE UPDATE ON booking_slot_inventory
    WHEN NEW.total < 0 OR NEW.online < 0 OR NEW.online > NEW.total
      OR (NEW.total > OLD.total AND NEW.total > (SELECT capacity FROM booking_config WHERE id=1))
      OR (NEW.online > OLD.online AND NEW.online > (SELECT capacity-holdback FROM booking_config WHERE id=1))
    BEGIN SELECT RAISE(ABORT,'booking_full'); END`,
  `CREATE TRIGGER IF NOT EXISTS booking_table_insert_check BEFORE INSERT ON booking_reservations
    WHEN NEW.table_id IS NOT NULL AND NEW.status IN ('confirmed','arrived','seated')
    BEGIN SELECT RAISE(ABORT,'table_unavailable') WHERE EXISTS (
      SELECT 1 FROM booking_reservations r WHERE r.table_id=NEW.table_id AND r.date=NEW.date
      AND r.status IN ('confirmed','arrived','seated')
      AND NEW.start_min < r.end_min AND NEW.end_min > r.start_min
    ); END`,
  `CREATE TRIGGER IF NOT EXISTS booking_table_update_check BEFORE UPDATE ON booking_reservations
    WHEN NEW.table_id IS NOT NULL AND NEW.status IN ('confirmed','arrived','seated')
    BEGIN SELECT RAISE(ABORT,'table_unavailable') WHERE EXISTS (
      SELECT 1 FROM booking_reservations r WHERE r.id<>NEW.id AND r.table_id=NEW.table_id AND r.date=NEW.date
      AND r.status IN ('confirmed','arrived','seated')
      AND NEW.start_min < r.end_min AND NEW.end_min > r.start_min
    ); END`,
  `CREATE TRIGGER IF NOT EXISTS booking_insert_inventory AFTER INSERT ON booking_reservations
    WHEN NEW.status IN ('confirmed','arrived','seated')
    BEGIN
      INSERT INTO booking_slot_inventory(date,minute,total,online)
      SELECT NEW.date, NEW.start_min + t.n*15, NEW.guests,
        CASE WHEN NEW.source='online' THEN NEW.guests ELSE 0 END
      FROM booking_ticks t WHERE NEW.start_min+t.n*15 < NEW.end_min
      ON CONFLICT(date,minute) DO UPDATE SET total=total+excluded.total, online=online+excluded.online;
      INSERT INTO booking_notifications(reservation_id,kind) VALUES(NEW.id,'created');
    END`,
  `CREATE TRIGGER IF NOT EXISTS booking_update_inventory AFTER UPDATE OF date,start_min,end_min,guests,source,status ON booking_reservations
    WHEN (OLD.date != NEW.date OR OLD.start_min != NEW.start_min OR OLD.end_min != NEW.end_min
      OR OLD.guests != NEW.guests OR OLD.source != NEW.source
      OR (OLD.status IN ('confirmed','arrived','seated')) != (NEW.status IN ('confirmed','arrived','seated')))
    BEGIN
      UPDATE booking_slot_inventory SET
        total=total-(CASE WHEN OLD.status IN ('confirmed','arrived','seated') THEN OLD.guests ELSE 0 END),
        online=online-(CASE WHEN OLD.status IN ('confirmed','arrived','seated') AND OLD.source='online' THEN OLD.guests ELSE 0 END)
      WHERE date=OLD.date AND minute>=OLD.start_min AND minute<OLD.end_min;
      INSERT INTO booking_slot_inventory(date,minute,total,online)
      SELECT NEW.date, NEW.start_min+t.n*15, NEW.guests,
        CASE WHEN NEW.source='online' THEN NEW.guests ELSE 0 END
      FROM booking_ticks t WHERE NEW.status IN ('confirmed','arrived','seated') AND NEW.start_min+t.n*15 < NEW.end_min
      ON CONFLICT(date,minute) DO UPDATE SET total=total+excluded.total, online=online+excluded.online;
      INSERT INTO booking_notifications(reservation_id,kind) VALUES(NEW.id,'changed');
    END`,
  `CREATE TRIGGER IF NOT EXISTS booking_status_notification AFTER UPDATE OF status ON booking_reservations
    WHEN OLD.status <> NEW.status
      AND (OLD.status IN ('confirmed','arrived','seated')) = (NEW.status IN ('confirmed','arrived','seated'))
    BEGIN INSERT INTO booking_notifications(reservation_id,kind) VALUES(NEW.id,'status'); END`
];
export async function ensureBookingSchema(env) {
  if (!env?.DB) throw Error("Database D1 non configurato");
  if (cache.has(env.DB)) return cache.get(env.DB);
  const task = (async () => {
    // All statements are idempotent; no modifications to pre-existing order/customer/auth tables.
    // D1 batches execute atomically and avoid 20+ round trips on cold starts.
    await env.DB.batch(schema.map(statement=>env.DB.prepare(statement)));
    // Online preview environments may already have the first schema revision.
    // Upgrade additively without touching the existing order/auth/warehouse tables.
    const cols=(await env.DB.prepare("PRAGMA table_info(booking_reservations)").all()).results||[];
    if(!cols.some(c=>c.name==="duration_min"))
      await env.DB.prepare("ALTER TABLE booking_reservations ADD COLUMN duration_min INTEGER NOT NULL DEFAULT 90").run();
    if(!cols.some(c=>c.name==="buffer_min"))
      await env.DB.prepare("ALTER TABLE booking_reservations ADD COLUMN buffer_min INTEGER NOT NULL DEFAULT 15").run();
    const seeds=[env.DB.prepare("INSERT OR IGNORE INTO booking_config(id) VALUES(1)")];
    for(let d=0;d<7;d++){
      seeds.push(env.DB.prepare("INSERT OR IGNORE INTO booking_hours(weekday,enabled,opens,closes) VALUES(?,?,?,?)")
        .bind(d,d===1?0:1,d===6?"18:00":"18:30",d===6?"23:00":"23:30"));
    }
    seeds.push(env.DB.prepare("INSERT OR IGNORE INTO booking_ticks(n) VALUES "+Array.from({length:96},(_,i)=>"("+i+")").join(",")));
    await env.DB.batch(seeds);
    // Rebuild old trigger definitions only once, allowing cancellations even if
    // capacity was lowered below already booked occupancy. Existing reservations stay intact.
    const migration=await env.DB.prepare("SELECT 1 AS ok FROM booking_schema_migrations WHERE version=2").first().catch(()=>null);
    if(!migration) {
      await env.DB.batch([
        env.DB.prepare("CREATE TABLE IF NOT EXISTS booking_schema_migrations (version INTEGER PRIMARY KEY)"),
        env.DB.prepare("DROP TRIGGER IF EXISTS booking_slot_update_check"),
        env.DB.prepare("DROP TRIGGER IF EXISTS booking_update_inventory"),
        env.DB.prepare(schema.find(x=>x.includes("CREATE TRIGGER IF NOT EXISTS booking_slot_update_check"))),
        env.DB.prepare(schema.find(x=>x.includes("CREATE TRIGGER IF NOT EXISTS booking_update_inventory"))),
        env.DB.prepare(schema.find(x=>x.includes("CREATE TRIGGER IF NOT EXISTS booking_status_notification"))),
        env.DB.prepare("INSERT OR IGNORE INTO booking_schema_migrations(version) VALUES(2)")
      ]);
    }
  })();
  cache.set(env.DB,task);
  try { await task; } catch(e) { cache.delete(env.DB); throw e; }
}
export async function bookingConfig(env) {
  await ensureBookingSchema(env);
  const config = await env.DB.prepare("SELECT * FROM booking_config WHERE id=1").first();
  return config;
}
export function validatePerson(name,phone,email="",notes="") {
  const clean = { name:String(name||"").trim().replace(/\s+/g," "), phone:String(phone||"").trim(), email:String(email||"").trim(), notes:String(notes||"").trim() };
  if (clean.name.length < 2 || clean.name.length > 80) throw Error("Inserisci nome e cognome");
  if (!/^\+?[0-9 ()-]{8,22}$/.test(clean.phone) || (clean.phone.match(/\d/g)||[]).length<8) throw Error("Numero di telefono non valido");
  if (clean.email && (clean.email.length>160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email))) throw Error("Email non valida");
  if (clean.notes.length>500) throw Error("Note troppo lunghe");
  return clean;
}
export async function validateSlot(env, config, date, time, guests, source="online", options={}) {
  if (!validDate(date)) throw Error("Data non valida");
  if (!Number.isInteger(guests) || guests<1 || guests>100 || (source==="online" && guests>config.max_party)) throw Error("Numero persone non valido");
  const start=parseTime(time);
  if (start===null || start%15!==0 || start%config.interval_min!==0) throw Error("Orario non valido");
  const now=italyNow();
  if (date < now.date || date > addDays(now.date,config.advance_days)) throw Error("Data non prenotabile");
  const daysFromNow=Math.round((Date.parse(date+"T00:00:00Z")-Date.parse(now.date+"T00:00:00Z"))/86400000);
  if (daysFromNow*1440+start < now.minute+config.notice_min) throw Error("Orario troppo vicino");
  if (!config.enabled && source==="online") throw Error("Prenotazioni temporaneamente sospese");
  const closed=await env.DB.prepare("SELECT date FROM booking_closed_dates WHERE date=?").bind(date).first();
  if (closed) throw Error("Locale chiuso in questa data");
  const h=await env.DB.prepare("SELECT * FROM booking_hours WHERE weekday=?").bind(weekday(date)).first();
  const opens=parseTime(h?.opens), closes=parseTime(h?.closes);
  if (!h?.enabled || opens===null || closes===null || start<opens ||
      config.buffer_min>=config.duration_min || start+config.duration_min>closes || start+config.duration_min>1440)
    throw Error("Orario non disponibile");
  // The configured duration is the entire blocked window: 90 minutes TOTAL,
  // including the 15 minutes needed to clear and prepare the table.
  return {date,start,end:start+config.duration_min,guests};
}
export async function tableCandidates(env,slot,tableMode,selectedId=null, excludeId=null) {
  if (!tableMode && !selectedId) return [null];
  const {results:tables}=await env.DB.prepare("SELECT * FROM booking_tables WHERE active=1 AND seats>=? ORDER BY seats,id").bind(slot.guests).all();
  const all=selectedId?tables.filter(t=>t.id===selectedId):tables;
  const candidates=[];
  for(const t of all) {
    const conflict=await env.DB.prepare("SELECT id FROM booking_reservations WHERE table_id=? AND date=? AND status IN('confirmed','arrived','seated') AND start_min<? AND end_min>? AND id<>? LIMIT 1")
      .bind(t.id,slot.date,slot.end,slot.start,excludeId||"").first();
    if(!conflict) candidates.push(t.id);
  }
  return candidates;
}
export async function isAvailable(env, config, slot, source="online", excludeId=null) {
  if(slot.guests > config.capacity || (source==="online" && slot.guests>config.capacity-config.holdback)) return false;
  const rows=await env.DB.prepare("SELECT minute,total,online FROM booking_slot_inventory WHERE date=? AND minute>=? AND minute<?")
    .bind(slot.date,slot.start,slot.end).all();
  let old = null;
  if(excludeId) old=await env.DB.prepare("SELECT * FROM booking_reservations WHERE id=? AND status IN('confirmed','arrived','seated')").bind(excludeId).first();
  for(const r of rows.results||[]) {
    const self = old && old.date===slot.date && r.minute>=old.start_min && r.minute<old.end_min ? old.guests : 0;
    const ownOnline = self && old.source==="online" ? self : 0;
    if(r.total-self+slot.guests>config.capacity || (source==="online" && r.online-ownOnline+slot.guests>config.capacity-config.holdback)) return false;
  }
  return true;
}
export async function availableTimes(env,date,guests) {
  const cfg=await bookingConfig(env),times=[];
  if(!cfg.enabled || cfg.buffer_min>=cfg.duration_min || !validDate(date) || !Number.isInteger(guests) || guests<1 ||
     guests>cfg.max_party || guests>cfg.capacity-cfg.holdback)
    return {times,config:cfg};
  const now=italyNow();
  if(date<now.date || date>addDays(now.date,cfg.advance_days)) return {times,config:cfg};
  const [h,closed]=await Promise.all([
    env.DB.prepare("SELECT * FROM booking_hours WHERE weekday=?").bind(weekday(date)).first(),
    env.DB.prepare("SELECT date FROM booking_closed_dates WHERE date=?").bind(date).first()
  ]);
  const opens=parseTime(h?.opens),closes=parseTime(h?.closes);
  if(!h?.enabled || closed || opens===null || closes===null || closes<=opens) return {times,config:cfg};
  // A single snapshot is sufficient for browsing; the database triggers
  // re-check capacity atomically when the customer actually confirms.
  const inventory=await env.DB.prepare("SELECT minute,total,online FROM booking_slot_inventory WHERE date=? AND minute>=? AND minute<?")
    .bind(date,opens,closes).all();
  let tables=[],assigned=[];
  if(cfg.table_mode){
    const both=await Promise.all([
      env.DB.prepare("SELECT id FROM booking_tables WHERE active=1 AND seats>=?").bind(guests).all(),
      env.DB.prepare("SELECT table_id,start_min,end_min FROM booking_reservations WHERE date=? AND table_id IS NOT NULL AND status IN('confirmed','arrived','seated')").bind(date).all()
    ]);
    tables=both[0].results||[];assigned=both[1].results||[];
    if(!tables.length)return {times,config:cfg};
  }
  for(let start=Math.ceil(opens/cfg.interval_min)*cfg.interval_min;start+cfg.duration_min<=closes;start+=cfg.interval_min) {
    const daysFromNow=Math.round((Date.parse(date+"T00:00:00Z")-Date.parse(now.date+"T00:00:00Z"))/86400000);
    if(start%15!==0 || daysFromNow*1440+start < now.minute+cfg.notice_min)continue;
    // The cleanup margin is already INCLUDED in the total duration.
    const end=start+cfg.duration_min;
    if(end>1440)continue;
    const full=(inventory.results||[]).some(r=>r.minute>=start && r.minute<end &&
      (r.total+guests>cfg.capacity || r.online+guests>cfg.capacity-cfg.holdback));
    if(full)continue;
    if(cfg.table_mode && !tables.some(t=>!assigned.some(r=>r.table_id===t.id && start<r.end_min && end>r.start_min)))continue;
    times.push(timeText(start));
  }
  return {times,config:cfg};
}
export async function createBooking(env,body,source="online") {
  const cfg=await bookingConfig(env);
  const guests=Number(body.guests);
  const person=validatePerson(body.name,body.phone,body.email,body.notes);
  const slot=await validateSlot(env,cfg,body.date,body.time,guests,source);
  // The client may supply a 256-bit random bearer token for safe retry after a lost response.
  // Only its SHA-256 digest is stored; repeating the same token cannot create two bookings.
  const token=typeof body.request_token==="string" && /^[a-f0-9]{64}$/.test(body.request_token)
    ? body.request_token : randomToken();
  const tokenHash=await sha256(token);
  const prior=await env.DB.prepare("SELECT id,date,start_min,guests,name,duration_min,buffer_min FROM booking_reservations WHERE token_hash=?").bind(tokenHash).first();
  if(prior) return {id:prior.id,token,code:"NF-"+prior.id.slice(0,8).toUpperCase(),
    date:prior.date,time:timeText(prior.start_min),guests:prior.guests,name:prior.name,
    duration_min:prior.duration_min,buffer_min:prior.buffer_min};
  if(!await isAvailable(env,cfg,slot,source)) throw Error("Posti esauriti per questo orario");
  const candidates=await tableCandidates(env,slot,cfg.table_mode,body.table_id||null);
  if(!candidates.length) throw Error("Non ci sono tavoli disponibili per questo gruppo");
  const id=crypto.randomUUID();
  let lastError=null;
  for(const tableId of candidates) {
    try {
      await env.DB.prepare(`INSERT INTO booking_reservations
        (id,token_hash,source,name,phone,email,date,start_min,end_min,duration_min,buffer_min,guests,notes,table_id)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id,tokenHash,source,person.name,person.phone,person.email,slot.date,slot.start,slot.end,cfg.duration_min,cfg.buffer_min,slot.guests,person.notes,tableId).run();
      return {id,token,code:"NF-"+id.slice(0,8).toUpperCase(),date:slot.date,time:timeText(slot.start),guests:slot.guests,duration_min:cfg.duration_min,buffer_min:cfg.buffer_min, name:person.name};
    } catch(e) {
      lastError=e;
      if(String(e?.message||"").includes("booking_reservations.token_hash")) {
        const prior=await env.DB.prepare("SELECT id,date,start_min,guests,name,duration_min,buffer_min FROM booking_reservations WHERE token_hash=?").bind(tokenHash).first();
        if(prior) return {id:prior.id,token,code:"NF-"+prior.id.slice(0,8).toUpperCase(),
          date:prior.date,time:timeText(prior.start_min),guests:prior.guests,name:prior.name,
          duration_min:prior.duration_min,buffer_min:prior.buffer_min};
      }
      if(!String(e?.message||"").includes("table_unavailable")) break;
    }
  }
  console.error("Booking create rejected",String(lastError?.message||"").slice(0,80));
  throw Error("Disponibilità terminata: scegli un altro orario");
}
export async function fetchByToken(env,id,token) {
  if(!/^[0-9a-f-]{36}$/.test(String(id||"")) || !/^[a-f0-9]{64}$/.test(String(token||""))) return null;
  await ensureBookingSchema(env);
  return env.DB.prepare("SELECT id,name,phone,email,date,start_min,end_min,duration_min,buffer_min,guests,status,notes,token_hash FROM booking_reservations WHERE id=? AND token_hash=?")
    .bind(id,await sha256(token)).first();
}
export async function updateBooking(env,id,changes) {
  await ensureBookingSchema(env);
  const existing=await env.DB.prepare("SELECT * FROM booking_reservations WHERE id=?").bind(id).first();
  if(!existing) throw Error("Prenotazione non trovata");
  if(!ACTIVE.includes(existing.status)) throw Error("Prenotazione non più modificabile");
  const cfg=await bookingConfig(env);
  const date=changes.date||existing.date, time=changes.time||timeText(existing.start_min),
    guests=changes.guests===undefined?existing.guests:Number(changes.guests);
  const slot=await validateSlot(env,{...cfg,duration_min:existing.duration_min,buffer_min:existing.buffer_min},date,time,guests,existing.source);
  if(!await isAvailable(env,cfg,slot,existing.source,id)) throw Error("Posti insufficienti nel nuovo orario");
  // If no specific table is requested, retain the assigned one when suitable,
  // but allow reassignment to another free table when it no longer fits.
  let tableIds=await tableCandidates(env,slot,cfg.table_mode,changes.table_id===undefined?null:(changes.table_id||null),id);
  if(existing.table_id && changes.table_id===undefined && tableIds.includes(existing.table_id))
    tableIds=[existing.table_id,...tableIds.filter(id=>id!==existing.table_id)];
  if(!tableIds.length) throw Error("Nessun tavolo adatto disponibile");
  const tableId=tableIds[0];
  const name=changes.name===undefined?existing.name:changes.name;
  const phone=changes.phone===undefined?existing.phone:changes.phone;
  const email=changes.email===undefined?existing.email:changes.email;
  const notes=changes.notes===undefined?existing.notes:changes.notes;
  const person=validatePerson(name,phone,email,notes);
  try {
    await env.DB.prepare("UPDATE booking_reservations SET name=?,phone=?,email=?,notes=?,date=?,start_min=?,end_min=?,guests=?,table_id=?,updated_at=datetime('now') WHERE id=? AND status IN('confirmed','arrived','seated')")
      .bind(person.name,person.phone,person.email,person.notes,slot.date,slot.start,slot.end,slot.guests,tableId,id).run();
  } catch { throw Error("Nuovo orario non più disponibile"); }
  return {ok:true,date,time:timeText(slot.start),guests};
}
export async function changeStatus(env,id,status) {
  if(!["confirmed","arrived","seated","completed","cancelled","no_show"].includes(status)) throw Error("Stato non valido");
  await ensureBookingSchema(env);
  const row=await env.DB.prepare("SELECT status FROM booking_reservations WHERE id=?").bind(id).first();
  if(!row) throw Error("Prenotazione non trovata");
  if(!ACTIVE.includes(row.status)) throw Error("Prenotazione già conclusa");
  if(status==="confirmed" && row.status!=="confirmed") throw Error("Ripristino non consentito");
  await env.DB.prepare("UPDATE booking_reservations SET status=?,updated_at=datetime('now') WHERE id=? AND status IN('confirmed','arrived','seated')").bind(status,id).run();
  return {ok:true,status};
}
export async function extendBooking(env,id,minutes) {
  await ensureBookingSchema(env);
  if(![15,30,45,60].includes(Number(minutes))) throw Error("Prolungamento non valido");
  const existing=await env.DB.prepare("SELECT * FROM booking_reservations WHERE id=?").bind(id).first();
  if(!existing || !ACTIVE.includes(existing.status)) throw Error("Prenotazione non più modificabile");
  const end=existing.end_min+Number(minutes);
  if(end>1440) throw Error("Orario oltre la mezzanotte non supportato");
  try {
    const result=await env.DB.prepare("UPDATE booking_reservations SET end_min=?,updated_at=datetime('now') WHERE id=? AND status IN('confirmed','arrived','seated')")
      .bind(end,id).run();
    if(!result.meta?.changes) throw Error("Modifica non applicata");
  } catch(e) {
    throw Error("Impossibile prolungare: verificare capienza e successive prenotazioni");
  }
  return {ok:true,end_min:end};
}

export function bookingError(e) {
  const message=String(e?.message||"");
  if(/booking_full|booking capacity|table_unavailable|Disponibilità|Posti|tavol|Impossibile prolungare/i.test(message)) return json({error:"Posti terminati: scegli un altro orario"},409);
  const safe=/^(Impostazione|Data|Orario|Numero|Inserisci|Email|Note|Locale|Prenotazioni|Stato|Prenotazione|Nuovo|Ripristino)/.test(message);
  if(safe) return json({error:message},400);
  console.error("Booking error",e?.name,message.slice(0,100));
  return json({error:"Operazione non riuscita. Riprova."},500);
}
