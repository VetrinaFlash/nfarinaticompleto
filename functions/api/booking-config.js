import {json} from "../_lib/auth.js";
import {bookingConfig,bookingError} from "../_lib/booking.js";
export async function onRequestGet({env}) {
  try {
    const c=await bookingConfig(env);
    return json({enabled:!!c.enabled,max_party:c.max_party,advance_days:c.advance_days,
      duration_min:c.duration_min,buffer_min:c.buffer_min,interval_min:c.interval_min,
      turnstile_site_key:env.TURNSTILE_SITE_KEY||null});
  } catch(e) {return bookingError(e);}
}
