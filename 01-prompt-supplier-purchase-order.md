# Tugas: Implementasi Modul Master Supplier, Master Akun Pembayaran, dan Purchase Order (Modul 1 dari 3)

## Konteks Aplikasi

Aplikasi ini adalah ERP berbasis **Google Apps Script** (web app) dengan frontend **HTML/JS** (komunikasi via `google.script.run`) dan database **Google Spreadsheet**. Modul yang sudah ada: Penawaran, Work Order, Invoice, Kwitansi, Produk/Jasa, Template Paket, Customer.

Modul **Produk/Jasa** dipakai sales untuk membuat penawaran, berisi: nama material/jasa, unit, harga jual/penawaran, dan harga beli/HPP.

Modul ini adalah **tahap 1 dari roadmap 3 modul** (PO → Inventory → Pengeluaran Project). Modul Inventory dan Pengeluaran akan dibangun di sesi berikutnya — jangan dikerjakan sekarang, tapi desain modul ini harus siap diintegrasikan oleh keduanya (lihat "Titik Integrasi Masa Depan" di bawah).

---

## LANGKAH 0 — Eksplorasi Wajib Sebelum Coding

1. Pelajari struktur repo: file `.gs`, file HTML, pola routing/halaman, helper yang ada, cara baca-tulis sheet, pola penamaan fungsi, pola format ID dokumen (no penawaran, no WO, no invoice), pola UI/CSS, dan mekanisme cetak/PDF yang dipakai invoice/kwitansi.
2. Identifikasi dan laporkan untuk konfirmasi saya:
   - Nama sheet dan struktur kolom **Produk/Jasa** (khususnya: apakah ada field yang membedakan material vs jasa; kolom harga beli/HPP).
   - Nama sheet dan struktur kolom **Work Order** (untuk relasi PO ber-peruntukan WO) serta nilai status WO.
   - Cara identitas user login diketahui (untuk audit trail).
3. **Ikuti konvensi kode yang sudah ada.** Jangan memperkenalkan framework/pola baru.
4. Tunggu konfirmasi saya atas hasil mapping sebelum implementasi.

---

## Spesifikasi

### 1. Master Supplier

**Sheet `Supplier`**: ID Supplier (format `SUP-XXX` atau ikuti pola ID existing), Nama Supplier, Nama PIC, Telepon, Email, Alamat, Catatan, Status (aktif/nonaktif), Dibuat Oleh/Pada, Diubah Oleh/Pada.

Halaman CRUD supplier (daftar + form + edit + nonaktifkan). Supplier yang sudah dipakai PO tidak boleh dihapus, hanya dinonaktifkan.

### 2. Master Akun Pembayaran

**Sheet `Akun Pembayaran`**: ID Akun, Nama Akun, Tipe (Bank / Kas / Personal), Keterangan (opsional, mis. nomor rekening), Status (aktif/nonaktif), audit trail. Contoh isi: "BCA 123xxxx — Perusahaan", "Kas Kantor", "Rama (pribadi)".

CRUD sederhana (boleh di halaman pengaturan sesuai pola existing). Akun yang sudah dipakai transaksi tidak boleh dihapus, hanya dinonaktifkan. Sistem juga membuat satu **akun khusus "Stok"** secara otomatis — tidak bisa diedit/dihapus, tidak bisa dipilih untuk pembayaran PO; akun ini disiapkan untuk modul Pengeluaran (penggunaan stok) di tahap 3.

### 3. Purchase Order

**Sheet `Purchase Order`** (header): No PO (format `PO-YYYYMM-XXX`, counter reset per bulan — sesuaikan pola ID existing), Tanggal PO, ID Supplier, **Peruntukan** ("Stok" atau "Work Order"), No Work Order (wajib diisi jika peruntukan = Work Order; kosong jika Stok), Status PO, Subtotal, Catatan, Status Pembayaran ("Belum Dibayar" / "Dibayar Sebagian" / "Lunas" — dihitung sistem), Total Dibayar (dihitung sistem), audit trail.

Status PO: `Draft` → `Disetujui` → `Diterima Sebagian` → `Diterima` → `Selesai`, plus `Batal`. Catatan: perubahan ke status Diterima Sebagian/Diterima akan dikendalikan oleh **modul Inventory (tahap 2)** melalui proses penerimaan barang. Di modul ini cukup sediakan field statusnya dan transisi Draft → Disetujui → Batal; jangan buat fitur penerimaan barang sekarang.

**Sheet `PO Item`**: ID, No PO, ID Produk (dari master Produk/Jasa), Nama Item (snapshot teks saat itu), Qty, Satuan, Harga Beli Satuan (default dari harga beli master, bisa diedit per PO), Total (Qty × Harga, dihitung kode), Catatan item.

**Sheet `Pembayaran PO`**: ID Pembayaran (format `POP-YYYYMM-XXX`), No PO, Tanggal Bayar, ID Akun Pembayaran, Jumlah, Catatan, audit trail.

### 4. Halaman Purchase Order

**Daftar PO**: kolom No PO, Tanggal, Supplier, Peruntukan (+ No WO jika ada), Subtotal, Status PO, Status Pembayaran, Total Dibayar, Sisa. Filter: status PO, status pembayaran, supplier, peruntukan, rentang tanggal. Pencarian No PO.

**Form buat/edit PO**: pilih supplier (dropdown aktif), tanggal, peruntukan (Stok / Work Order — jika Work Order, pilih WO yang belum closed), tambah baris item: pilih produk dari master Produk/Jasa dengan pencarian (harga beli otomatis terisi dari master, bisa diedit), qty, total per baris dan subtotal PO terhitung realtime. PO hanya bisa diedit saat status `Draft`. Tombol "Setujui" mengubah status ke `Disetujui`; tombol "Batalkan" (dengan konfirmasi) hanya untuk PO yang belum punya pembayaran dan belum ada penerimaan barang.

