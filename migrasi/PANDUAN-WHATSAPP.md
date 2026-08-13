# Panduan Migrasi WhatsApp (aktifkan setelah deploy)

Semua WA di-gate `ENABLE_WA` (default **false**). Selama false, config &
notifikasi WA tetap lewat Apps Script (aman). Aktifkan HANYA setelah langkah di
bawah selesai — supaya tidak split-brain.

## Komponen
- `wa-send` (Edge Function) — kirim pesan; pegang endpoint/token (dari
  `app_config` key `WA_CONFIG`). Token TAK pernah di browser.
- `wa-reminder` (Edge Function) — reminder harian penawaran expired; dipanggil
  pg_cron tiap jam, cek jam WIB sendiri.
- Fragmen `migrasi/overrides/830-whatsapp.js` — config + komposer notifikasi.
- Notifikasi tertanam sudah dipasang kembali di override tulis (review QC/DED,
  assign, PO ke gudang, barang diterima, request/hasil pembayaran).

## Langkah aktivasi (urut)
1. **SQL** (sekali): jalankan `00-ddl-app-config.sql` bila belum (tabel `app_config`).
2. **Deploy Edge Function** (Cloud Shell):
   ```bash
   cd ~/renuspro
   mkdir -p supabase/functions/_shared
   cp supabase/functions/_shared/cors.ts supabase/functions/_shared/cors.ts
   cp -r supabase/functions/wa-send      supabase/functions/wa-send
   cp -r supabase/functions/wa-reminder  supabase/functions/wa-reminder
   supabase functions deploy wa-send
   supabase functions deploy wa-reminder
   ```
3. **Nyalakan gate**: `cloudshell edit migrasi/overrides/830-whatsapp.js` →
   ubah `var ENABLE_WA = false;` jadi `true` → simpan.
4. **Build & deploy** (seperti biasa): `node migrasi/build.mjs` → salin `dist/`
   ke `~/renuspro-web` → push.
5. **Isi ulang config WA** di menu **Pengaturan → WA Bot** (endpoint Baileys,
   target/grup, token, aktif). Config lama ada di ScriptProperties Apps Script —
   TIDAK ikut pindah otomatis, jadi isi sekali di sini (tersimpan ke `app_config`).
   Klik **Test** untuk memastikan tersambung.
6. **pg_cron reminder**: jalankan `00-wa-cron.sql` di Supabase SQL Editor (ganti
   `ISI-PROJECT-REF` + `ISI-SERVICE-ROLE-KEY`). Menjadwalkan `wa-reminder` tiap
   jam; function-nya kirim hanya saat jam WIB == jadwal (dari Settings).
   Uji manual: buka `{URL}/functions/v1/wa-reminder?force=1`.

## Uji
- Test WA (Pengaturan) → pesan masuk ke grup target.
- Review 1 item QC/DED → site engineer yang ditugaskan dapat DM.
- Tombol "Kirim Reminder Manual" penawaran → grup dapat rekap.
- `?force=1` pada wa-reminder → grup dapat reminder harian.

## Rollback
Balik `ENABLE_WA = false`, build & push → config & notifikasi WA kembali ke
Apps Script. (pg_cron bisa dinonaktifkan: `select cron.unschedule('wa-reminder-hourly');`.)

## Catatan
- Cooldown reminder manual (30 mnt) disimpan di localStorage (per browser).
- Toggle per-modul: `qcNotif`/`dedNotif` di `WA_CONFIG` (default ON).
- Notifikasi best-effort — kegagalan WA tak pernah menggagalkan aksi utama.
