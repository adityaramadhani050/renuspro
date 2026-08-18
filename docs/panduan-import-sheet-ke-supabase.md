# Panduan Import Data Google Sheet → Supabase (Replace Semua Data)

> ⚠️ **PERINGATAN — DESTRUKTIF.** Prosedur ini **menghapus seluruh data** di tabel
> tujuan lalu menggantinya dengan data dari Google Sheet. **Backup dulu** (langkah 1).
> Jalankan di **jam sepi** dan sebaiknya uji di **project Supabase kloning** dulu.

---

## 0. Gambaran & keputusan pendekatan

RenusPro punya ~45 tabel. Sebagian **datar** (klien, supplier, produk) dan sebagian
punya **kolom JSON** (penawaran.items, qc_item.foto, invoice.rincian_item, dll.) +
kolom `snake_case` + tipe khusus (tanggal, numeric, boolean).

| Jenis tabel | Cara import |
|---|---|
| Datar/sederhana (tanpa JSON) | Bisa lewat **Table Editor → Import CSV** (cepat) atau skrip |
| Ada kolom JSON / butuh transformasi | **Wajib pakai skrip** (CSV mentah tak bisa bikin jsonb & konversi tanggal) |
| `app_user` (login) | **Khusus** — user login perlu dibuat di **Supabase Auth**, bukan sekadar insert baris (lihat §6) |

**Rekomendasi:** pakai **skrip Node** (§5) untuk semua tabel agar konsisten
(truncate + transform + insert), pakai **service-role key** (bypass RLS).

Referensi pemetaan kolom Sheet ↔ DB:
- **Struktur Sheet lama** ada di file `.gs` di root repo (mis. `Penawaran.gs`,
  `WorkOrder.gs`, `Produk.gs`, `Customer.gs`, …) — di sana terlihat kolom sheet
  yang dibaca/ditulis.
- **Skema DB** ada di `00-ddl-supabase.sql` (+ `00-ddl-*.sql`) — nama kolom
  `snake_case`, tipe, dan mana yang `jsonb`.

---

## 1. Backup dulu (WAJIB)

Dua lapis backup:

1. **Supabase otomatis**: Dashboard → Database → Backups (kalau tersedia).
2. **Manual `pg_dump`** (paling aman untuk rollback):
   ```bash
   # ambil connection string: Dashboard → Project Settings → Database → Connection string (URI)
   pg_dump "postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres" \
     --data-only --schema=public -f backup-sebelum-import.sql
   ```
   Simpan `backup-sebelum-import.sql`. Untuk rollback: `psql "<uri>" -f backup-sebelum-import.sql`.

---

## 2. Siapkan sumber data (Google Sheet)

Pilih salah satu cara ambil data sheet ke skrip:

- **A. Publish per-tab sebagai CSV** (paling mudah): tiap tab → File → Share →
  Publish to web → pilih tab + CSV → salin URL. Skrip fetch URL itu.
- **B. Google Sheets API** (service account) — lebih rapi kalau sheet privat.
- **C. Unduh manual** tiap tab jadi `.csv` lalu baca dari disk.

Catat: **nama tab** dan **header kolom** tiap tab (harus tahu urutan/nama kolom
untuk pemetaan).

---

## 3. Pemetaan kolom (contoh)

Prinsip: `Header Sheet` → `kolom_db snake_case`, dengan konversi tipe.

Contoh tabel `klien` (datar):

| Sheet | DB (`klien`) | Konversi |
|---|---|---|
| ID Klien | `id` | teks apa adanya |
| Nama Klien | `nama_klien` | teks |
| Perusahaan | `perusahaan` | teks |
| Alamat | `alamat` | teks |
| Kontak | `kontak` | teks |

Contoh tabel `penawaran` (ADA jsonb):

| Sheet | DB (`penawaran`) | Konversi |
|---|---|---|
| No Penawaran | `no_penawaran` | teks |
| Rev | `rev` | angka |
| Tanggal | `tanggal` | **tanggal → `YYYY-MM-DD`** |
| Subtotal | `subtotal` | angka (buang titik ribuan) |
| Items (JSON) | `items` | **parse jadi array/jsonb** |
| Term & Conditions | `term_conditions` | **jsonb** |
| Status | `status` | teks |

