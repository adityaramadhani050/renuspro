/* =============================================================================
 *  RenusPro — Pemulihan item hilang akibat duplikat-PK saat import awal
 *  Berlaku untuk tabel ber-kunci logis (no_wo, kode): qc_item & ded_item.
 *
 *  Latar: id di sheet lama TIDAK unik per (no_wo, kode) (satu id dipakai banyak
 *  `kode` di satu WO). Import awal (upsert onConflict=id) membuat baris ber-id
 *  sama saling menimpa → banyak (no_wo, kode) hilang. Aplikasi mengidentifikasi
 *  item berdasarkan (no_wo, kode), BUKAN id.
 *
 *  Skrip ini AMAN untuk sistem live:
 *    - HANYA menyisipkan (no_wo, kode) yang BELUM ADA di Supabase.
 *    - TIDAK meng-update / menimpa baris yang sudah ada (data live utuh).
 *    - TIDAK truncate.
 *
 *  Jalankan DARI dalam folder repo (mis. ~/renuspro):
 *    node migrasi/recover-qc-item.mjs <export.json> [--table=qc_item|ded_item] [--dry]
 *  Contoh:
 *    node migrasi/recover-qc-item.mjs ../renus-export-2.json --dry
 *    node migrasi/recover-qc-item.mjs ../renus-export-2.json --table=ded_item
 *  Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (service role — bypass RLS)
 * ========================================================================== */
import { readFileSync } from 'node:fs';
import { TABLES } from './mapping.mjs';

const args = process.argv.slice(2);
const jsonPath = args.find((a) => !a.startsWith('--'));
const DRY = args.includes('--dry');
const TABLE = (args.find((a) => a.startsWith('--table=')) || '--table=qc_item').replace('--table=', '').trim();

if (!jsonPath) { console.error('Usage: node migrasi/recover-qc-item.mjs <export.json> [--table=qc_item|ded_item] [--dry]'); process.exit(1); }
if (!['qc_item', 'ded_item'].includes(TABLE)) { console.error(`--table hanya boleh qc_item atau ded_item (kunci logis no_wo+kode). Diberi: '${TABLE}'`); process.exit(1); }

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DRY && (!SUPABASE_URL || !SERVICE_KEY)) { console.error('Set env SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY (atau --dry).'); process.exit(1); }

// ── Transform nilai (subset dari import-supabase.mjs; tipe yg dipakai qc/ded) ──
const s = (v) => (v == null ? '' : String(v)).trim();
const toText = (v) => { const x = s(v); return x === '' ? null : x; };
const toJson = (v) => { if (v == null || v === '') return null; if (typeof v === 'object') return v; try { return JSON.parse(String(v)); } catch { return null; } };
function toTs(v) {
  const x = s(v); if (!x) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(x)) return x;
  let m = x.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,]*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0)).toISOString();
  m = x.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]).toISOString();
  const d = new Date(x); return isNaN(d) ? null : d.toISOString();
}
const CONV = { t: toText, j: toJson, ts: toTs };

const def = TABLES.find((t) => t.table === TABLE);
if (!def) { console.error(`Definisi ${TABLE} tidak ditemukan di mapping.mjs`); process.exit(1); }

const raw = JSON.parse(readFileSync(jsonPath, 'utf8'));
const grid = raw[def.sheet];
if (!grid) { console.error(`Sheet '${def.sheet}' tidak ada di export.`); process.exit(1); }

// Transform + bangun id unik per (no_wo, kode) via def.post; dedupe (ambil terakhir).
const byKey = new Map();
for (const r of grid.slice(1)) {
  if (!r || r.every((c) => s(c) === '')) continue;
  const o = {};
  for (let i = 0; i < def.cols.length; i++) { const [name, type] = def.cols[i]; if (type === 'x') continue; o[name] = (CONV[type] || toText)(r[i]); }
  if (def.post) def.post(o);
  if (!o.no_wo || !o.kode) continue;
  byKey.set(o.no_wo + '||' + o.kode, o);
}
const fromSheet = [...byKey.values()];
console.log(`[${TABLE}] Export ${def.sheet}: ${fromSheet.length} item unik (no_wo, kode).`);

if (DRY) {
  console.log('(DRY) contoh:', JSON.stringify(fromSheet[0] || {}).slice(0, 160));
  console.log('Jalankan tanpa --dry (dengan env Supabase) untuk melihat & menyisipkan yang hilang.');
  process.exit(0);
}

const { createClient } = await import('@supabase/supabase-js');
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Ambil semua (no_wo, kode) yang SUDAH ADA di Supabase (paginasi).
const existing = new Set();
let from = 0;
for (;;) {
  const { data, error } = await sb.from(TABLE).select('no_wo,kode').range(from, from + 999);
  if (error) { console.error(`Gagal baca ${TABLE}:`, error.message); process.exit(1); }
  (data || []).forEach((x) => { if (x.no_wo && x.kode) existing.add(x.no_wo + '||' + x.kode); });
  if (!data || data.length < 1000) break;
  from += 1000;
}
console.log(`[${TABLE}] Supabase: ${existing.size} item (no_wo, kode) sudah ada.`);

const missing = fromSheet.filter((o) => !existing.has(o.no_wo + '||' + o.kode));
console.log(`[${TABLE}] HILANG (akan disisipkan): ${missing.length} item.`);

// Ringkasan per-WO (10 WO dgn item hilang terbanyak).
if (missing.length) {
  const perWO = {};
  missing.forEach((o) => { perWO[o.no_wo] = (perWO[o.no_wo] || 0) + 1; });
  const top = Object.entries(perWO).sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log('  WO dgn item hilang terbanyak:');
  top.forEach(([wo, n]) => console.log(`   • ${wo}: ${n} item`));
  if (Object.keys(perWO).length > 10) console.log(`   • …dan ${Object.keys(perWO).length - 10} WO lain.`);
}

if (!missing.length) { console.log('Tidak ada yang perlu dipulihkan. Selesai.'); process.exit(0); }

let ok = 0, err = 0;
for (let i = 0; i < missing.length; i += 500) {
  const batch = missing.slice(i, i + 500);
  const { error } = await sb.from(TABLE).insert(batch);
  if (error) { err += batch.length; console.error(`  ✗ batch@${i}: ${error.message}`); }
  else ok += batch.length;
}
console.log(`\nSelesai. Disisipkan ${ok} item ke ${TABLE}${err ? `, ${err} gagal` : ''}. Data live yang ada TIDAK diubah.`);
