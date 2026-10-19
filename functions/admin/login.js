import { login, json, sessionCookie } from "../_lib/auth.js";
export async function onRequestPost({ env, request }) {
  const result = await login(env, request, "admin");
  return result instanceof Response
    ? result
    : json({ ok: true }, 200, {
        "Set-Cookie": sessionCookie("admin", result.token),
      });
}
