import { login, json, sessionCookie } from "../_lib/auth.js";
import { ensureWarehouseSchema, getDepartments } from "../_lib/warehouse.js";
export async function onRequestPost({ env, request }) {
  await ensureWarehouseSchema(env);
  const result = await login(env, request, "staff");
  if (result instanceof Response) return result;
  await ensureWarehouseSchema(env);
  const user = result.user;
  user.departments = await getDepartments(env, user);
  return json({ ok: true, user }, 200, {
    "Set-Cookie": sessionCookie("staff", result.token),
  });
}
