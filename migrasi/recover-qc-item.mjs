/* =============================================================================
 *  RenusPro — Pemulihan qc_item yang HILANG akibat duplikat-PK saat import awal
 *
 *  Latar: id di sheet lama TIDAK unik per item (satu id dipakai banyak `kode`
 *  di satu WO). Saat import awal (upsert onConflict=id) baris ber-id sama
 *  saling menimpa → banyak (no_wo, kode) hilang. Perbaikannya membangun id
 *  unik per (no_wo, kode), tapi tabel qc_item di Supabase sudah TERLANJUR ramai
 *  data live (QC yang dikerjakan setelah go-live). Aplikasi mengidentifikasi
 *  item QC berdasarkan (no_wo, kode) — BUKAN id.
 *
 *  Skrip ini AMAN untuk sistem live:
 *    - HANYA menyisipkan (no_wo, kode) yang BELUM ADA di Supabase.
 *    - TIDAK meng-update / menimpa baris yang sudah ada (data live utuh).
 *    - TIDAK truncate.
 *
 *  Jalankan:
 *    node migrasi/recover-qc-item.mjs path/ke/renus-export-YYYYMMDD.json --dry
 *    node migrasi/recover-qc-item.mjs path/ke/renus-export-YYYYMMDD.json
 *  Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (service role — bypass RLS)
 * ========================================================================== */
import { readFileSync } from 'node:fs';
import { TABLES } from './mapping.mjs';

const args = process.argv.slice(2);
const jsonPath = args.find((a) => !a.startsWith('--'));
const DRY = args.includes('--dry');
if (!jsonPath) { console.error('Usage: node migrasi/recover-qc-item.mjs <export.json> [--dry]'); process.exit(1); }

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DRY && (!SUPABASE_URL || !SERVICE_KEY)) { console.error('Set env SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY (atau --dry).'); process.exit(1); }

// ── Transform nilai (subset dari import-supabase.mjs, tipe yg dipakai qc_item) ─
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

const def = TABLES.find((t) => t.table === 'qc_item');
if (!def) { console.error('Definisi qc_item tidak ditemukan di mapping.mjs'); process.exit(1); }

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
  if (!o.no_wo || !o.kode) continue;                 // butuh (no_wo, kode)
  byKey.set(o.no_wo + '||' + o.kode, o);
}
const fromSheet = [...byKey.values()];
console.log(`Export QC_Item : ${fromSheet.length} item unik (no_wo, kode).`);

if (DRY) {
  console.log('(DRY) contoh:', JSON.stringify(fromSheet[0]).slice(0, 160));
  console.log('Jalankan tanpa --dry (dengan env Supabase) untuk melihat berapa yang hilang & menyisipkannya.');
  process.exit(0);
}

const { createClient } = await import('@supabase/supabase-js');
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Ambil semua (no_wo, kode) yang SUDAH ADA di Supabase (paginasi).
const existing = new Set();
let from = 0;
for (;;) {
  const { data, error } = await sb.from('qc_item').select('no_wo,kode').range(from, from + 999);
  if (error) { console.error('Gagal baca qc_item:', error.message); process.exit(1); }
  (data || []).forEach((x) => { if (x.no_wo && x.kode) existing.add(x.no_wo + '||' + x.kode); });
  if (!data || data.length < 1000) break;
  from += 1000;
}
console.log(`Supabase qc_item: ${existing.size} item (no_wo, kode) sudah ada.`);

const missing = fromSheet.filter((o) => !existing.has(o.no_wo + '||' + o.kode));
console.log(`HILANG (akan disisipkan): ${missing.length} item.`);
if (!missing.length) { console.log('Tidak ada yang perlu dipulihkan. Selesai.'); process.exit(0); }

let ok = 0, err = 0;
for (let i = 0; i < missing.length; i += 500) {
  const batch = missing.slice(i, i + 500);
  const { error } = await sb.from('qc_item').insert(batch);
  if (error) { err += batch.length; console.error(`  ✗ batch@${i}: ${error.message}`); }
  else ok += batch.length;
}
console.log(`\nSelesai. Disisipkan ${ok} item${err ? `, ${err} gagal` : ''}. Data QC live yang ada TIDAK diubah.`);
