/* Optional Cloudflare Cron Worker: retry queued Web Push events every two minutes. */
import {runPendingPush} from "../functions/_lib/push.js";
export default {
  async scheduled(_event,env,ctx){
    const origins=String(env.PUSH_ORIGINS||"https://nfarinatimodernpizza.it")
      .split(",").map(s=>s.trim()).filter(s=>/^https:\/\/[a-z0-9.-]+(?::443)?$/i.test(s));
    for(const origin of origins){
      ctx.waitUntil(runPendingPush(env,origin,{limit:20}).catch(e=>{
        console.error("Push cron retry failed",e?.name);
      }));
    }
  }
};