> Tanggal dari Sheet bisa berupa serial number atau `dd/mm/yyyy` — normalkan ke
> ISO `YYYY-MM-DD`. Angka berformat `1.000.000` → buang titik. Sel kosong → `null`.

**Titik pemetaan resmi**: buka file `.gs` terkait (mis. `Penawaran.gs`) untuk melihat
kolom sheet aslinya, dan `00-ddl-supabase.sql` untuk kolom DB-nya.

---

## 4. Urutan import (master dulu)

Walau app ini tak pakai FK ketat, urutkan agar konsisten:

1. Master: `klien`, `supplier`, `produk`, `pricelist`, `pricelist_kategori`,
   `kategori_pengeluaran`, `akun_pembayaran`/`bank_account`, `app_config`,
   `qc_checklist`, `ded_checklist`, `template_paket`.
2. Inti: `penawaran` (→ dari sini WO diturunkan), `stok`.
3. Transaksional: `purchase_order`, `po_item`, `pembayaran_po`, `invoice`,
   `kwitansi`, `pengeluaran`, `pemasukan`, `mutasi_stok`, `pengiriman`, dll.
4. Engineering: `bom_project`/`bom_item`, `ded_*`, `qc_*`, `schedule_*`, `site_survey`,
   `hand_over`.
5. **`app_user`** — terakhir & khusus (§6).

---

## 5. Skrip migrasi (kerangka siap-pakai)

`scripts/import-sheet.mjs` — pola: **fetch CSV → transform per baris → truncate tabel
→ insert batch**. Isi `MAP` per tabel. Selalu jalankan **dry-run** dulu.

```js
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;  // service role — bypass RLS
const APPLY = process.argv.includes('--apply');     // tanpa ini = dry-run
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

// --- util konversi ---
const toNum  = (v) => { const n = parseFloat(String(v ?? '').replace(/[^\d.-]/g, '')); return isNaN(n) ? 0 : n; };
const toDate = (v) => { if (!v) return null; const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : null; };
const toJson = (v) => { if (v == null || v === '') return null; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch { return null; } };
const nz     = (v) => (v === '' || v == null ? null : v);

// --- parser CSV sederhana (dukung koma dalam kutip) ---
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"' && text[i+1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c; }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift().map((h) => h.trim());
  return rows.filter((r) => r.some((c) => (c || '').trim() !== ''))
             .map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

// --- DEFINISI PER TABEL: {csvUrl, table, transform(rowSheet) -> rowDB} ---
const MAP = [
  { table: 'klien', csvUrl: 'https://docs.google.com/.../pub?gid=0&single=true&output=csv',
    transform: (r) => ({ id: r['ID Klien'], nama_klien: r['Nama Klien'], perusahaan: nz(r['Perusahaan']),
                         alamat: nz(r['Alamat']), kontak: nz(r['Kontak']) }) },
  { table: 'penawaran', csvUrl: 'https://docs.google.com/.../pub?gid=123&single=true&output=csv',
    transform: (r) => ({ no_penawaran: r['No Penawaran'], rev: toNum(r['Rev']), tanggal: toDate(r['Tanggal']),
                         nama_project: nz(r['Nama Project']), klien_id: nz(r['ID Klien']),
                         subtotal: toNum(r['Subtotal']), diskon: toNum(r['Diskon']), pajak: toNum(r['Pajak']),
                         grand_total: toNum(r['Grand Total']), items: toJson(r['Items']),
                         term_conditions: toJson(r['Term Conditions']), status: nz(r['Status']),
                         no_wo: nz(r['No WO']) }) },
  // … tambah tabel lain mengikuti urutan §4 …
];

async function run() {
  for (const m of MAP) {
    process.stdout.write(`\n[${m.table}] fetch CSV… `);
    const csv = await (await fetch(m.csvUrl)).text();
    const rows = parseCSV(csv).map(m.transform).filter(Boolean);
    console.log(`${rows.length} baris siap.`);
    if (!APPLY) { console.log('  DRY-RUN. Contoh baris:', JSON.stringify(rows[0] || {})); continue; }
    // REPLACE: hapus semua dulu (service-role bypass RLS)
    const del = await sb.from(m.table).delete().neq('__none__', '__none__'); // hapus semua
    if (del.error) { console.error('  gagal hapus:', del.error.message); continue; }
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb.from(m.table).insert(rows.slice(i, i + 500));
      if (error) { console.error(`  gagal insert @${i}:`, error.message); break; }
    }
    console.log(`  ✅ ${m.table} terisi ${rows.length} baris.`);
  }
}
run().catch((e) => { console.error(e); process.exit(1); });
```

