// Verifica sessione staff — restituisce anche i dati utente per la UI
const COOKIE_NAME = 'nfarinati_staff_session';

async function verifyStaffSession(request, secret) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;

  const token = decodeURIComponent(match[1]);
  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) return null;

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
  if (expectedHex !== sig) return null;

  const parts = payload.split(':'); // staff:<id>:<role>:<ts>
  if (parts[0] !== 'staff' || parts.length !== 4) return null;
  return { id: parseInt(parts[1]), role: parts[2] };
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
  const headers = { 'Content-Type': 'application/json' };

  const session = await verifyStaffSession(request, secret);
  if (!session) {
    return new Response(JSON.stringify({ authenticated: false }), { status: 200, headers });
  }

  try {
    const user = await env.DB.prepare(
      'SELECT id, username, display_name, role FROM staff_users WHERE id = ? AND active = 1'
    ).bind(session.id).first();

    if (!user) {
      return new Response(JSON.stringify({ authenticated: false }), { status: 200, headers });
    }
    return new Response(JSON.stringify({ authenticated: true, user }), { status: 200, headers });
  } catch (err) {
    return new Response(JSON.stringify({ authenticated: false, error: err.message }), { status: 200, headers });
  }
}
