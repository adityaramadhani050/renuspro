/* =============================================================================
 *  RenusPro — Bandingkan STATUS qc_item/ded_item: export sheet vs Supabase live
 *
 *  Karena jumlah baris tidak hilang (recover-qc-item.mjs = 0), selisih angka
 *  dashboard (Approved/Pending/Rejected) berarti soal STATUS, bukan baris.
 *  Skrip ini membandingkan status per (no_wo, kode) antara export & Supabase,
 *  supaya jelas apakah:
 *    (a) status hilang/berubah saat migrasi (bisa diperbaiki dari export), atau
 *    (b) export JSON memang snapshot beda waktu (angka sheet lebih baru).
 *
 *  HANYA MEMBACA — tidak menulis apa pun.
 *
 *  Jalankan DARI folder repo:
 *    node migrasi/diagnose-qc-status.mjs <export.json> [--table=qc_item|ded_item]
 *  Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * ========================================================================== */
import { readFileSync } from 'node:fs';
import { TABLES } from './mapping.mjs';

const args = process.argv.slice(2);
const jsonPath = args.find((a) => !a.startsWith('--'));
const TABLE = (args.find((a) => a.startsWith('--table=')) || '--table=qc_item').replace('--table=', '').trim();
if (!jsonPath) { console.error('Usage: node migrasi/diagnose-qc-status.mjs <export.json> [--table=qc_item|ded_item]'); process.exit(1); }
if (!['qc_item', 'ded_item'].includes(TABLE)) { console.error('--table hanya qc_item / ded_item'); process.exit(1); }

const SUPABASE_URL = process.env.SUPABASE_URL, SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Set env SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }

const s = (v) => (v == null ? '' : String(v)).trim();
const norm = (v) => { const x = s(v); return x === '' ? '(kosong)' : x; };

const def = TABLES.find((t) => t.table === TABLE);
const iNoWo = def.cols.findIndex((c) => c[0] === 'no_wo');
const iKode = def.cols.findIndex((c) => c[0] === 'kode');
const iStatus = def.cols.findIndex((c) => c[0] === 'status');

const raw = JSON.parse(readFileSync(jsonPath, 'utf8'));
const grid = raw[def.sheet];
if (!grid) { console.error(`Sheet '${def.sheet}' tidak ada.`); process.exit(1); }

// Export: (no_wo||kode) -> status
const exp = new Map();
for (const r of grid.slice(1)) {
  if (!r || r.every((c) => s(c) === '')) continue;
  const no = s(r[iNoWo]), kode = s(r[iKode]); if (!no || !kode) continue;
  exp.set(no + '||' + kode, norm(r[iStatus]));
}

const { createClient } = await import('@supabase/supabase-js');
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const sup = new Map();
let from = 0;
for (;;) {
  const { data, error } = await sb.from(TABLE).select('no_wo,kode,status').range(from, from + 999);
  if (error) { console.error('Gagal baca:', error.message); process.exit(1); }
  (data || []).forEach((x) => { if (x.no_wo && x.kode) sup.set(x.no_wo + '||' + x.kode, norm(x.status)); });
  if (!data || data.length < 1000) break;
  from += 1000;
}

function dist(map) { const d = {}; for (const v of map.values()) d[v] = (d[v] || 0) + 1; return d; }
function printDist(title, d, total) {
  console.log(`\n${title} (total ${total}):`);
  Object.entries(d).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`   ${k.padEnd(16)} ${n}`));
}
printDist(`Distribusi status — EXPORT ${def.sheet}`, dist(exp), exp.size);
printDist(`Distribusi status — SUPABASE ${TABLE}`, dist(sup), sup.size);

// Transisi status untuk (no_wo,kode) yg ada di KEDUANYA.
let both = 0, sama = 0;
const turun = {};        // export approved/rejected/pending → supabase beda
let approvedHilang = 0;  // export Approved, supabase bukan Approved
for (const [k, ev] of exp) {
  if (!sup.has(k)) continue;
  both++; const sv = sup.get(k);
  if (ev === sv) { sama++; continue; }
  const key = ev + '  →  ' + sv; turun[key] = (turun[key] || 0) + 1;
  if (ev === 'Approved' && sv !== 'Approved') approvedHilang++;
}
console.log(`\nCocok di kedua sisi: ${both} item · status sama: ${sama} · status BEDA: ${both - sama}`);
if (approvedHilang) console.log(`⚠ Export 'Approved' tapi Supabase BUKAN 'Approved': ${approvedHilang} item`);
const trans = Object.entries(turun).sort((a, b) => b[1] - a[1]);
if (trans.length) { console.log('\nPerubahan status (export → supabase) terbanyak:'); trans.slice(0, 15).forEach(([k, n]) => console.log(`   ${k.padEnd(34)} ${n}`)); }

const onlyExp = [...exp.keys()].filter((k) => !sup.has(k)).length;
const onlySup = [...sup.keys()].filter((k) => !exp.has(k)).length;
console.log(`\nHanya di export: ${onlyExp} · hanya di Supabase: ${onlySup}`);

console.log('\nInterpretasi:');
console.log(" • Jika 'Approved hilang' besar → status TIDAK terbawa saat migrasi (bisa diperbaiki dari export).");
console.log(' • Jika distribusi Approved di EXPORT juga rendah (mirip Supabase) → export snapshot lebih lama drpd sheet Apps Script; angka sheet memang lebih baru.');
