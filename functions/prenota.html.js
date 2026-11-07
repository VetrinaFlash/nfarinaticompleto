// Decommissioned booking page. This route intentionally stays gone and
// never creates bookings. Historical records are preserved in D1.
const retired=()=>new Response(
  "Il servizio di prenotazione tavoli online non è più disponibile. Contatta direttamente il locale.",
  {status:410,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store","X-Robots-Tag":"noindex"}}
);
export const onRequestGet=retired;
export const onRequestPost=retired;