**Detail PO**: header info, tabel item, riwayat pembayaran, ringkasan: Subtotal — Total Dibayar — **Sisa Tagihan**.

**Form pembayaran** (dari detail PO, hanya untuk PO berstatus minimal `Disetujui` dan belum lunas): tanggal bayar, akun pembayaran (dropdown akun aktif, kecuali akun "Stok"), jumlah (validasi: > 0 dan ≤ sisa tagihan), catatan. Setelah disimpan: Total Dibayar dan Status Pembayaran header ter-update otomatis (Belum Dibayar / Dibayar Sebagian / Lunas). Pembayaran bisa dihapus (dengan konfirmasi) hanya jika PO belum berstatus Selesai — penghapusan harus menghitung ulang status pembayaran.

**Cetak PO**: dokumen PO yang bisa dicetak/diunduh untuk dikirim ke supplier, mengikuti mekanisme dan gaya dokumen existing (invoice/kwitansi): header perusahaan, info supplier, tabel item, total, catatan.

## Aturan Bisnis

1. Item PO hanya dari master Produk/Jasa. Jika hasil eksplorasi menunjukkan master belum membedakan material vs jasa, tambahkan kolom `Tipe` (Material/Jasa) pada sheet master tanpa merusak fitur penawaran existing, lalu konfirmasi ke saya — PO untuk peruntukan Stok hanya boleh berisi item bertipe Material.
2. PO ber-peruntukan Work Order wajib terikat ke satu WO yang valid dan belum closed.
3. Total pembayaran tidak boleh melebihi subtotal PO.
4. Semua nilai exclude PPN (konsisten dengan kebijakan HPP/margin di tahap 3). Jika PO existing perusahaan biasa mencantumkan PPN, cukup tampilkan PPN di dokumen cetak bila perlu, tapi nilai yang dipakai sistem tetap exclude PPN — konfirmasi dulu jika ambigu.
5. Audit trail di semua sheet baru.

## Titik Integrasi Masa Depan (JANGAN dikerjakan sekarang, tapi jangan dihalangi)

- **Tahap 2 (Inventory)**: penerimaan barang per item PO (bisa parsial) akan menambah stok, meng-update status PO ke Diterima Sebagian/Diterima, meng-update harga beli terakhir, dan menyinkronkan harga beli master Produk/Jasa. Desain sheet PO Item agar memungkinkan pencatatan qty diterima per item (boleh siapkan kolom `Qty Diterima`, default 0).
- **Tahap 3 (Pengeluaran)**: setiap pembayaran PO ber-peruntukan Work Order akan otomatis tercatat sebagai pengeluaran project WO tersebut (mencantumkan No PO). Pisahkan logika penyimpanan pembayaran dalam fungsi tersendiri agar tahap 3 mudah menambahkan hook tanpa membongkar kode.

## Ketentuan Teknis (Google Apps Script + Spreadsheet)

1. Gunakan `LockService` saat generate semua ID dan saat menulis data, untuk mencegah race condition / ID ganda.
2. Batch operations: baca/tulis dengan `getValues()`/`setValues()`. Hindari `getValue()`/`setValue()` per sel dalam loop.
3. Semua perhitungan (total item, subtotal, total dibayar, status pembayaran) dilakukan di kode server-side, bukan formula spreadsheet.
4. Validasi di dua sisi: client (UX) dan server (integritas). Server tidak mempercayai payload client begitu saja.
5. Timezone Asia/Jakarta untuk semua tanggal/timestamp (`Utilities.formatDate` dengan timezone eksplisit). Format Rupiah konsisten (titik ribuan, tanpa desimal).
6. Read-only terhadap modul existing, kecuali penambahan kolom `Tipe` di master Produk/Jasa jika diperlukan (poin aturan bisnis 1) — itu pun setelah konfirmasi saya.
7. Sheet baru dibuat otomatis (auto-create dengan header) jika belum ada.
8. Error handling mengikuti pola existing; pesan error jelas ke user.

## Fase Pengerjaan (commit per fase)

- **Fase 1**: Master Supplier + Master Akun Pembayaran (sheet auto-create, CRUD backend + UI).
- **Fase 2**: PO — sheet header & item, form buat/edit, daftar PO, detail PO, alur status Draft/Disetujui/Batal.
- **Fase 3**: Pembayaran PO (termin/parsial) + perhitungan status pembayaran + cetak dokumen PO.

Di akhir tiap fase, jelaskan perubahan dan cara mengujinya.

## Acceptance Criteria

1. CRUD Supplier dan Akun Pembayaran berfungsi; entitas yang sudah dipakai transaksi hanya bisa dinonaktifkan, tidak terhapus.
2. PO bisa dibuat dengan item dari master Produk/Jasa, harga beli default dari master dan bisa diedit; subtotal akurat.
3. PO ber-peruntukan Work Order tervalidasi ke WO aktif; PO ber-peruntukan Stok tidak meminta WO.
4. Pembayaran parsial berfungsi: beberapa pembayaran per PO, sisa tagihan akurat, status pembayaran (Belum/Sebagian/Lunas) ter-update otomatis, pembayaran melebihi sisa tagihan ditolak.
5. No PO dan ID lainnya unik meski input bersamaan (uji LockService).
6. Dokumen cetak PO dihasilkan dengan gaya konsisten dengan dokumen existing.
7. PO status Draft bisa diedit; setelah Disetujui tidak bisa diedit itemnya; Batal hanya untuk PO tanpa pembayaran.
8. Tidak ada regresi pada modul existing (penawaran, work order, invoice, kwitansi, produk/jasa tetap normal).
