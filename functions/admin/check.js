import { adminIdentity, json } from "../_lib/auth.js";
export async function onRequestGet({ env, request }) {
  return json({ authenticated: !!(await adminIdentity(env, request)) });
}
