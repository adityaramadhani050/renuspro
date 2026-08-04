# RenusPro

Aplikasi **Google Apps Script** (web app) untuk PT. Renus Global Indonesia:
dashboard sales, manajemen penawaran/quotation, produk/jasa, klien, template
paket, dan manajemen user — dengan penyimpanan di Google Sheets.

## Fitur

- **Dashboard** — KPI revenue, win rate, deals, target vs aktual, tren bulanan,
  pipeline status, leaderboard sales (dengan filter tanggal).
- **Penawaran** — buat/revisi quotation, riwayat revisi, ubah status
  (On-Progress/Deal/Fail), export & preview PDF, salin penawaran.
- **Produk/Jasa, Klien, Template Paket** — CRUD lengkap + pencarian + pagination.
- **Autentikasi & Manajemen User** — login, peran admin/sales, ganti password.

## Migrasi ke Supabase + Railway + Vercel

Sistem ini sedang dimigrasi secara bertahap dari Google Sheets + Apps Script.
- **[`RUNBOOK.md`](RUNBOOK.md)** — cara menjalankan migrasinya, langkah demi
  langkah. Mulai dari sini kalau ingin langsung mengerjakan.
- **[`MIGRATION_PLAN.md`](MIGRATION_PLAN.md)** — diagnosa penyebab lambat,
  temuan keamanan, pemetaan sheet ke skema Postgres, dan alasan di balik tiap
  keputusan desain.

| Direktori | Isi |
|-----------|-----|
| `supabase/migrations/` | Skema Postgres: 16 tabel, 9 view, 35 policy RLS |
| `supabase/tests/` | Tes perilaku skema (trigger, penomoran, constraint, RLS) |
| `tools/importer/` | ETL idempoten Sheets → Supabase + rekonsiliasi |
| `apps/web/` | Frontend Next.js untuk Vercel |
| *(root)* | Aplikasi Apps Script lama — masih melayani modul yang belum dipindah |

Verifikasi skema pada database bersih:

```bash
./tools/verify-schema.sh
```

**Selama masa transisi, satu tabel hanya boleh punya satu pemilik tulis.**
Modul yang sudah pindah ke aplikasi web tidak boleh lagi ditulis dari Apps
Script, dan sebaliknya — di situlah data mulai tidak konsisten.

## Struktur kode

Kode dipecah **per fitur**. Lihat [`STRUCTURE.md`](STRUCTURE.md) untuk detail
peta file backend (`.gs`) dan frontend (partial `Index.html`).

## Deploy

1. Push seluruh file `.gs` dan `.html` ke proyek Apps Script (mis. `clasp push`).
2. Deploy sebagai **Web app** dengan **Execute as: Me** dan akses sesuai kebutuhan.
3. Entry point: `doGet`. Sheet (`Master_Klien`, `Master_Produk`, `Master_User`,
   `Penawaran_Main`, `Template_Paket`) dibuat otomatis bila belum ada.

> Kredensial admin default awal: `admin` / `admin123` (segera ganti setelah login).
