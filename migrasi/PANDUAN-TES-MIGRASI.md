# Checklist Tes Migrasi Supabase (fitur BACA)

Centang tiap item setelah dibuka di aplikasi Vercel dan **dibandingkan dengan
sistem lama** (angka, tanggal, kolom cocok). Fokus: apakah data **tampil benar**.

> Tips: buka **F12 → Console**. Jika ada baris merah `[namaFungsi] ...`, itu
> error dari Supabase (RLS/kolom) — catat & kirim ke saya.
> Semua **TULIS** (simpan/ubah/hapus/approve/terima) masih lewat Apps Script —
> itu normal, belum termasuk fase ini.

## A. Login & Master Data
- [ ] **Login** pakai email + password Supabase
- [ ] Sidebar: nama akun, role, tombol Ganti Password & Logout tampil
- [ ] **Customer** — daftar klien tampil
- [ ] **Supplier** — daftar supplier tampil (tidak "gagal memuat")
- [ ] **Produk / Jasa** — daftar + harga/HPP/tipe
- [ ] **Manajemen User** — daftar user + role + WhatsApp
- [ ] **Pengaturan → Akun Pembayaran** — daftar akun
- [ ] **Pricelist Supplier** — daftar + kategori (dropdown kategori terisi)
- [ ] **Template Paket** — daftar template

## B. Penjualan
- [ ] **Penawaran** — list muncul, angka HPP/profit/margin & tanggal benar
- [ ] Filter status HO di list penawaran berfungsi
- [ ] Form **Penawaran** baru — dropdown **klien** & **produk** terisi, nomor otomatis muncul
- [ ] Pilih **Template Paket** di form penawaran → item ter-isi
- [ ] **Work Order** — list muncul, filter status HO, badge Jenis WO (Jasa/Material) benar
- [ ] Detail WO → panel **Realisasi HPP & Margin** (nilai kontrak, estimasi vs realisasi, breakdown, PO terkait)
- [ ] **Invoice** — list muncul (tanggal, klien, total, status bayar)
- [ ] **Kwitansi** — list muncul; modal kwitansi baru → dropdown invoice terisi

## C. Pembelian & Gudang
- [ ] **Purchase Order** — list muncul (supplier, status, nilai)
- [ ] **Detail PO** — item, pembayaran, request pembayaran, riwayat penerimaan
- [ ] **Request Pembayaran** (di PO) — daftar muncul
- [ ] **Inventory → Mutasi Stok** — daftar mutasi
- [ ] **Inventory → Penerimaan Barang** — PO menunggu + tab riwayat (cepat)
- [ ] **Inventory → Pengiriman Barang** — surat jalan + permintaan kirim (cepat, tidak lama)

## D. Engineering (Site/Lead Engineer)
- [ ] **BOM** home (dashboard) — daftar WO + progress + item; filter site engineer
- [ ] Detail **BOM** per WO — material, status approve, engineer ditugaskan, status kirim
- [ ] **QC** home (dashboard) — daftar WO + progress + antrean review + statistik tim
- [ ] Detail **QC** per WO — checklist + foto + status; ringkasan progress
- [ ] **DED** home (dashboard) — sama seperti QC
- [ ] Detail **DED** per WO — checklist + file + status
- [ ] "Kelola Checklist" DED & QC — master checklist tampil
- [ ] Badge ringkasan BOM/QC/DED di list Work Order benar
- [ ] Daftar "WO tersedia" saat mendaftarkan BOM/QC/DED (hanya WO HO Selesai & belum terdaftar)
- [ ] **Schedule** — daftar WO + timeline tugas; detail per WO

## E. Site Survey & Info WO
- [ ] **Site Survey** — daftar survey
- [ ] Detail Site Survey — data lengkap (peta, PIC, dll.)
- [ ] Panel **Hand Over (HO)** di detail WO — jadwal, MoM, status
- [ ] Info WO untuk Site Engineer (detail jasa/material, catatan)

## F. Keuangan (Cash Manager)
- [ ] **Pemasukan** — daftar + filter (sumber/kategori/akun/tanggal)
- [ ] **Pengeluaran** — daftar + nama project/klien + filter
- [ ] *(Ayat Silang / mutasi antar-akun — masih Apps Script; tabel belum ada di Supabase)*

---

## Belum dimigrasi (masih Apps Script — WAJAR bila lebih lambat)
Kelompok agregasi berat & dokumen (fase berikutnya, kemungkinan View/RPC SQL):
- Dashboard utama (`getDashboardData`), Dashboard WO (`getWorkOrderDashboard`)
- Laporan: Keuangan, Sales, Profitabilitas, Keuntungan Bulanan
- Cash bootstrap (`getCashManagerBootstrap`), Saldo Akun, Detail Kas Project
- Dokumen WO: Kontrak/SPK, BAST, Garansi, Dokumen Project (`getWODokumen`)
- Bootstrap Invoice (`getInvoiceInitialData`)

Tetap Apps Script permanen (bukan tabel): konfigurasi WA, opsi T&C, PDF (base64),
foto QC besar, + Ayat Silang (tabel belum dibuat).

## Kalau ada yang salah
Untuk tiap item yang **tidak cocok/kosong/error**, catat:
1. Nama menu + apa yang salah (kosong? angka beda? tanggal beda?).
2. Pesan merah di Console (F12), jika ada.

Kirim daftarnya ke saya — saya perbaiki per item.
