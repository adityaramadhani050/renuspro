# RenusPro — Suite E2E (Playwright)

Uji **live** aplikasi yang sudah ter-deploy (Vercel + Supabase asli). Dijalankan
dari mesin Anda karena butuh akses jaringan ke deploy, Supabase, dan CDN — yang
diblokir di sandbox agen.

## Apa yang diuji

| File | Cakupan | Menulis data? |
|---|---|---|
| `tests/01-login.spec.js` | Login valid tiap peran + login salah menampilkan error | Tidak |
| `tests/02-nav-smoke.spec.js` | Login tiap peran → telusuri **semua menu** peran itu; gagal bila ada exception JS / query rusak / render error | Tidak |
| `tests/03-pdf-smoke.spec.js` | Klik export PDF di dashboard & 3 laporan (admin); gagal bila jsPDF/agregasi melempar | Tidak |
| `tests/04-penawaran-write.spec.js` | Buka form penawaran, verifikasi **invarian total** (grandTotal = netSub + pajak; profit = netSub − HPP) | Ya (gated) |

`02-nav-smoke` adalah inti pemburu bug: tiap navigasi memicu query Supabase nyata,
jadi masalah RLS/permission/bentuk-data/JS akan tersurface per-menu.

## Setup

```bash
cd e2e
npm install
npx playwright install chromium
cp .env.example .env
# lalu edit .env: isi E2E_BASE_URL + kredensial peran yang ingin diuji
```

Peran tanpa kredensial otomatis di-skip — cukup isi yang Anda punya. **Pakai akun
& data TES**, bukan produksi (flow tulis membuat data).

## Menjalankan

```bash
npm test              # semua test
npm run smoke         # hanya login + navigasi (read-only, paling aman)
npm run test:headed   # lihat browsernya berjalan
npm run test:ui       # mode UI interaktif Playwright
npm run report        # buka laporan HTML terakhir
```

Flow tulis (04) hanya jalan bila `E2E_ALLOW_WRITES=1` di `.env`.

## Membaca hasil & melapor balik ke agen

Setelah run, kirimkan ke agen untuk dianalisis/diperbaiki:

1. Ringkasan pass/fail dari terminal.
2. Isi `playwright-report/` (atau jalankan `npm run report`) — khususnya pesan
   `pageerror` dan anotasi `console.error` per peran.
3. Untuk kegagalan: screenshot & trace ada di `test-results/`.

Cara cepat menyalin ringkasan teks:

```bash
npm test 2>&1 | tee hasil-e2e.txt
```

lalu paste `hasil-e2e.txt` (atau bagian yang gagal).

## Catatan selektor

Test digrounding pada ID nyata di kode saat ini (`#login-username`, `#login-btn`,
`#nav-<id>`, `#page-<id>`, `#txtGrandTotalSemua`, dst). Bila UI berubah, sesuaikan
selektor di `helpers/auth.js` dan spec terkait. Peta peran→menu ada di
`helpers/roles.js` (cermin `_ROLE_NAV`); samakan bila daftar menu berubah.

## Batasan jujur

- E2E membuktikan **perilaku yang dijalankan test**, bukan ketiadaan semua bug.
- `02-nav-smoke` memverifikasi tiap menu *render tanpa exception* dan query jalan,
  bukan kebenaran setiap angka di dalamnya. Verifikasi angka mendalam ada di
  `04` (invarian total penawaran) dan perlu Anda perluas untuk PO/invoice/HPP
  sesuai data tes Anda.
