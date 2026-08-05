# Panduan Menyiapkan Repo `renuspro-web` untuk Vercel (via Cloud Shell, pemula)

Tujuan: membuat repo baru **`renuspro-web`** berisi frontend hasil build + proxy,
lalu menyambungkannya ke **Vercel** — sehingga aplikasi tampil di internet dengan
UI yang sama, tapi masih memakai backend Apps Script lama (Fase 1).

> **Sebelum mulai**, siapkan **URL `/exec`** dari router Apps Script (hasil Fase 1
> langkah 1.1 di `../00-panduan-migrasi.md`). Nanti dipakai di Vercel.

---

## Langkah 1 — Buka Google Cloud Shell
1. Buka **https://console.cloud.google.com** (login Google).
2. Klik ikon terminal **`>_`** kanan atas ("Activate Cloud Shell"). Tunggu terminal siap.

---

## Langkah 2 — Login GitHub di Cloud Shell (sekali saja)
Ketik:
```bash
gh auth login
```
Jawab pertanyaannya dengan tombol panah + Enter:
- **What account?** → `GitHub.com`
- **Protocol?** → `HTTPS`
- **Authenticate Git with your GitHub credentials?** → `Yes`
- **How to login?** → `Login with a web browser`

Layar menampilkan **kode** (mis. `AB12-CD34`). Salin kode itu, buka link yang
ditampilkan, tempel kode, klik **Authorize**. Selesai — terminal jadi "logged in".

> Kalau perintah `gh` tidak ada, ketik dulu: `sudo apt-get install -y gh`

---

## Langkah 3 — Ambil kode sumber & build frontend
```bash
gh repo clone adityaramadhani050/renuspro
cd renuspro
node migrasi/build.mjs
```
Akan muncul: `✔ dist/index.html ... + dist/gs-run-shim.js`. Itu frontend statis.

---

## Langkah 4 — Susun folder repo baru `renuspro-web`
Salin file-file yang diperlukan ke folder baru:
```bash
mkdir -p ~/renuspro-web/api
cp dist/index.html          ~/renuspro-web/index.html
cp dist/gs-run-shim.js      ~/renuspro-web/gs-run-shim.js
cp migrasi/vercel-proxy.js  ~/renuspro-web/api/gs.js
cat > ~/renuspro-web/vercel.json <<'JSON'
{ "$schema": "https://openapi.vercel.sh/vercel.json", "cleanUrls": true }
JSON
```

Struktur akhir:
```
renuspro-web/
├── index.html
├── gs-run-shim.js
├── vercel.json
└── api/
    └── gs.js
```

---

## Langkah 5 — Buat repo GitHub baru & push
Pertama, kenalkan identitas git ke Cloud Shell (**sekali saja**, ganti dengan
email & nama Anda). Kalau dilewati, `git commit` akan error "Please tell me who you are".
```bash
git config --global user.email "email-anda@contoh.com"
git config --global user.name "Aditya Ramadhani"
```
Lalu:
```bash
cd ~/renuspro-web
git init -b main
git add .
git commit -m "Frontend RenusPro untuk Vercel (Fase 1)"
gh repo create renuspro-web --private --source=. --remote=origin --push
```
Perintah terakhir sekaligus **membuat repo di GitHub** dan **mengunggahnya**.
Selesai — cek di GitHub, repo `renuspro-web` sudah ada.

> Kalau `git commit` sempat gagal tadi (identitas belum diset), ulangi
> `git add . && git commit -m "..."` setelah `git config`, lalu push.
> Kalau `gh repo create` bilang **"Name already exists"**, cukup jalankan
> `git push -u origin main`.

---

## Langkah 6 — Sambungkan ke Vercel
1. Buka **https://vercel.com** → login (boleh pakai akun GitHub).
2. **Add New… → Project** → pilih repo **`renuspro-web`** → **Import**.
3. **Framework Preset**: pilih **Other**. Build Command: kosongkan.
4. Buka **Environment Variables**, tambah:
   - Name: `APPS_SCRIPT_EXEC_URL`
   - Value: URL `/exec` router Apps Script Anda.
5. Klik **Deploy**. Tunggu selesai → klik domain yang diberikan (mis.
   `renuspro-web.vercel.app`).

---

## Langkah 7 — Uji
Buka domain Vercel → login & coba semua menu. Tampilan HARUS sama seperti versi
Apps Script, dan data tetap dari Google Sheets (lewat proxy).

> Kalau muncul error data: cek `APPS_SCRIPT_EXEC_URL` benar, dan router Apps
> Script sudah di-deploy sebagai Web App (Access: Anyone).

---

## Kalau nanti ada perubahan frontend (update)
Setiap kali kode di repo `renuspro` berubah, ulangi build & push:
```bash
cd ~/renuspro && git pull && node migrasi/build.mjs
cp dist/index.html ~/renuspro-web/index.html
cp dist/gs-run-shim.js ~/renuspro-web/gs-run-shim.js
cd ~/renuspro-web && git add . && git commit -m "update frontend" && git push
```
Vercel otomatis mendeploy ulang setiap kali `renuspro-web` di-push. Tidak perlu
setting apa pun lagi.

---

## Catatan
- Repo `renuspro` (Apps Script) **tetap dipakai** sebagai sumber; jangan dihapus.
- `renuspro-web` cukup berisi hasil build + proxy — tidak perlu file `.gs`.
- Nanti saat migrasi ke Supabase (Fase 3+), yang berubah cukup **routing di
  `gs-run-shim.js`** (dan menambah client Supabase) — build & push ulang seperti
  di atas. UI tetap.
