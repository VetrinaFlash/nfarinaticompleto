import { session, json } from "../_lib/auth.js";
import { ensureWarehouseSchema, getDepartments } from "../_lib/warehouse.js";
export async function onRequestGet({ env, request }) {
  const user = await session(env, request, "staff");
  if (!user) return json({ authenticated: false });
  await ensureWarehouseSchema(env);
  user.departments = await getDepartments(env, user);
  return json({ authenticated: true, user });
}
