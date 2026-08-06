# Panduan Gap Cash Manager (Ayat Silang, Bank Account, Saldo)

Menambah 3 tabel yang belum ada supaya **Saldo Akun, Ayat Silang, Kategori
Pengeluaran, Bank Account** bisa dibaca dari Supabase.

> ⚠️ Ingat: **TULIS masih ke Google Sheets**. Jadi selama fase ini, saldo di
> Supabase hanya benar untuk **data lama (hasil import)**. Transaksi BARU yang
> Anda input lewat aplikasi belum masuk Supabase sampai fungsi **tulis** dipindah.
> Ini scaffolding — bukan angka final.

## Langkah 1 — Buat 3 tabel (Supabase SQL Editor)
Buka Supabase → **SQL Editor** → tempel isi **`00-ddl-gap-cashmanager.sql`** →
**Run**. Ini membuat `ayat_silang`, `bank_account`, `kategori_pengeluaran` +
seed default + RLS.

> **Bank account**: file itu men-seed 1 rekening contoh (BSI). **Edit** bagian
> `insert into bank_account ...` agar sesuai rekening asli Anda, ATAU nanti
> tambah/ubah lewat Supabase → **Table Editor** → tabel `bank_account`.
> (Kolom `id` harus **sama** dengan id akun yang dipakai di pemasukan/pengeluaran.)

## Langkah 2 — Import data Ayat Silang
Data ayat silang ada di sheet `AyatSilang` (belum pernah diekspor).

1. Di Apps Script lama: **ganti** isi `apps-script-export.gs` dengan versi terbaru
   (sudah menyertakan `AyatSilang`) → jalankan `exportSemuaSheetKeJSON()` →
   unduh JSON baru.
2. Di Cloud Shell:
   ```bash
   cd ~/renuspro && git pull origin claude/eloquent-heisenberg-swy9m6
   # upload JSON baru, rapikan namanya:
   mv ~/renus-export-*.json ~/export.json
   export SUPABASE_URL="https://ISI.supabase.co"
   export SUPABASE_SERVICE_ROLE_KEY="ISI-SERVICE-ROLE"
   node migrasi/import-supabase.mjs ~/export.json --only=ayat_silang
   ```
   > Cukup tabel `ayat_silang` saja (`--only`). Tabel lain tak perlu diimpor ulang.

## Langkah 3 — Build & push frontend
```bash
cd ~/renuspro
node migrasi/build.mjs
cp dist/index.html            ~/renuspro-web/index.html
cp dist/supabase-overrides.js ~/renuspro-web/supabase-overrides.js
cp dist/gs-run-shim.js        ~/renuspro-web/gs-run-shim.js
cd ~/renuspro-web && git add . && git commit -m "gap cash manager" && git push
```

## Langkah 4 — Uji
Buka **Cash Manager**:
- **Saldo Akun** — daftar akun + masuk/keluar/saldo (dari data lama).
- **Mutasi → Ayat Silang** — daftar transfer antar-akun tampil.
- Dropdown **Kategori Pengeluaran** & **Akun/Bank** terisi.

---

## Kalau ada masalah
| Gejala | Solusi |
|---|---|
| Saldo semua 0 / akun kosong | `bank_account` belum diisi rekening yang benar (id harus cocok dgn id_akun di pemasukan/pengeluaran). Cek Table Editor |
| Ayat silang kosong | Langkah 2 belum jalan / JSON belum berisi `AyatSilang` (pastikan pakai export.gs terbaru) |
| Error `relation ayat_silang does not exist` | Langkah 1 (SQL) belum dijalankan |
| Saldo beda dengan sistem lama | WAJAR untuk transaksi BARU — karena tulis masih ke Sheets. Cocok hanya utk data lama |
