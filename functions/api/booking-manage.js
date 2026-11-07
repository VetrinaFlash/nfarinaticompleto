import {json} from "../_lib/auth.js";

// Historical booking records remain in D1 and are NOT deleted.
// Disable both reads and mutations so stale clients cannot create
// or change table reservations after removal of the booking service.
const retired=()=>json({
  error:"Il servizio di prenotazione tavoli online non è più attivo. Contatta direttamente il locale.",
  code:"TABLE_BOOKING_RETIRED"
},410,{"Cache-Control":"no-store"});
export const onRequestGet=retired;
export const onRequestPost=retired;
export const onRequestPut=retired;
export const onRequestDelete=retired;
