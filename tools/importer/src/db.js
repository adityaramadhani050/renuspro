/** Lapisan database untuk importer. */
import pg from 'pg';
import { config } from './config.js';

// Sheets menyimpan uang sebagai angka biasa; node-pg mengembalikan numeric
// sebagai string demi presisi. Untuk rekonsiliasi kita perlu angka.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));

/**
 * Periksa DATABASE_URL sebelum dipakai.
 *
 * Tanpa ini, connection string yang salah bentuk hanya menghasilkan pesan
 * "Invalid URL" dari Node — yang tidak menyebut variabel mana yang salah,
 * apalagi salahnya di mana. Padahal penyebabnya hampir selalu satu dari tiga
 * hal yang sangat spesifik, dan semuanya bisa dikenali dari string-nya.
 */
export function assertValidPostgresUrl(raw) {
  const url = (raw || '').trim();

  if (!url) {
    throw new Error('DATABASE_URL kosong. Isi dengan connection string Postgres dari Supabase.');
  }

  // Penyebab paling sering: placeholder dari dashboard Supabase belum diganti.
  // Tanda kurung siku itu sendiri yang membuat URL tidak bisa diurai.
  if (/\[.*\]/.test(url)) {
    throw new Error(
      'DATABASE_URL masih memuat placeholder dalam kurung siku (mis. [YOUR-PASSWORD]). ' +
        'Ganti bagian itu dengan password database Anda yang sebenarnya.'
    );
  }

  if (url.startsWith('psql ')) {
    throw new Error(
      'DATABASE_URL berisi perintah psql, bukan URL-nya saja. ' +
        'Salin hanya bagian yang diawali postgresql://'
    );
  }

  if (!/^postgres(ql)?:\/\//.test(url)) {
    throw new Error(
      'DATABASE_URL harus diawali postgresql:// — periksa apakah yang tersalin sudah benar.'
    );
  }

  try {
    new URL(url);
  } catch {
    // Sampai di sini bentuk umumnya sudah benar, jadi yang tersisa hampir pasti
    // karakter pada password yang mengubah arti URL.
    //
    // Ketiga karakter di bawah dipilih dari perilaku parser yang sebenarnya,
    // bukan dari daftar umum "karakter khusus": '#' memulai fragment, '/'
    // memulai path, '?' memulai query — ketiganya membuat URL tidak bisa
    // diurai. Sebaliknya '@' dan spasi justru ditangani parser dengan benar,
    // jadi menyebutnya di sini hanya akan menyesatkan.
    throw new Error(
      'DATABASE_URL tidak bisa diurai. Penyebab tersering: password memuat ' +
        'karakter #, /, atau ? — ketiganya punya arti khusus di dalam URL. ' +
        'Cara tercepat: reset password database di Supabase (Settings → Database) ' +
        'dengan kombinasi huruf dan angka saja, lalu perbarui secret DATABASE_URL ' +
        'dan SUPABASE_DB_PASSWORD. Alternatifnya, percent-encode karakter tersebut ' +
        '(# menjadi %23, / menjadi %2F, ? menjadi %3F).'
    );
  }

  return url;
}

export async function connect() {
  const url = assertValidPostgresUrl(config.databaseUrl());
  const client = new pg.Client({ connectionString: url });

  try {
    await client.connect();
  } catch (err) {
    throw explainConnectionError(err, url);
  }

  return client;
}

/**
 * Terjemahkan kegagalan koneksi menjadi arahan yang bisa ditindaklanjuti.
 *
 * Pesan asli Postgres benar tapi tidak menuntun: "password authentication
 * failed for user X" tidak memberi tahu bahwa untuk Session pooler, X memang
 * HARUS berbentuk postgres.<project-ref> — dan bahwa memakai 'postgres' saja
 * pasti gagal berapa kali pun passwordnya diperbaiki.
 */
