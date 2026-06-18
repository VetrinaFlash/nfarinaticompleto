const COOKIE_NAME = 'nfarinati_admin_session';

async function verifySession(request, secret) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return false;

  const token = decodeURIComponent(match[1]);
  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) return false;

  const payload = token.substring(0, lastDot);
  const sig = token.substring(lastDot + 1);

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const expectedSig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const expectedHex = [...new Uint8Array(expectedSig)].map(b => b.toString(16).padStart(2, '0')).join('');

  return expectedHex === sig;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
  const ok = await verifySession(request, secret);

  return new Response(JSON.stringify({ authenticated: ok }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
