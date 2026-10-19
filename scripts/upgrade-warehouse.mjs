#!/usr/bin/env node
// Optional explicit activation after deployment. Normally the first warehouse
// catalog/login request applies the upgrade automatically.
const base = new URL(process.argv[2] || 'https://nfarinatimodernpizza.it');
if (base.protocol !== 'https:' && base.hostname !== 'localhost') throw new Error('Usare HTTPS');
const username = process.env.NFARINATI_ADMIN_USERNAME;
const password = process.env.NFARINATI_ADMIN_PASSWORD;
if (!username || !password) {
  console.error('Impostare NFARINATI_ADMIN_USERNAME e NFARINATI_ADMIN_PASSWORD, poi eseguire: node scripts/upgrade-warehouse.mjs [URL sito]');
  process.exit(1);
}
const login = await fetch(new URL('/admin/login',base),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password}),redirect:'error'});
const auth = await login.json();
if (!login.ok || !auth.ok) throw new Error(auth.error || 'Accesso admin fallito');
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('Sessione admin assente');
const response = await fetch(new URL('/admin/upgrade-warehouse',base),{method:'POST',headers:{Cookie:cookie},redirect:'error'});
const result = await response.json();
if (!response.ok || !result.ok) throw new Error(result.error || 'Aggiornamento fallito');
console.log(`Database aggiornato: ${result.migration}`);