> `delete().neq('__none__','__none__')` = hapus semua baris (Supabase butuh filter).
> Untuk truncate + reset lebih bersih, jalankan `truncate table <t> cascade;` via SQL
> Editor sebelum insert.

Jalankan:
```bash
cd scripts && npm i @supabase/supabase-js
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY='<service_role>' \
  node import-sheet.mjs            # dry-run: cek jumlah & contoh baris
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY='...' node import-sheet.mjs --apply   # eksekusi
```

---

## 6. Kasus khusus

**a. `app_user` & login (PALING PENTING).**
User login memakai **Supabase Auth** (email+password) dan baris `app_user` punya
`auth_uid` yang menaut ke `auth.users`. Jadi **tidak cukup insert baris app_user** —
tiap user harus dibuat di Auth dulu:
```js
// buat auth user + baris app_user
const email = username.toLowerCase() + '@' + 'renergynusantara.com'; // LOGIN_EMAIL_DOMAIN
const { data: au } = await sb.auth.admin.createUser({ email, password: passwordAwal, email_confirm: true });
await sb.from('app_user').insert({ id, nama, username, role, aktif: true, auth_uid: au.user.id, no_whatsapp });
```
Set password awal seragam (mis. dari sheet atau default), minta user ganti nanti.
Repo punya `provision-auth.mjs` — bisa jadi acuan pembuatan auth user massal.

**b. `fileId` foto/dokumen.**
Data lama menyimpan foto sebagai **Google Drive ID**. App sudah bisa membacanya
(`_driveImgDataUrl` via `lh3.googleusercontent.com/d/<id>`). Jadi kolom `foto`/`files`
yang berisi Drive ID lama **tetap tampil** tanpa upload ulang — asalkan file Drive-nya
masih ada & share-nya "anyone with link".

**c. Kolom JSON (`items`, `foto`, `term_conditions`, `rincian_item`).**
Pastikan sel sheet berisi **JSON valid**; `toJson()` mem-parse-nya. Kalau di sheet
tersimpan sebagai teks non-JSON, perlu transform khusus per tabel.

**d. `stok` & `mutasi_stok`.**
Saldo stok idealnya konsisten dengan mutasi. Kalau import keduanya, pastikan
`stok.qty_tersedia` = hasil akhir mutasi, atau import `stok` sebagai snapshot saja.

---

## 7. Verifikasi setelah import

```sql
select 'klien' t, count(*) from klien
union all select 'penawaran', count(*) from penawaran
union all select 'produk', count(*) from produk
union all select 'invoice', count(*) from invoice;   -- dst
```
Lalu buka aplikasi: login, cek Penawaran/WO/Produk/Invoice tampil benar, angka cocok.

---

## 8. Rollback

Kalau hasilnya salah:
```bash
# kosongkan lalu pulihkan dari backup langkah 1
psql "<uri>" -c "truncate table <tabel-yang-diimport> cascade;"
psql "<uri>" -f backup-sebelum-import.sql
```

---

## Ringkas

1. **Backup** (pg_dump). 2. **Siapkan CSV** tiap tab. 3. **Petakan** kolom (acuan `.gs`
   + DDL). 4. **Isi `MAP`** di skrip, urut master→transaksi→user. 5. **Dry-run** → cek.
   6. **`--apply`**. 7. **Verifikasi**. 8. Simpan backup untuk rollback.

> Saya bisa **melengkapi `MAP` untuk semua tabel** secara akurat kalau Anda kirim
> **daftar tab + header kolom** Google Sheet-nya (atau konfirmasi strukturnya sama
> persis dengan file `.gs` di repo). Bagian `app_user`/Auth akan saya buatkan terpisah.
