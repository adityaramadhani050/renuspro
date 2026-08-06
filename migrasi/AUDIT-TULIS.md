# Audit Fungsi TULIS (write) — Roadmap Migrasi ke Supabase

Status per modul. ✅ = sudah override ke Supabase · 🟡 = tabel-sederhana, bisa
client (belum) · 🟠 = transaksi/multi-tabel/hitung → **Edge Function** (aman) ·
🔴 = butuh service_role / Drive / config → khusus.

> Prinsip: begitu TULIS sebuah modul dipindah, input baru masuk Supabase.
> Jangan campur input modul yang sama lewat app lama (Sheets) → nanti berbeda.

## ✅ Sudah dipindah (client)
- **Customer**: simpanCustomer, editCustomer, hapusCustomer
- **Supplier**: simpanSupplier, editSupplier, hapusSupplier
- **Produk/Jasa**: simpanProduk, updateProdukKatalog, hapusProduk
- **Akun Pembayaran**: simpanAkunPembayaran, editAkunPembayaran, hapusAkunPembayaran
- **Bank Account**: saveBankAccounts
- **Kategori pricelist**: tambahKategori, updateKategori, hapusKategori
- **Kategori Pengeluaran**: saveKategoriPengeluaran
- **Catatan WO**: simpanCatatanWO · **Jenis WO**: setWorkOrderJenis

## 🟡 Tabel-sederhana — bisa client (belum, batch berikutnya)
- **Pricelist item**: tambahPricelistItem, updatePricelistItem, hapusPricelistItem, setPricelistReady → `pricelist`
- **Template Paket**: simpanTemplatePaket, hapusTemplatePaket → `template_paket`
- **Schedule**: saveScheduleTask, updateScheduleTask, hapusScheduleTask, saveScheduleTasksBatch, updateScheduleSiteEngineer → `schedule_task`/`schedule_project`
- **Site Survey**: updateSiteSurvey, hapusSiteSurvey → `site_survey`
- **Assignment engineer**: setBOMAssignment, setDEDAssignment, setQCAssignment → `*_assignment`
- **Ayat Silang**: simpanAyatSilang, hapusAyatSilang → `ayat_silang`
- **Checklist flag**: setDEDWajib, setDEDItemNA, setQCItemNA, tandaiDEDSelesai/QC, batalkan…Selesai → `*_item`/`*_project`
- **Engineering item**: tambahDEDItem, updateDEDItem, hapusDEDItem, saveBOMItems → `*_item` (saveBOMItems agak besar)

## 🟠 Transaksi / multi-tabel / hitung — sebaiknya EDGE FUNCTION
Alasan: butuh **nomor urut atomik**, update **banyak tabel**, atau efek
samping (stok, pengeluaran otomatis, HPP). Kalau dipaksa client → rawan
duplikat nomor & data setengah jadi.
- **Penawaran**: (simpanPenawaran*), hapusPenawaran, updateStatusPenawaran
- **Invoice**: simpanInvoice, editInvoice, hapusInvoice, updateStatusBayarInvoice
- **Kwitansi**: simpanKwitansi, editKwitansi, hapusKwitansi
- **PO**: hapusPO, approvePembayaranPO, tolakRequestPembayaranPO, terimaPOItems, terimaPOKirimLangsung
- **Stok**: editItemStok, editMutasiStok, hapusMutasiStok, simpanPenyesuaianStok, simpanPenerimaanTanpaPO
- **BOM procurement**: prosesBOMProcurement, batalkanBOMProcurement, tandaiBeliLangsung, batalTandaiBeliLangsung, ajukanReviewBOM, kirimHasilReviewBOM
- **Pengiriman**: prosesKirim, terimaPengiriman, batalRequestPengiriman
- **Cash**: simpanPemasukanLangsung, editPemasukanLangsung, hapusPemasukan, simpanPengeluaranLangsung, editPengeluaranLangsung, hapusPengeluaran (insert sederhana, tapi berpengaruh ke saldo — bisa client dgn hati-hati)
- **Hand Over**: batalHandOver

## 🔴 Khusus (bukan client biasa)
- **User**: hapusUser, (simpanUser/editUser) → butuh **service_role** (buat/hapus akun Supabase Auth) → Edge Function
- **Config (ScriptProperties)**: saveTCOptions, saveWAConfig, saveWAReminderScheduleConfig, saveDocSignConfig → perlu tabel `app_config` dulu
- **File/Drive**: saveSignatureImage, saveQCFotoAnotasi, simpanQCFotoAnotasi, hapusQCFoto, hapusQCContohFoto, hapusSiteSurveyFoto, hapusDEDFile, hapusWODokumen → simpan file (Drive/Storage) → butuh Supabase Storage
- **Notif/reminder**: kirimReminderExpiredManual → WA (eksternal)

---

## Urutan yang disarankan
1. **🟡 batch tabel-sederhana** (pricelist item, template, schedule, site survey, assignment, ayat silang, checklist flag) — cepat, tanpa deploy.
2. **🟠 transaksi** via **Edge Function** (nomor urut atomik) — mulai invoice/kwitansi/penawaran, lalu PO/stok/pengiriman.
3. **🔴 khusus**: User (auth Edge Function), Config (tabel app_config), File (Supabase Storage).

Tiap kali satu modul selesai tulisnya, tandai ✅ di sini.
