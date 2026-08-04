/* =============================================================================
 *  RenusPro — Provisioning Supabase Auth dari tabel app_user
 *  Membuat akun login (Supabase Auth) untuk tiap user di app_user, lalu mengisi
 *  app_user.auth_uid supaya RLS (current_app_role) berfungsi.
 *
 *  Prasyarat:
 *    - Tabel app_user SUDAH terisi (import data selesai).
 *    - npm i @supabase/supabase-js
 *    - Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (service_role)
 *    - (opsional) DEFAULT_PASSWORD  → password sama untuk semua user
 *    - (opsional) EMAIL_DOMAIN      → domain email sintetis bila user tak ber-email
 *                                      (default: renus.local)
 *
 *  Jalankan:
 *    node provision-auth.mjs --dry            (lihat rencana, tanpa membuat akun)
 *    node provision-auth.mjs --limit=2        (uji 2 user dulu)
 *    node provision-auth.mjs                   (semua user yang belum punya auth_uid)
 *
 *  Output: provisioned-users.csv  (id, nama, email login, password, role, status)
 * ========================================================================== */
import { writeFileSync } from 'node:fs';

const args  = process.argv.slice(2);
const DRY   = args.includes('--dry');
const limit = parseInt((args.find(a => a.startsWith('--limit=')) || '').split('=')[1] || '0', 10);

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || '';
const EMAIL_DOMAIN     = process.env.EMAIL_DOMAIN || 'renus.local';

if (!URL || !KEY) {
  console.error('❌ Set dulu SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const { createClient } = await import('@supabase/supabase-js');
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const emailFor = (u) =>
  (u.email && String(u.email).includes('@'))
    ? String(u.email).trim().toLowerCase()
    : `${String(u.username || u.id).toLowerCase().replace(/[^a-z0-9._-]/g, '')}@${EMAIL_DOMAIN}`;

const genPass = () => 'R' + Math.random().toString(36).slice(2, 8) + '#' + (10 + Math.floor(Math.random() * 89));

async function findAuthByEmail(email) {
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data || !data.users.length) break;
    const hit = data.users.find(u => (u.email || '').toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

// ── Ambil user yang belum punya auth_uid ────────────────────────────────────
const { data: users, error } = await sb
  .from('app_user')
  .select('id,nama,username,email,role,aktif,auth_uid')
  .order('id');
if (error) { console.error('❌ Gagal baca app_user:', error.message); process.exit(1); }

let targets = (users || []).filter(u => !u.auth_uid);
if (limit > 0) targets = targets.slice(0, limit);

console.log(`Total user: ${users.length} · belum ber-Auth: ${(users||[]).filter(u=>!u.auth_uid).length} · diproses: ${targets.length}${DRY ? ' (DRY-RUN)' : ''}`);

const csv = [['id', 'nama', 'email_login', 'password', 'role', 'status']];
let created = 0, linked = 0, failed = 0;

for (const u of targets) {
  const email = emailFor(u);
  const password = DEFAULT_PASSWORD || genPass();

  if (DRY) { csv.push([u.id, u.nama, email, '(dry)', u.role, 'DRY']); continue; }

  const { data, error: cErr } = await sb.auth.admin.createUser({
    email, password, email_confirm: true,
    app_metadata: { role: u.role },
    user_metadata: { nama: u.nama, app_user_id: u.id }
  });

  let authId = null, status = '', pwdShown = password;
  if (cErr) {
    const ex = await findAuthByEmail(email);   // mungkin sudah ada → tautkan
    if (ex) { authId = ex.id; status = 'ditautkan (sudah ada)'; pwdShown = '(pakai password lama / reset)'; linked++; }
    else { failed++; console.error('  ✗', u.id, email, '→', cErr.message); csv.push([u.id, u.nama, email, '', u.role, 'GAGAL: ' + cErr.message]); continue; }
  } else { authId = data.user.id; status = 'dibuat'; created++; }

  const { error: upErr } = await sb.from('app_user').update({ auth_uid: authId }).eq('id', u.id);
  if (upErr) status += ' · auth_uid GAGAL disimpan: ' + upErr.message;

  console.log(`  ✓ ${status} · ${u.id} · ${email}`);
  csv.push([u.id, u.nama, email, pwdShown, u.role, status]);
}

const outCsv = csv.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
writeFileSync('provisioned-users.csv', outCsv);

console.log(`\nSelesai. dibuat=${created} ditautkan=${linked} gagal=${failed}`);
console.log('📄 Daftar akun + password ada di: provisioned-users.csv');
if (!DEFAULT_PASSWORD && created > 0) console.log('   (password acak per user — bagikan ke masing-masing, minta ganti setelah login)');
