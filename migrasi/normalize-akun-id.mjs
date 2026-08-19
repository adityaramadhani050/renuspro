/* =============================================================================
 *  RenusPro — Seragamkan id_akun transaksi lama → ID akun terbaru (by NAMA)
 *
 *  Setelah akun bank diubah di Pengaturan, transaksi lama sering menyimpan
 *  id_akun skema lama sementara nama_akun tetap konsisten. Skrip ini menyetel
 *  id_akun transaksi mengikuti ID akun yang cocok berdasarkan NAMA (sumber
 *  kebenaran), agar konsisten dengan master akun_pembayaran & filter di UI.
 *
 *  AMAN:
 *   - Hanya mengubah kolom id_akun (tidak menyentuh nominal/nama/lainnya).
 *   - Hanya baris yang nama_akun-nya cocok dengan akun aktif DAN id-nya beda.
 *   - Baris yang namanya tak cocok akun mana pun → DILEWATI (dilaporkan).
 *
 *  Jalankan DARI folder repo:
 *    node migrasi/normalize-akun-id.mjs --dry      # lihat rencana perubahan
 *    node migrasi/normalize-akun-id.mjs            # terapkan
 *  Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * ========================================================================== */
const DRY = process.argv.slice(2).includes('--dry');
const SUPABASE_URL = process.env.SUPABASE_URL, SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Set env SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
const { createClient } = await import('@supabase/supabase-js');
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const norm = (v) => (v == null ? '' : String(v)).trim().toLowerCase();

// Tabel transaksi yang punya (id_akun, nama_akun). ayat_silang punya 2 sisi.
const TARGETS = [
  { table: 'pemasukan',           pk: 'id_pemasukan',   pairs: [['id_akun', 'nama_akun']] },
  { table: 'pengeluaran',         pk: 'id_pengeluaran', pairs: [['id_akun', 'nama_akun']] },
  { table: 'penerimaan_tanpa_po', pk: 'id',             pairs: [['id_akun', 'nama_akun']] },
  { table: 'ayat_silang',         pk: 'id',             pairs: [['id_akun_asal', 'nama_asal'], ['id_akun_tujuan', 'nama_tujuan']] },
];

// ── Peta nama → id dari master akun_pembayaran ───────────────────────────────
const aq = await sb.from('akun_pembayaran').select('id,nama_akun');
if (aq.error) { console.error('Gagal baca akun_pembayaran:', aq.error.message); process.exit(1); }
const nameToId = {}, dupNames = [];
(aq.data || []).forEach((a) => {
  const nm = norm(a.nama_akun); if (!nm) return;
  if (nameToId[nm] && nameToId[nm] !== (a.id || '').toString()) dupNames.push(a.nama_akun);
  if (!nameToId[nm]) nameToId[nm] = (a.id || '').toString();
});
console.log(`Akun master: ${aq.data.length} akun.` + (dupNames.length ? ` ⚠ nama ganda: ${[...new Set(dupNames)].join(', ')} (pakai id pertama)` : ''));

async function allRows(table, sel) {
  const out = []; let from = 0;
  for (;;) {
    const { data, error } = await sb.from(table).select(sel).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return out;
}

let grandChanged = 0;
for (const t of TARGETS) {
  const cols = new Set([t.pk]);
  t.pairs.forEach(([idC, nmC]) => { cols.add(idC); cols.add(nmC); });
  let rows;
  try { rows = await allRows(t.table, [...cols].join(',')); }
  catch (e) { console.log(`— ${t.table.padEnd(20)} : gagal baca (${e.message})`); continue; }

  // Kumpulkan per pasangan kolom: newId → [pk...] yang perlu diubah.
  let changed = 0, unmapped = 0;
  for (const [idC, nmC] of t.pairs) {
    const byNewId = new Map();
    for (const r of rows) {
      const nm = norm(r[nmC]); if (!nm) continue;
      const target = nameToId[nm];
      if (!target) { unmapped++; continue; }
      if ((r[idC] || '').toString() === target) continue;   // sudah benar
      if (!byNewId.has(target)) byNewId.set(target, []);
      byNewId.get(target).push(r[t.pk]);
    }
    for (const [newId, pks] of byNewId) {
      changed += pks.length;
      if (DRY) continue;
      for (let i = 0; i < pks.length; i += 200) {
        const chunk = pks.slice(i, i + 200);
        const u = await sb.from(t.table).update({ [idC]: newId }).in(t.pk, chunk);
        if (u.error) console.error(`  ✗ ${t.table}.${idC}→${newId}: ${u.error.message}`);
      }
    }
  }
  grandChanged += changed;
  console.log(`${DRY ? '•' : '✓'} ${t.table.padEnd(20)} : ${rows.length} baris, ${changed} id_akun ${DRY ? 'akan diubah' : 'diubah'}${unmapped ? `, ${unmapped} nama tak terpetakan (dilewati)` : ''}`);
}
console.log(`\nSelesai. Total ${grandChanged} nilai id_akun ${DRY ? 'akan diseragamkan' : 'diseragamkan'}.` + (DRY ? ' (DRY-RUN — jalankan tanpa --dry untuk menerapkan)' : ''));
