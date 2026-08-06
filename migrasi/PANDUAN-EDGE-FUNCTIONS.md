# Panduan Edge Function Supabase (via Cloud Shell, pemula)

**Edge Function** = potongan kode kecil yang jalan di server Supabase. Kita pakai
untuk fungsi yang **tidak cukup** hanya baca 1 tabel — misal `getStokList` yang
harus **menghitung** stok "hold" dari tabel `bom_item`. Fungsi seperti ini tak
bisa hanya `supa.from('stok').select('*')`, jadi kita jalankan logikanya di
Edge Function.

> Kapan butuh Edge Function? Bila fungsi lama **menghitung** (HPP, margin, hold)
> atau **menulis ke banyak tabel** sekaligus. Fungsi baca sederhana cukup override
> `supa.from(...)` di `supabase-overrides.js` (lihat `PANDUAN-MILESTONE-4.md`).

Contoh siap-pakai di repo: `migrasi/edge-functions/get-stok-list/`.

---

## Prasyarat
- Milestone 1–4 selesai (login Supabase jalan; master data sudah pindah).
- Punya **Project Ref** Supabase: Settings → General → *Reference ID*
  (mis. `abcd1234wxyz`), dan bisa login dashboard Supabase.

---

## Langkah 1 — Pasang Supabase CLI di Cloud Shell
```bash
cd ~/renuspro
# Unduh CLI (sekali saja per sesi Cloud Shell)
curl -fsSL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz \
  -o /tmp/supabase.tar.gz
tar -xzf /tmp/supabase.tar.gz -C ~/  && sudo mv ~/supabase /usr/local/bin/supabase
supabase --version    # pastikan keluar nomor versi
```

## Langkah 2 — Login & hubungkan project
```bash
supabase login        # buka link, tempel token dari dashboard
supabase link --project-ref ISI-PROJECT-REF-ANDA
```
> `login` membuka halaman; klik **Generate token**, salin, tempel di terminal.

## Langkah 3 — Siapkan folder function
CLI membaca folder `supabase/functions/`. Kita salin contoh dari repo:
```bash
mkdir -p supabase/functions/_shared
cp migrasi/edge-functions/_shared/cors.ts        supabase/functions/_shared/cors.ts
cp -r migrasi/edge-functions/get-stok-list       supabase/functions/get-stok-list
```

## Langkah 4 — Deploy
```bash
supabase functions deploy get-stok-list
```
Selesai bila muncul URL fungsi. (Env `SUPABASE_URL` & `SUPABASE_ANON_KEY`
otomatis tersedia di runtime — tak perlu di-set.)

## Langkah 5 — Uji cepat (opsional)
```bash
curl -s -X POST \
  "https://ISI-PROJECT-REF.supabase.co/functions/v1/get-stok-list" \
  -H "Authorization: Bearer ISI-ANON-KEY" \
  -H "Content-Type: application/json" -d '{}' | head -c 500 ; echo
```
Harus keluar array JSON stok. Kalau `[]` kosong tapi tabel `stok` ada isinya,
cek **RLS** (Langkah bawah).

## Langkah 6 — Nyalakan di frontend
Buka override:
```bash
cloudshell edit migrasi/supabase-overrides.js
```
Ubah baris:
```js
var ENABLE_EDGE_STOK = false;   // → ganti jadi true
```
Simpan (**Ctrl+S**), lalu build & push seperti biasa:
```bash
node migrasi/build.mjs
cp dist/index.html            ~/renuspro-web/index.html
cp dist/gs-run-shim.js        ~/renuspro-web/gs-run-shim.js
cp dist/supabase-overrides.js ~/renuspro-web/supabase-overrides.js
cd ~/renuspro-web && git add . && git commit -m "Aktifkan Edge Function stok" && git push
```
Vercel deploy ulang (~1 menit). Buka menu **Inventory** → stok kini dari Supabase.

---

## Kalau ada masalah
| Gejala | Solusi |
|---|---|
| `supabase: command not found` | Ulangi Langkah 1 (CLI hilang tiap sesi Cloud Shell baru) |
| Deploy gagal "not linked" | Jalankan `supabase link --project-ref ...` (Langkah 2) |
| Fungsi balik `[]` padahal ada data | RLS memblokir. Pastikan `00-ddl-supabase-2-trigger-rls.sql` sudah dijalankan & user login (token valid) |
| Inventory kosong setelah aktif | Balik `ENABLE_EDGE_STOK = false`, build & push → kembali ke Apps Script sementara |
| `401 Unauthorized` di curl | anon key salah, atau header `Authorization` kurang |

---

## Edge Function `invoice-ops` (simpan invoice + pelunasan)
Operasi Invoice bersifat finansial & multi-tabel (nomor invoice, hitung DPP/PPN,
saat Lunas otomatis buat Kwitansi + Pemasukan). Karena itu dijadikan Edge
Function (atomik, di server).

1. Salin folder function + shared (sekali):
   ```bash
   cd ~/renuspro
   mkdir -p supabase/functions/_shared
   cp migrasi/edge-functions/_shared/cors.ts   supabase/functions/_shared/cors.ts
   cp -r migrasi/edge-functions/invoice-ops     supabase/functions/invoice-ops
   ```
2. Deploy:
   ```bash
   supabase functions deploy invoice-ops
   ```
   > Function ini memakai **service_role** (otomatis tersedia di runtime sebagai
   > `SUPABASE_SERVICE_ROLE_KEY`) agar bisa menulis banyak tabel dengan konsisten.
   > Tak perlu set env manual.
3. Nyalakan di frontend: `cloudshell edit migrasi/supabase-overrides.js` →
   ubah `var ENABLE_EDGE_INVOICE = false;` jadi `true` → **Ctrl+S**.
4. Build & push seperti biasa (`node migrasi/build.mjs` → salin `dist/` → push).

Uji: buat Invoice baru & tandai **Lunas** → cek invoice, kwitansi, dan pemasukan
otomatis muncul di Supabase. Bandingkan nomor & nilai dengan sistem lama.
Bila salah: balik `ENABLE_EDGE_INVOICE = false`, build & push → kembali Apps Script.

## Membuat Edge Function baru (pola)
1. Bikin folder `supabase/functions/nama-fungsi/index.ts`.
2. Tiru struktur `get-stok-list/index.ts`: import `createClient` + `corsHeaders`,
   tangani `OPTIONS`, baca tabel, **hitung**, balikkan `json(...)`.
3. **Bentuk balikan WAJIB sama persis** dengan fungsi Apps Script lama (nama
   field & tipe), kalau tidak UI rusak. Cek balikan lama di file `.gs` terkait.
4. `supabase functions deploy nama-fungsi`.
5. Tambah override di `supabase-overrides.js` memakai
   `supa.functions.invoke('nama-fungsi', { body: {...} })`.

> **Kandidat Edge Function berikutnya** (punya hitungan/multi-tabel):
> `getWorkOrderList` / `getWorkOrderDashboard` (gabung penawaran+klien+WO, hitung
> hpp/margin), `getRealisasiHPP` (agregasi 3 sumber pengeluaran), `savePenawaran`
> (hitung HPP + tulis banyak baris). Minta saya bantu buatkan satu per satu.
