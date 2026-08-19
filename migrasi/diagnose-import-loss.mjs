/* =============================================================================
 *  RenusPro — Diagnostik kehilangan data akibat DUPLIKAT-PK saat import
 *
 *  Untuk SETIAP tabel di mapping.mjs: transform baris export (termasuk hook
 *  `post` bila ada), lalu hitung berapa baris yang PK-nya bertabrakan — yakni
 *  yang AKAN saling menimpa (hilang) saat upsert onConflict=pk.
 *
 *  Karena mapping kini punya perbaikan `post` (id=no_wo-kode) utk qc_item &
 *  ded_item, keduanya akan tampil 0 (sudah aman di mapping — tinggal dipulihkan
 *  di DB via recover-qc-item.mjs). Tabel LAIN yang tampil > 0 = masih berisiko.
 *
 *  Jalankan (tanpa Supabase):
 *    node migrasi/diagnose-import-loss.mjs <export.json>
 * ========================================================================== */
import { readFileSync } from 'node:fs';
import { TABLES } from './mapping.mjs';

const jsonPath = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!jsonPath) { console.error('Usage: node migrasi/diagnose-import-loss.mjs <export.json>'); process.exit(1); }

// ── Transform lengkap (selaras import-supabase.mjs) ──────────────────────────
const s = (v) => (v == null ? '' : String(v)).trim();
function toDate(v) {
  const x = s(v); if (!x) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(x)) { const d = new Date(x); if (isNaN(d)) return x.slice(0, 10); return new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10); }
  let m = x.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = x.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  const d = new Date(x); return isNaN(d) ? null : d.toISOString().slice(0, 10);
}
function toTs(v) { const x = s(v); if (!x) return null; if (/^\d{4}-\d{2}-\d{2}T/.test(x)) return x; let m = x.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,]*(\d{1,2}):(\d{2})(?::(\d{2}))?/); if (m) return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0)).toISOString(); m = x.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return new Date(+m[3], +m[2] - 1, +m[1]).toISOString(); const d = new Date(x); return isNaN(d) ? null : d.toISOString(); }
function toNum(v) { if (v === '' || v == null) return null; if (typeof v === 'number') return isNaN(v) ? null : v; const x = String(v).replace(/[^0-9.\-]/g, ''); if (x === '' || x === '-' || x === '.') return null; const n = Number(x); return isNaN(n) ? null : n; }
function toInt(v) { const n = toNum(v); return n == null ? null : Math.round(n); }
function toBool(v) { const x = s(v).toLowerCase(); if (['ya', 'true', '1', 'yes'].includes(x)) return true; if (['tidak', 'false', '0', 'no', ''].includes(x)) return false; return Boolean(v); }
function toJson(v) { if (v == null || v === '') return null; if (typeof v === 'object') return v; try { return JSON.parse(String(v)); } catch { return null; } }
function toText(v) { const x = s(v); return x === '' ? null : x; }
function toTime(v) { const x = s(v); if (!x) return null; let m = x.match(/^(\d{1,2}):(\d{2})/); if (m) return `${String(m[1]).padStart(2, '0')}:${m[2]}`; const d = new Date(x); if (!isNaN(d)) { const j = new Date(d.getTime() + 7 * 3600 * 1000); return `${String(j.getUTCHours()).padStart(2, '0')}:${String(j.getUTCMinutes()).padStart(2, '0')}`; } return null; }
const CONV = { t: toText, i: toInt, n: toNum, m: toNum, d: toDate, ts: toTs, b: toBool, j: toJson, tm: toTime };

const raw = JSON.parse(readFileSync(jsonPath, 'utf8'));
const affected = [];
console.log('Tabel'.padEnd(26) + 'baris  unik  hilang');
console.log('─'.repeat(48));
for (const def of TABLES) {
  const grid = raw[def.sheet];
  if (!grid) continue;
  const pkKeys = Array.isArray(def.pk) ? def.pk : [def.pk];
  const seen = new Set(); let total = 0, dup = 0, skipped = 0;
  for (const r of grid.slice(1)) {
    if (!r || r.every((c) => s(c) === '')) continue;
    const o = {};
    for (let i = 0; i < def.cols.length; i++) { const [name, type] = def.cols[i]; if (type === 'x') continue; o[name] = (CONV[type] || toText)(r[i]); }
    if (def.post) def.post(o);
    if (pkKeys.some((k) => o[k] == null || o[k] === '')) { skipped++; continue; }
    total++;
    const key = pkKeys.map((k) => o[k]).join('||');
    if (seen.has(key)) dup++; else seen.add(key);
  }
  const flag = dup > 0 ? '  ⚠ HILANG' : '';
  console.log(def.table.padEnd(26) + String(total).padStart(5) + String(seen.size).padStart(6) + String(dup).padStart(7) + flag + (skipped ? `  (${skipped} PK-kosong)` : ''));
  if (dup > 0) affected.push({ table: def.table, dup, pk: pkKeys.join('+') });
}
console.log('─'.repeat(48));
if (!affected.length) { console.log('✅ Tidak ada tabel yang kehilangan baris akibat duplikat-PK (mapping saat ini).'); }
else {
  console.log('⚠ Tabel dgn potensi kehilangan (di-mapping saat ini):');
  affected.forEach((a) => console.log(`   • ${a.table} (PK ${a.pk}): ${a.dup} baris tergabung/hilang`));
  console.log('\nCatatan: qc_item & ded_item sudah diperbaiki di mapping (post id=no_wo-kode);');
  console.log('untuk memulihkan DATA di DB live pakai: node migrasi/recover-qc-item.mjs <export.json> --table=<qc_item|ded_item>');
  console.log('Tabel lain yg muncul di sini belum ada perbaikan — beri tahu bila perlu ditangani.');
}
