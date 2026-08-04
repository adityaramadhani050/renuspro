# RenusPro Web (Vercel)

Frontend Next.js untuk sistem yang sudah dimigrasi. Modul yang masih dilayani
Apps Script sengaja **tidak** dimunculkan di menu — selama migrasi bertahap,
satu tabel hanya boleh punya satu pemilik tulis.

## Yang sudah dimigrasi

| Halaman | Menggantikan |
|---------|--------------|
| Dashboard | `getDashboardRawData()` + kalkulasi KPI di `JS_Dashboard.html` |
| Produk & Jasa | `getProdukList()` (`Produk.gs:6`) |
| Klien | `getCustomerList()` (`Customer.gs:6`) |

Penawaran, Work Order, Invoice, dan Kwitansi menyusul pada tahap berikutnya.

## Menjalankan

```bash
cd apps/web
npm install
cp .env.example .env.local     # isi URL & anon key Supabase
npm run dev
```

## Deploy ke Vercel

Set **Function Region ke Singapore (`sin1`)**. Region default Vercel ada di
Amerika; kalau dibiarkan, setiap query ke Supabase Singapore menempuh perjalanan
bolak-balik lintas benua dan sebagian besar keuntungan latensi yang dikejar
migrasi ini hilang begitu saja.

Environment variable yang perlu diisi hanya dua: `NEXT_PUBLIC_SUPABASE_URL` dan
`NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Yang membuatnya cepat

Dua perubahan yang langsung menjawab keluhan lambatnya sistem lama:

**Pagination & pencarian di server.** Sistem lama menarik seluruh tabel ke
browser lalu memotongnya di sana (`state.data.slice(...)`,
`JS_Pagination.html:199`), sehingga biaya tiap halaman tumbuh mengikuti total
baris. Di sini hanya satu halaman data yang berpindah, lewat `.range()`, dan
pencarian dikerjakan Postgres memakai index trigram.

**Dashboard sebagai agregasi.** `getDashboardRawData()` mengirim semua penawaran
ke browser untuk dihitung di sana. Sekarang satu panggilan RPC
`dashboard_summary()` mengembalikan sepuluh angka.

Nomor halaman dan kata kunci disimpan di URL, bukan di state React — hasil
pencarian bisa di-bookmark dan tombol Back browser bekerja sebagaimana mestinya.

## Keamanan

- Aplikasi ini **hanya** memakai anon key. Seluruh otorisasi ditegakkan RLS di
  database (`supabase/migrations/20260804080000_rls.sql`). Kalau di sini dipakai
  service role key, semua kebijakan RLS jadi tidak ada artinya.
- Middleware memakai `getUser()`, bukan `getSession()`: yang pertama memvalidasi
  token ke server Supabase, yang kedua hanya membaca cookie dan bisa dipalsukan.
- Pengunjung anonim ditolak di middleware — berbeda dari sistem lama yang
  membuka web app ke `ANYONE_ANONYMOUS` (`appsscript.json`).

## Masa peralihan login

Sistem lama memakai username, Supabase Auth memakai email. Form login tetap
menerima username dan melengkapinya dengan `NEXT_PUBLIC_AUTH_EMAIL_DOMAIN`
kalau di-set, supaya kebiasaan pengguna tidak berubah.

Password lama tidak berlaku — password plaintext dari sheet tidak pernah
dimigrasi.
