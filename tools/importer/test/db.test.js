/**
 * Tes validasi DATABASE_URL.
 *
 * Pesan error di sinilah yang menentukan berapa lama seseorang tersangkut.
 * "Invalid URL" dari Node tidak menyebut variabel mana yang salah, apalagi
 * salahnya di mana — padahal penyebabnya hampir selalu satu dari tiga hal
 * yang bisa dikenali langsung dari string-nya.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertValidPostgresUrl } from '../src/db.js';

const VALID =
  'postgresql://postgres.abcdefghijklmnop:rahasia123@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';

test('menerima connection string Supabase yang benar', () => {
  assert.equal(assertValidPostgresUrl(VALID), VALID);
  assert.equal(assertValidPostgresUrl(`  ${VALID}  `), VALID, 'spasi di ujung dirapikan');
  assert.equal(
    assertValidPostgresUrl('postgres://user:pass@host:5432/db'),
    'postgres://user:pass@host:5432/db',
    'skema postgres:// juga diterima'
  );
});

test('menyebut placeholder yang belum diganti', () => {
  const url =
    'postgresql://postgres.abc:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';
  assert.throws(() => assertValidPostgresUrl(url), /placeholder/i);
});

test('mengenali perintah psql yang ikut tersalin', () => {
  assert.throws(
    () => assertValidPostgresUrl(`psql ${VALID}`),
    /perintah psql/i
  );
});

test('menolak string yang bukan URL Postgres', () => {
  assert.throws(() => assertValidPostgresUrl('db.abc.supabase.co'), /postgresql:\/\//);
  assert.throws(() => assertValidPostgresUrl('mysql://user:pass@host/db'), /postgresql:\/\//);
});

test('menyebut DATABASE_URL saat kosong', () => {
  assert.throws(() => assertValidPostgresUrl(''), /DATABASE_URL kosong/);
  assert.throws(() => assertValidPostgresUrl(undefined), /DATABASE_URL kosong/);
});

test('mengarahkan ke karakter yang benar-benar merusak URL', () => {
  // Ketiganya diverifikasi terhadap parser Node, bukan diasumsikan:
  // '#' memulai fragment, '/' memulai path, '?' memulai query.
  for (const ch of ['#', '/', '?']) {
    assert.throws(
      () => assertValidPostgresUrl(`postgresql://postgres.abc:pa${ch}ss@host:5432/postgres`),
      /karakter #, \/, atau \?/,
      `password dengan '${ch}' seharusnya ditolak dengan pesan yang menuntun`
    );
  }
});

test("'@' dan spasi pada password TIDAK ditolak", () => {
  // Parser URL menangani keduanya dengan benar (di-encode otomatis).
  // Menolaknya di sini akan menyesatkan — orang mengira passwordnya salah
  // padahal masalahnya di tempat lain.
  assert.doesNotThrow(() =>
    assertValidPostgresUrl('postgresql://postgres.abc:pa@ss@host:5432/postgres')
  );
  assert.doesNotThrow(() =>
    assertValidPostgresUrl('postgresql://postgres.abc:pa ss@host:5432/postgres')
  );
});

test('password yang sudah di-encode tetap diterima', () => {
  const encoded = 'postgresql://postgres.abc:pa%23ss@host:5432/postgres';
  assert.equal(assertValidPostgresUrl(encoded), encoded);
});

// ── Penjelasan kegagalan koneksi ────────────────────────────────────────────

import { explainConnectionError } from '../src/db.js';

const POOLER = 'postgresql://postgres:pw@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';
const POOLER_OK = 'postgresql://postgres.abcdef:pw@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';
const DIRECT = 'postgresql://postgres:pw@db.abcdef.supabase.co:5432/postgres';

test('auth gagal pada pooler tanpa project-ref menunjuk ke username, bukan password', () => {
  const e = explainConnectionError({ code: '28P01' }, POOLER);
  assert.match(e.message, /postgres\.<project-ref>/);
  assert.match(e.message, /Session pooler/);
});

test('auth gagal dengan username benar menunjuk ke password', () => {
  const e = explainConnectionError({ code: '28P01' }, POOLER_OK);
  assert.match(e.message, /Password pada DATABASE_URL/);
  assert.doesNotMatch(e.message, /project-ref/, 'jangan menyalahkan username yang sudah benar');
});

test('jaringan tak terjangkau pada Direct connection menyebut IPv6', () => {
  const e = explainConnectionError({ code: 'ENETUNREACH' }, DIRECT);
  assert.match(e.message, /IPv6/);
  assert.match(e.message, /Session pooler/);
});

test('jaringan tak terjangkau pada pooler menyarankan cek proyek dijeda', () => {
  const e = explainConnectionError({ code: 'ETIMEDOUT' }, POOLER_OK);
  assert.match(e.message, /dijeda/);
  assert.doesNotMatch(e.message, /IPv6/, 'pooler melayani IPv4, jadi IPv6 bukan penyebabnya');
});

test('error yang tidak dikenali diteruskan apa adanya', () => {
  const original = { code: 'SOMETHING_ELSE', message: 'boom' };
  assert.equal(explainConnectionError(original, POOLER_OK), original);
});
