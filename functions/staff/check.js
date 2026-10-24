import {
  session,
  json,
  sessionCookie,
  sessionToken,
} from "../_lib/auth.js";
import { ensureWarehouseSchema, getDepartments } from "../_lib/warehouse.js";

export async function onRequestGet({ env, request }) {
  const user = await session(env, request, "staff");
  if (!user) return json({ authenticated: false });

  await ensureWarehouseSchema(env);
  user.departments = await getDepartments(env, user);

  const token = sessionToken(request, "staff");
  return json(
    {
      authenticated: true,
      user,
      expires_at: user.expires_at,
    },
    200,
    token ? { "Set-Cookie": sessionCookie("staff", token) } : {},
  );
}
