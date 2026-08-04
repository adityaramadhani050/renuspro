/**
 * Impor user.
 *
 * Ini langkah yang paling banyak menuntut keputusan manusia, karena dua hal:
 *
 * 1. Master_User TIDAK punya kolom email, sedangkan Supabase Auth memerlukan
 *    email sebagai identitas. Email diturunkan dari username + AUTH_EMAIL_DOMAIN,
 *    dan bisa ditimpa per user lewat berkas users.csv.
 *
 * 2. Password di sheet tersimpan PLAINTEXT (Auth.gs:60) dan TIDAK PERNAH
 *    diimpor. User dibuat tanpa password lalu diundang untuk membuat yang baru.
 *    Ini bukan pilihan gaya — memindahkan password plaintext ke sistem baru
 *    berarti mewariskan kerentanannya.
 */
import fs from 'node:fs';
import { parseText, parseNumber, parseBool } from './parse.js';
import { config } from './config.js';

// Sejalan dengan enum user_role di migrasi 11. Peran di luar daftar ini
// tetap dijadikan 'sales' — tapi dilaporkan, bukan diam-diam.
const VALID_ROLES = new Set([
  'admin',
  'owner',
  'finance',
  'sales',
  'leadsales',
  'warehouse',
  'procurement',
]);

/** Baca users.csv opsional: username,email */
export function readEmailOverrides(path) {
  if (!path || !fs.existsSync(path)) return new Map();

  const map = new Map();
  const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
  for (const [i, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed || (i === 0 && /username/i.test(trimmed))) continue;
    const [username, email] = trimmed.split(',').map((s) => s?.trim());
    if (username && email) map.set(username.toLowerCase(), email);
  }
  return map;
}

/**
 * Tulis template users.csv agar operator tinggal mengisi kolom email.
 *
 * Isinya juga dikembalikan, bukan hanya ditulis ke berkas: saat importer
 * dijalankan lewat GitHub Actions, berkas di runner ikut terbuang, sehingga
 * satu-satunya cara operator melihat daftarnya adalah lewat keluaran log.
 */
export function writeEmailTemplate(sheet, path) {
  const lines = ['username,email,# nama lengkap,# role'];
  for (const row of sheet.rows) {
    const username = parseText(row[2]);
    if (!username) continue;
    lines.push(`${username},,${parseText(row[1]) || ''},${parseText(row[4]) || 'sales'}`);
  }

  const content = lines.join('\n') + '\n';
  fs.writeFileSync(path, content, 'utf8');

  return { count: lines.length - 1, content };
}

function resolveEmail(username, overrides) {
  const fromFile = overrides.get(username.toLowerCase());
  if (fromFile) return fromFile;
  if (config.authEmailDomain) return `${username.toLowerCase()}@${config.authEmailDomain}`;
  return null;
}

/**
 * Buat (atau temukan) user di Supabase Auth lewat Admin API.
 * Mengembalikan uuid, atau null kalau tidak bisa.
 */
async function ensureAuthUser(email, fullName) {
  const base = config.supabaseUrl;
  const key = config.supabaseServiceKey;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };

  const created = await fetch(`${base}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      email_confirm: false,
      user_metadata: { full_name: fullName },
      // Sengaja tanpa password: user menetapkannya sendiri lewat undangan.
    }),
  });

  if (created.ok) {
    const body = await created.json();
    return body.id;
  }

  // Sudah ada — cari id-nya supaya impor tetap idempoten.
  if (created.status === 422 || created.status === 409) {
    const found = await fetch(
      `${base}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
      { headers }
    );
    if (found.ok) {
      const body = await found.json();
      const match = (body.users || []).find(
        (u) => u.email?.toLowerCase() === email.toLowerCase()
      );
      if (match) return match.id;
    }
  }

  const detail = await created.text().catch(() => '');
  throw new Error(`Gagal membuat auth user ${email}: HTTP ${created.status} ${detail}`);
}

/**
 * Impor Master_User → profiles.
 *
 * Mengembalikan peta nama lengkap (lowercase) → uuid, yang dipakai seluruh
 * langkah lain untuk menerjemahkan kolom "Dibuat Oleh".
 */
export async function importProfiles(client, sheet, options, report) {
  // Master_User: 0 ID | 1 Nama Lengkap | 2 Username | 3 Password | 4 Role | 5 Aktif | 6 Target
  const overrides = readEmailOverrides(options.usersCsv);
  const ownerByName = new Map();
  const roleTally = new Map();
  let count = 0;

  const canCreateAuth =
    options.createAuthUsers && config.supabaseUrl && config.supabaseServiceKey;

  for (const row of sheet.rows) {
    const legacyCode = parseText(row[0]);
    const fullName = parseText(row[1]);
    const username = parseText(row[2]);
    if (!username || !fullName) continue;

    let role = (parseText(row[4]) || 'sales').toLowerCase();
    roleTally.set(role, (roleTally.get(role) ?? 0) + 1);

    if (!VALID_ROLES.has(role)) {
      report.warn(
        'role_belum_dikenal',
        `User "${username}" punya role "${role}" yang belum ada di skema; ` +
          'sementara dijadikan sales'
      );
      role = 'sales';
    }

    // Sudah ada dari impor sebelumnya?
    const { rows: existing } = await client.query(
      'select id from profiles where lower(username) = lower($1)',
      [username]
    );

    let userId = existing[0]?.id || null;

    if (!userId) {
      const email = resolveEmail(username, overrides);
      if (!email) {
        report.warn(
          'email_kosong',
          `User "${username}" dilewati: tidak ada email. Set AUTH_EMAIL_DOMAIN ` +
            `atau isi users.csv (jalankan dengan --emit-user-template).`
        );
        continue;
      }

      if (!canCreateAuth) {
        report.warn(
          'auth_nonaktif',
          `User "${username}" (${email}) belum dibuat: jalankan dengan --create-auth-users ` +
            `dan set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.`
        );
        continue;
      }

      userId = await ensureAuthUser(email, fullName);
    }

    await client.query(
      `insert into profiles
         (id, legacy_code, full_name, username, role, is_active, monthly_target)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (id) do update
         set legacy_code = excluded.legacy_code, full_name = excluded.full_name,
             username = excluded.username, role = excluded.role,
             is_active = excluded.is_active, monthly_target = excluded.monthly_target`,
      [
        userId,
        legacyCode,
        fullName,
        username.toLowerCase(),
        role,
        parseBool(row[5]),
        parseNumber(row[6]),
      ]
    );

    ownerByName.set(fullName.trim().toLowerCase(), userId);
    count++;
  }

  // Daftar peran selalu dicetak, bukan hanya yang bermasalah. Keputusan
  // "peran apa saja yang perlu ada di sistem baru" tidak bisa diambil dari
  // lima contoh yang terpotong — ia butuh daftar yang utuh.
  report.roleTally = [...roleTally.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([role, n]) => ({ role, count: n, known: VALID_ROLES.has(role) }));

  report.add('profiles', count);
  return ownerByName;
}
