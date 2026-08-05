# Panduan Milestone 4 — Pindahkan Login ke Supabase (via Cloud Shell)

Milestone 4 = memindahkan fungsi backend ke Supabase **satu per satu**, tanpa
mengubah tampilan. Kita mulai dari **login**, supaya aplikasi bisa dipakai dengan
**email + password Supabase** (yang dibuat di Milestone 3).

> Cara kerjanya: file `migrasi/supabase-overrides.js` "membajak" fungsi `loginUser`
> agar memvalidasi ke Supabase Auth. Fungsi lain yang belum dipindah tetap jalan
> lewat Apps Script lama (data masih dari Sheets — itu normal untuk sekarang).

## Prasyarat
- Milestone 1–3 selesai (aplikasi jalan di Vercel; akun Supabase Auth sudah dibuat).
- Punya **Project URL** & **anon key** Supabase (Settings → API → *anon public*).
  > anon key **boleh** ada di frontend (aman; data dijaga RLS).

---

## Langkah 1 — Ambil skrip terbaru
Di Cloud Shell:
```bash
cd ~/renuspro
git pull origin claude/eloquent-heisenberg-swy9m6
```

## Langkah 2 — Isi konfigurasi Supabase
Buka file untuk diedit:
```bash
cloudshell edit migrasi/supabase-overrides.js
```
Di Editor, cari 2 baris ini (dekat atas) dan **ganti nilainya**:
```js
var SUPABASE_URL  = 'ISI_PROJECT_URL';   // → https://xxxx.supabase.co milik Anda
var SUPABASE_ANON = 'ISI_ANON_KEY';      // → anon public key Anda
```
Simpan: **Ctrl+S**.

> Kalau ingin perubahan ini tersimpan permanen di repo (opsional):
> `git add migrasi/supabase-overrides.js && git commit -m "config supabase" && git push`

## Langkah 3 — Build ulang frontend
```bash
node migrasi/build.mjs
```
Hasil `dist/` kini menyertakan `supabase-overrides.js`.

## Langkah 4 — Salin ke repo Vercel & push
```bash
cp dist/index.html            ~/renuspro-web/index.html
cp dist/gs-run-shim.js        ~/renuspro-web/gs-run-shim.js
cp dist/supabase-overrides.js ~/renuspro-web/supabase-overrides.js
cd ~/renuspro-web
git add .
git commit -m "Login pakai Supabase (Milestone 4)"
git push
```
Vercel otomatis mendeploy ulang (~1 menit).

## Langkah 5 — Uji login
1. Buka domain Vercel Anda.
2. Di kolom **Username**, ketik **EMAIL** Anda (dari file `provisioned-users.csv`),
   dan password-nya. *(Kolomnya masih bertulisan "Username", tapi isi dengan email.)*
3. Klik **Masuk**. Harus berhasil masuk seperti biasa.

> Setelah ini, **login memakai Supabase**; menu & data lain masih dari Sheets
> (lewat Apps Script) — itu benar. Modul lain dipindah menyusul.

---

## Kalau ada masalah
| Gejala | Solusi |
|---|---|
| "Masukkan EMAIL (bukan username)" | Ketik email, bukan username, di kolom login |
| "Email atau password salah" | Cek email/password di `provisioned-users.csv`; pastikan akun ada di Supabase → Authentication → Users |
| "Profil user tidak ditemukan di app_user" | Kolom `auth_uid` di `app_user` belum terisi → ulangi provisioning (`PANDUAN-CLOUD-SHELL.md`) |
| Login masih pakai cara lama (username) | `supabase-overrides.js` belum diisi URL/anon, atau belum ter-build & ter-push. Cek Console browser (F12) untuk pesan `[supabase-overrides] aktif` |
| Error CORS/`app_user` tidak terbaca | Jalankan `00-ddl-supabase-2-trigger-rls.sql` (policy STARTER mengizinkan user login membaca profilnya) |

---

## Setelah login beres — modul MASTER DATA sudah ikut pindah
`supabase-overrides.js` **sudah berisi** override untuk master data (aktif
otomatis begitu URL/anon diisi & di-build):

| Fungsi | Menu | Sumber Supabase |
|---|---|---|
| `getCustomerList` | Master Klien | tabel `klien` |
| `getSupplierList` | Master Supplier | tabel `supplier` |
| `getProdukList` | Master Produk/Jasa | tabel `produk` |
| `getUserList` | Manajemen User | tabel `app_user` |
| `getAkunPembayaranList` | Akun Pembayaran | tabel `akun_pembayaran` |
| `getKategoriList` | Kategori Pricelist | tabel `pricelist_kategori` |

Jadi cukup **build → salin → push** (Langkah 3–4) sekali lagi, dan menu-menu di
atas langsung membaca dari Supabase. Fungsi yang belum di-override tetap lewat
Apps Script — itu normal.

### Menambah modul baca sederhana sendiri
Pola sama, tambahkan di `supabase-overrides.js`:
```js
window.gsRoute('namaFungsi', { mode:'fn', handler: async () => {
  var { data, error } = await supa.from('nama_tabel').select('*').order('id');
  return error ? { success:false, message:error.message } : { success:true, list:data };
}});
```
> **Bentuk balikan wajib sama persis** dengan Apps Script lama (nama field
> camelCase). Petakan kolom snake_case → camelCase seperti contoh yang sudah ada.

### Fungsi yang butuh hitungan → Edge Function
Fungsi rumit (hitung HPP/margin/stok-hold, tulis banyak tabel) **tidak bisa**
sekadar `supa.from(...)`. Itu jadi **Edge Function**. Contoh lengkap + panduan
deploy via Cloud Shell: **`PANDUAN-EDGE-FUNCTIONS.md`** (mulai dari `getStokList`).
