import { staffAccess } from './warehouse.js';

export async function warehouseIdentity(env, request) {
  const secret = env.ADMIN_TOKEN_SECRET || 'default-dev-secret-change-in-prod';
  for (const [cookie, type] of [['nfarinati_admin_session', 'admin'], ['nfarinati_staff_session', 'staff']]) {
    const entry = (request.headers.get('Cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(cookie + '='));
    if (!entry) continue;
    let token;
    try { token = decodeURIComponent(entry.slice(cookie.length + 1)); } catch { continue; }
    const dot = token.lastIndexOf('.');
    if (dot < 0) continue;
    const payload = token.slice(0, dot);
    const parts = payload.split(':');
    if (parts[0] !== type) continue;
    const timestamp = Number(parts.at(-1));
    if (!Number.isFinite(timestamp) || timestamp > Date.now() || Date.now() - timestamp > 7 * 86400000) continue;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['verify']);
    const signature = token.slice(dot + 1);
    if (!/^[a-f0-9]{64}$/.test(signature)) continue;
    const bytes = Uint8Array.from(signature.match(/../g), h => parseInt(h,16));
    if (!(await crypto.subtle.verify('HMAC', key, bytes, encoder.encode(payload)))) continue;
    if (type === 'admin' && parts.length === 2) return {role:'admin'};
    if (type === 'staff' && parts.length === 4) {
      const access = await staffAccess(env, {id:Number(parts[1])});
      if (access) return access;
    }
  }
  return null;
}
