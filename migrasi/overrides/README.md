# migrasi/overrides/ — override Supabase (dipecah per-modul)

Dulu semuanya di satu file raksasa `migrasi/supabase-overrides.js` (>5000 baris).
Kini dipecah jadi banyak file kecil di folder ini supaya mudah dibaca/di-edit
tanpa memuat seluruh kode.

## Cara kerja
`migrasi/build.mjs` **menggabungkan** semua `*.js` di folder ini **sesuai urutan
nama file** (lexicographic) menjadi satu `dist/supabase-overrides.js`. Jadi:

- `000-head.js` — pembuka IIFE + **konfigurasi Supabase (SUPABASE_URL / ANON /
  ENABLE_EDGE_* langsung di sini, INLINE)** + loader supabase-js.
  **Di sinilah kamu isi key Supabase.** Key disimpan inline (bukan file
  terpisah) supaya deploy tidak pernah gagal karena file konfig ketinggalan.
  **JANGAN ubah struktur IIFE-nya.** Semua file setelahnya berbagi scope yang
  sama (`supa`, helper `_all`, `_fmtTs`, dst) — urutan penting.
- `010-…` s/d `1xx-…` — helper bersama + override per-modul (baca & tulis).
- `900-tail.js` — penutup IIFE (`console.log` + `.catch` + `})();`).

Semua file KECUALI head/tail hanyalah potongan pernyataan di dalam callback yang
sama; menggabungkannya = kode aslinya (build sudah diverifikasi byte-identik).

## Isi key Supabase
Edit **`000-head.js`** saja: `SUPABASE_URL`, `SUPABASE_ANON`, dan flag
`ENABLE_EDGE_*`. Karena file ini kecil & jarang tersentuh update, `git pull`
hampir tak pernah bentrok di sini.

## Menambah/mengedit override
- **Edit** fungsi: cari file-nya (`grep -rn "gsRoute('namaFungsi'" migrasi/overrides/`),
  buka file kecil itu saja.
- **Tambah** override baru: taruh di file modul yang relevan, atau buat file baru
  dengan prefix angka **sebelum `900`** (mis. `800-fitur-baru.js`) agar tergabung
  sebelum penutup. Helper baru boleh di file mana saja (function declaration
  ter-hoist dalam satu scope), tapi rapikan dekat pemakainya.
- Setelah edit: `node migrasi/build.mjs && node --check dist/supabase-overrides.js`.

`_INDEX.txt` memuat daftar file terurut.
