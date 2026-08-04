# Importer RenusPro

Memindahkan data dari Google Sheets ke Supabase/Postgres. **Idempoten** —
dirancang untuk dijalankan berkali-kali selama migrasi bertahap, bukan sekali
lalu selesai.

## Persiapan

```bash
cd tools/importer
npm install
cp .env.example .env      # lalu isi
```

**Service account Google:** buat di Google Cloud Console, unduh JSON-nya, lalu
**bagikan spreadsheet** ke alamat email service account tersebut (akses Viewer
sudah cukup).

**DATABASE_URL** harus koneksi langsung ke Postgres (bukan PostgREST), karena
importer perlu menonaktifkan trigger dan melewati RLS.

## Menjalankan

```bash
# 1. Coba dulu tanpa menyimpan apa pun — seluruh transaksi di-rollback
npm run import -- --dry-run

# 2. Buat template daftar user untuk diisi email
#    (Master_User tidak punya kolom email, sedangkan Supabase Auth memerlukannya)
npm run import -- --emit-user-template

# 3. Impor sungguhan, sekalian membuat user di Supabase Auth
npm run import -- --create-auth-users

# 4. Bandingkan ulang kapan saja tanpa menulis
npm run reconcile
```

### Argumen

| Argumen | Arti |
|---------|------|
| `--dry-run` | Impor lalu `ROLLBACK`. Tidak ada yang tersimpan. |
| `--create-auth-users` | Buat user di Supabase Auth lewat Admin API. |
| `--emit-user-template` | Tulis `users.csv` berisi daftar username untuk diisi email. |
| `--reconcile-only` | Hanya bandingkan Sheets vs Postgres. |
| `--users=<file>` | Lokasi CSV pemetaan username→email (default `users.csv`). |
| `--settings=<file>` | Impor `TC_OPTIONS` & `BANK_ACCOUNTS` dari JSON hasil ekspor manual. |

## Password tidak dimigrasi

Password di `Master_User` tersimpan **plaintext** (`Auth.gs:60`). Importer tidak
pernah membacanya. User dibuat tanpa password lalu diundang menetapkan yang baru.

Memindahkan password plaintext ke sistem baru berarti mewariskan kerentanannya —
ini bukan pilihan gaya.

## Yang perlu ditinjau manusia setelah impor

Laporan di akhir menampilkan **nama "Dibuat Oleh" yang tidak cocok**. Kolom itu
menyimpan nama lengkap, bukan ID (`Dashboard.gs:38` membandingkan string nama),
sehingga user yang sudah resign atau berganti nama tidak akan ketemu.

Penawaran seperti itu masuk dengan `owner_id = NULL`, tapi nama aslinya tetap
tersimpan di `owner_name_legacy` — jadi bisa diperbaiki lewat `UPDATE` biasa
tanpa mengimpor ulang apa pun.

## Rekonsiliasi

Impor dianggap **gagal** (exit code bukan nol) kalau angka Sheets dan Postgres
tidak cocok. Yang dibandingkan bukan hanya jumlah baris, tapi juga total nilai:

- jumlah klien, produk, penawaran unik, revisi, Work Order, invoice, kwitansi
- total grand total penawaran (**hanya revisi terkini** — menjumlahkan semua
  revisi akan menggandakan)
- total nilai & DPP invoice
- **total piutang** (invoice belum lunas)
- total nilai kwitansi

Jumlah baris saja tidak cukup: baris bisa lengkap tapi nilainya salah baca.
Membandingkan totalnya menangkap satu angka pun yang salah parse.

## Tes

```bash
npm test                  # parser saja
PGPORT=5433 npm test      # + tes integrasi ke Postgres
```

Tes integrasi otomatis dilewati kalau tidak ada Postgres yang bisa dihubungi.
Salah satunya sengaja menyuntikkan data yang tidak cocok untuk membuktikan
rekonsiliasi benar-benar menangkapnya — rekonsiliasi yang selalu bilang "cocok"
tidak ada gunanya.

## Detail yang mudah terlewat

Beberapa hal yang sudah ditangani, dicatat di sini agar tidak "diperbaiki"
menjadi salah kemudian:

- **Trigger dimatikan selama impor.** Tanpa itu, mengimpor penawaran Deal akan
  menerbitkan Work Order bernomor **baru** alih-alih memakai nomor historis, dan
  meng-upsert invoice lunas akan menimpa tanggal bayarnya dengan hari ini.
- **`dd/MM/yyyy` dibaca hari/bulan.** Tertukar menjadi bulan/hari menghasilkan
  data yang terlihat wajar tapi salah, dan baru ketahuan berbulan-bulan kemudian.
- **No WO tersimpan sebagai angka** di sheet (`WorkOrder.gs:333` memakai
  `setValue(Number(noWO))`), bukan teks.
- **Rincian item penawaran berstruktur kelompok → subItems**, bukan array datar.
  Penawaran lama yang masih datar tetap ditangani.
- **Kolom "Rincian Item (JSON)" di `Invoice_Main` sebenarnya berisi meta**
  (`scope`, `nilaiKontrak`, `inputMode`) — bukan item baris.
- **`document_counters` disemai** dari nomor tertinggi yang ada, supaya dokumen
  pertama di sistem baru tidak bernomor 001 dan menabrak dokumen historis.
