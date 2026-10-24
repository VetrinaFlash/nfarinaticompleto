import {
  adminIdentity,
  json,
  sessionCookie,
  sessionToken,
} from "../_lib/auth.js";

export async function onRequestGet({ env, request }) {
  const identity = await adminIdentity(env, request);
  if (!identity) return json({ authenticated: false });

  const token = sessionToken(request, identity.kind);
  return json(
    {
      authenticated: true,
      expires_at: identity.expires_at,
    },
    200,
    token ? { "Set-Cookie": sessionCookie(identity.kind, token) } : {},
  );
}