export function explainConnectionError(err, url) {
  const { username, hostname } = new URL(url);
  const isPooler = hostname.includes('pooler.supabase.com');
  const hasTenant = username.includes('.');

  if (err.code === '28P01') {
    // Penyebab paling sering, dan paling membingungkan karena gejalanya
    // terlihat seperti password salah.
    if (isPooler && !hasTenant) {
      return new Error(
        `Autentikasi ditolak untuk user "${username}".\n\n` +
          'Anda memakai Session pooler, tetapi usernya masih "postgres" saja. ' +
          'Pooler memerlukan username berbentuk postgres.<project-ref> — tanpa itu ' +
          'ia tidak tahu proyek mana yang dituju, dan menolak berapa kali pun ' +
          'password diperbaiki.\n\n' +
          'Salin ulang connection string dari tombol Connect → Session pooler, ' +
          'jangan dari Direct connection.'
      );
    }

    return new Error(
      `Autentikasi ditolak untuk user "${username}".\n\n` +
        'Password pada DATABASE_URL tidak cocok. Yang paling sering terlewat: ' +
        'password sudah di-reset di Supabase, tetapi DATABASE_URL belum ikut ' +
        'diperbarui — keduanya harus diganti bersamaan dengan SUPABASE_DB_PASSWORD.\n\n' +
        'Bila password memuat karakter %, ia harus ditulis %25 di dalam URL.'
    );
  }

  if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
    return new Error(`Host "${hostname}" tidak dapat ditemukan. Periksa kembali DATABASE_URL.`);
  }

  if (err.code === 'ENETUNREACH' || err.code === 'ETIMEDOUT') {
    return new Error(
      `Tidak bisa menjangkau "${hostname}".\n\n` +
        (isPooler
          ? 'Periksa apakah proyek Supabase sedang aktif (proyek gratis dijeda bila lama tidak dipakai).'
          : 'Anda memakai Direct connection yang hanya melayani IPv6, sedangkan ' +
            'runner GitHub Actions hanya punya IPv4. Ganti ke Session pooler.')
    );
  }

  return err;
}

/**
 * Trigger yang HARUS dimatikan selama impor.
 *
 * Tanpa ini, mengimpor penawaran berstatus Deal akan memicu penerbitan Work
 * Order dengan nomor BARU — bukan nomor historis dari sheet. Begitu pula
 * meng-upsert ulang invoice yang sudah lunas akan menimpa tanggal bayarnya
 * dengan tanggal hari ini. Keduanya merusak data secara diam-diam.
 *
 * sync_current_revision sengaja DIBIARKAN aktif karena memang itu yang kita
 * inginkan: pointer revisi terkini terisi otomatis.
 */
const TRIGGERS_TO_DISABLE = [
  ['quotations', 'quotations_handle_status_change'],
  ['quotations', 'quotations_handle_insert_deal'],
  ['invoices', 'invoices_handle_payment_status'],
  ['profiles', 'profiles_guard_privilege_columns'],
];

export async function withImportTriggersDisabled(client, fn) {
  for (const [table, trigger] of TRIGGERS_TO_DISABLE) {
    await client.query(`alter table ${table} disable trigger ${trigger}`);
  }
  try {
    return await fn();
  } finally {
    for (const [table, trigger] of TRIGGERS_TO_DISABLE) {
      await client.query(`alter table ${table} enable trigger ${trigger}`);
    }
  }
}

/** Peta legacy_code → id untuk satu tabel. */
export async function loadLegacyMap(client, table) {
  const { rows } = await client.query(
    `select legacy_code, id from ${table} where legacy_code is not null`
  );
  return new Map(rows.map((r) => [r.legacy_code, r.id]));
}

/**
 * Semai document_counters dari nomor tertinggi yang sudah ada, supaya
 * dokumen baru tidak menabrak nomor historis.
 */
export async function seedCounters(client, counters) {
  for (const { docType, period, lastSeq } of counters) {
    await client.query(
      `insert into document_counters (doc_type, period, last_seq)
       values ($1, $2, $3)
       on conflict (doc_type, period)
         do update set last_seq = greatest(document_counters.last_seq, excluded.last_seq)`,
      [docType, period, lastSeq]
    );
  }
}
