import { adminIdentity, session } from "./auth.js";
import { getDepartments } from "./warehouse.js";
export async function warehouseIdentity(env, request) {
  const user =
    (await adminIdentity(env, request)) ||
    (await session(env, request, "staff"));
  if (!user) return null;
  return { ...user, departments: await getDepartments(env, user) };
}
