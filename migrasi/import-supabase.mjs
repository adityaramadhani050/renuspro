/* =============================================================================
 *  RenusPro — Import data hasil export sheet → Supabase (Postgres)
 *  Membaca renus-export-*.json, transformasi per mapping.mjs, upsert ke Supabase.
 *
 *  Prasyarat:
 *    - Skema sudah dibuat (jalankan 00-ddl-supabase.sql di Supabase SQL editor).
 *    - npm i @supabase/supabase-js
 *    - Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (service role — bypass RLS)
 *
 *  Jalankan:
 *    node migrasi/import-supabase.mjs path/ke/renus-export-YYYYMMDD.json
 *    node migrasi/import-supabase.mjs export.json --only=klien,produk,app_user
 *    node migrasi/import-supabase.mjs export.json --dry     (transform saja, tanpa tulis)
 * ========================================================================== */
import { readFileSync } from 'node:fs';
import { TABLES } from './mapping.mjs';

const args = process.argv.slice(2);
const jsonPath = args.find(a => !a.startsWith('--'));
const DRY = args.includes('--dry');
const only = (args.find(a => a.startsWith('--only=')) || '').replace('--only=', '')
  .split(',').map(s => s.trim()).filter(Boolean);

if (!jsonPath) { console.error('Usage: node import-supabase.mjs <export.json> [--only=t1,t2] [--dry]'); process.exit(1); }

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DRY && (!SUPABASE_URL || !SERVICE_KEY)) {
  console.error('Set env SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY (atau pakai --dry).'); process.exit(1);
}
let sb = null;
if (!DRY) {
  const { createClient } = await import('@supabase/supabase-js'); // lazy: --dry tak butuh paket
  sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

const raw = JSON.parse(readFileSync(jsonPath, 'utf8'));

// ── Transformasi nilai per tipe ─────────────────────────────────────────────
const s = v => (v == null ? '' : String(v)).trim();

function toDate(v) {                 // → 'YYYY-MM-DD' | null
  const x = s(v); if (!x) return null;
  let m = x.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = x.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  const d = new Date(x); return isNaN(d) ? null : d.toISOString().slice(0,10);
}
function toTs(v) {                    // → ISO | null
  const x = s(v); if (!x) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(x)) return x;
  let m = x.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,]*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1], +m[4], +m[5], +(m[6]||0)).toISOString();
  m = x.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1]).toISOString();
  const d = new Date(x); return isNaN(d) ? null : d.toISOString();
}
function toNum(v) {                   // export Sheets sudah berupa angka → jangan
  if (v === '' || v == null) return null;             // otak-atik titik desimal!
  if (typeof v === 'number') return isNaN(v) ? null : v;
  const x = String(v).replace(/[^0-9.\-]/g, '');
  if (x === '' || x === '-' || x === '.') return null;
  const n = Number(x);
  return isNaN(n) ? null : n;
}
function toInt(v) { const n = toNum(v); return n==null ? null : Math.round(n); }
function toBool(v){ const x = s(v).toLowerCase(); if (['ya','true','1','yes'].includes(x)) return true; if (['tidak','false','0','no',''].includes(x)) return false; return Boolean(v); }
function toJson(v){ if (v==null || v==='') return null; if (typeof v==='object') return v; try { return JSON.parse(String(v)); } catch { return null; } }
function toText(v){ const x = s(v); return x==='' ? null : x; }   // '' → null (aman utk FK)
function toTime(v){                   // → 'HH:MM' | null (kolom Postgres type time)
  const x = s(v); if (!x) return null;
  let m = x.match(/^(\d{1,2}):(\d{2})/);                          // sudah "HH:MM"
  if (m) return `${String(m[1]).padStart(2,'0')}:${m[2]}`;
  const d = new Date(x);                                          // ISO (Sheets simpan jam sbg Date)
  if (!isNaN(d)) { const j = new Date(d.getTime() + 7*3600*1000); // → jam lokal WIB (+7)
    return `${String(j.getUTCHours()).padStart(2,'0')}:${String(j.getUTCMinutes()).padStart(2,'0')}`; }
  return null;
}

const CONV = { t:toText, i:toInt, n:toNum, m:toNum, d:toDate, ts:toTs, b:toBool, j:toJson, tm:toTime };

function transformRow(cols, row) {
  const obj = {};
  for (let i = 0; i < cols.length; i++) {
    const [name, type] = cols[i];
    if (type === 'x') continue;            // skip (mis. password)
    obj[name] = (CONV[type] || toText)(row[i]);
  }
  return obj;
}

// ── Jalankan per tabel (urutan mapping = urutan dependency) ─────────────────
const CHUNK = 500;
let totalOk = 0, totalErr = 0;

for (const def of TABLES) {
  if (only.length && !only.includes(def.table)) continue;
  const grid = raw[def.sheet];
  if (!grid) { console.log(`— ${def.table.padEnd(26)} : sheet '${def.sheet}' tidak ada, dilewati`); continue; }
  const dataRows = grid.slice(1);        // buang header
  const pkKeys = Array.isArray(def.pk) ? def.pk : [def.pk];
  const rows = [];
  for (const r of dataRows) {
    if (!r || r.every(c => s(c) === '')) continue;          // baris kosong
    const o = transformRow(def.cols, r);
    if (pkKeys.some(k => o[k] == null || o[k] === '')) continue; // PK wajib
    rows.push(o);
  }
  if (!rows.length) { console.log(`— ${def.table.padEnd(26)} : 0 baris`); continue; }

  if (DRY) { console.log(`✓ ${def.table.padEnd(26)} : ${rows.length} baris (dry) contoh:`, JSON.stringify(rows[0]).slice(0,120)); totalOk += rows.length; continue; }

  const onConflict = pkKeys.join(',');
  let ok = 0, err = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const { error } = await sb.from(def.table).upsert(batch, { onConflict });
    if (error) { err += batch.length; console.error(`  ✗ ${def.table} batch@${i}: ${error.message}`); }
    else ok += batch.length;
  }
  totalOk += ok; totalErr += err;
  console.log(`${err? '⚠':'✓'} ${def.table.padEnd(26)} : ${ok} ok${err?`, ${err} gagal`:''}`);
}

console.log(`\nSelesai. Total ${totalOk} baris${totalErr?`, ${totalErr} gagal`:''}.` + (DRY?' (DRY-RUN)':''));
console.log('Catatan: Auth (password) TIDAK diimpor — buat user Supabase Auth terpisah.');
