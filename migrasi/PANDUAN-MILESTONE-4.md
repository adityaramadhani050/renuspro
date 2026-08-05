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

## Setelah login beres — memindahkan modul berikutnya
Pola sama untuk fungsi lain: tambah override di `supabase-overrides.js`, contoh:
```js
window.gsRoute('getProdukList', { mode:'fn', handler: async () => {
  var { data, error } = await supa.from('produk').select('*').order('id');
  return error ? { success:false, message:error.message } : { success:true, list:data };
}});
```
lalu **build → salin → push** seperti Langkah 3–4. Yang belum di-override tetap
lewat Apps Script.

> Fungsi sederhana (baca/tulis tabel) bisa langsung `supa.from(...)`. Fungsi yang
> rumit (hitung HPP/margin, transaksi banyak tabel) sebaiknya jadi **Edge
> Function** Supabase — untuk ini minta saya bantu buatkan per modul.
