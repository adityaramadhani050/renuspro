// ─────────────────────────────────────────────────────────────────────────────
// Pembersih file "yatim" (orphan) di Supabase Storage bucket `uploads`.
//
// Aman: sebuah file dianggap TERPAKAI bila path-nya muncul di mana pun dalam
// dump seluruh tabel DB (fileId maupun fileUrl). Hanya file yang benar-benar
// tak tereferensi yang dianggap orphan. Default DRY-RUN (hanya melapor).
//
// Jalankan:
//   cd scripts && npm i @supabase/supabase-js
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ...service_role... \
//   node cleanup-orphan-storage.mjs            # dry-run (lapor saja)
//   node cleanup-orphan-storage.mjs --delete   # benar-benar menghapus
//
// PENTING: pakai SERVICE ROLE key (bukan anon). Backup dulu bila ragu.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.BUCKET || 'uploads';
const DELETE = process.argv.includes('--delete');

if (!URL || !KEY) {
  console.error('❌ Set env SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY dulu.');
  process.exit(1);
}
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

// Semua tabel discan (aman: tabel non-file hanya menambah dump, tak masalah).
const TABLES = [
  'qc_item', 'qc_section', 'qc_project', 'ded_item', 'ded_project', 'site_survey',
  'bom_item', 'bom_project', 'purchase_order', 'po_item', 'po_payment_request',
  'pembayaran_po', 'penerimaan_po_log', 'penerimaan_tanpa_po', 'invoice', 'kwitansi',
  'wo_dokumen', 'hand_over', 'pengiriman', 'pengiriman_request', 'penawaran',
  'pengeluaran', 'pemasukan', 'produk', 'pricelist', 'supplier', 'klien',
  'schedule_task', 'schedule_project', 'app_config', 'app_user',
];

function fmtMB(bytes) { return (bytes / 1048576).toFixed(2) + ' MB'; }

// List rekursif semua objek di bucket (folder → rekursi).
async function listAll(prefix = '') {
  const out = [];
  const LIMIT = 100;
  let offset = 0;
  while (true) {
    const { data, error } = await sb.storage.from(BUCKET).list(prefix, {
      limit: LIMIT, offset, sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error('storage.list ' + prefix + ': ' + error.message);
    if (!data || !data.length) break;
    for (const item of data) {
      const path = prefix ? prefix + '/' + item.name : item.name;
      // Folder di Supabase: id === null (tak punya metadata file).
      if (item.id === null || !item.metadata) {
        out.push(...await listAll(path));
      } else {
        out.push({ path, size: Number(item.metadata.size) || 0 });
      }
    }
    if (data.length < LIMIT) break;
    offset += LIMIT;
  }
  return out;
}

// Kumpulkan dump seluruh tabel sebagai satu blob teks (untuk cek referensi).
async function dumpDB() {
  let blob = '';
  let anyFail = false;
  for (const t of TABLES) {
    let from = 0;
    while (true) {
      const { data, error } = await sb.from(t).select('*').range(from, from + 999);
      if (error) {
        console.warn('  ⚠ lewati tabel ' + t + ': ' + error.message);
        anyFail = true;
        break;
      }
      if (!data || !data.length) break;
      blob += JSON.stringify(data);
      if (data.length < 1000) break;
      from += 1000;
    }
  }
  return { blob, anyFail };
}

async function main() {
  console.log('🔎 Mendata objek di bucket "' + BUCKET + '" ...');
  const files = await listAll();
  const totalSize = files.reduce((s, f) => s + f.size, 0);
  console.log('   Total objek: ' + files.length + ' (' + fmtMB(totalSize) + ')');

  console.log('🔎 Membaca referensi dari ' + TABLES.length + ' tabel DB ...');
  const { blob, anyFail } = await dumpDB();

  const orphans = files.filter((f) => !blob.includes(f.path));
  const orphanSize = orphans.reduce((s, f) => s + f.size, 0);

  console.log('\n── HASIL ─────────────────────────────────');
  console.log('File terpakai : ' + (files.length - orphans.length));
  console.log('File orphan   : ' + orphans.length + ' (' + fmtMB(orphanSize) + ')');
  if (orphans.length) {
    console.log('\nContoh orphan (maks 20):');
    orphans.slice(0, 20).forEach((f) => console.log('  • ' + f.path + '  (' + fmtMB(f.size) + ')'));
  }

  if (!DELETE) {
    console.log('\nℹ️  DRY-RUN. Tidak ada yang dihapus. Tambah --delete untuk menghapus.');
    return;
  }
  if (anyFail) {
    console.error('\n❌ Sebagian tabel gagal dibaca → BATAL menghapus (mencegah salah-hapus file yang masih dipakai). Perbaiki akses tabel lalu ulangi.');
    process.exit(2);
  }
  if (!orphans.length) { console.log('\n✅ Tidak ada orphan untuk dihapus.'); return; }

  console.log('\n🗑️  Menghapus ' + orphans.length + ' file orphan ...');
  let done = 0;
  for (let i = 0; i < orphans.length; i += 100) {
    const batch = orphans.slice(i, i + 100).map((f) => f.path);
    const { error } = await sb.storage.from(BUCKET).remove(batch);
    if (error) { console.error('   gagal batch: ' + error.message); continue; }
    done += batch.length;
    console.log('   terhapus ' + done + '/' + orphans.length);
  }
  console.log('\n✅ Selesai. Dibebaskan ~' + fmtMB(orphanSize) + '.');
}

main().catch((e) => { console.error('❌ Error:', e.message); process.exit(1); });
