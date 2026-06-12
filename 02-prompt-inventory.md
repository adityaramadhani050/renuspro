# Tugas: Implementasi Modul Inventory / Stok (Modul 2 dari 3)

## Konteks Aplikasi

ERP berbasis **Google Apps Script** (web app), frontend **HTML/JS** (`google.script.run`), database **Google Spreadsheet**. Modul existing: Penawaran, Work Order, Invoice, Kwitansi, Produk/Jasa, Template Paket, Customer, dan — dari tahap 1 roadmap — **Supplier, Akun Pembayaran, Purchase Order** (dengan pembayaran termin dan kolom `Qty Diterima` di PO Item).

Modul ini adalah **tahap 2 dari roadmap 3 modul** (PO → Inventory → Pengeluaran Project). Modul Pengeluaran akan dibangun di tahap 3 — jangan dikerjakan sekarang.

Kebijakan harga pokok yang sudah final: **harga beli terakhir** (last purchase price), dan harga beli/HPP di master Produk/Jasa **otomatis tersinkron** mengikuti harga beli terakhir, agar estimasi HPP saat sales membuat penawaran selalu memakai harga terkini.

---

## LANGKAH 0 — Eksplorasi Wajib Sebelum Coding

1. Pelajari implementasi modul PO dari tahap 1 (struktur sheet PO & PO Item, fungsi-fungsi servernya, alur status) serta konvensi kode repo secara umum.
2. Identifikasi dan laporkan untuk konfirmasi saya:
   - Struktur master **Produk/Jasa**: kolom ID produk, kolom harga beli/HPP yang akan disinkron, kolom Tipe (Material/Jasa) hasil tahap 1.
   - Struktur sheet **PO** dan **PO Item** aktual.
3. Ikuti konvensi kode existing. Tunggu konfirmasi mapping sebelum implementasi.

---

## Spesifikasi

### 1. Database

**Sheet `Stok`** (saldo per item, hanya produk bertipe Material): ID Produk, Nama Produk (snapshot), Satuan, Qty Tersedia, Harga Beli Terakhir, Nilai Stok (Qty × Harga Beli Terakhir, dihitung kode), Terakhir Diubah Pada. Sheet ini adalah ringkasan saldo; sumber kebenarannya adalah mutasi — setiap perubahan saldo harus melalui pencatatan mutasi.

**Sheet `Mutasi Stok`** (ledger, append-only): ID Mutasi (format `MUT-YYYYMM-XXX`), Tanggal, ID Produk, Nama Produk (snapshot), Jenis Mutasi, Referensi, Qty Masuk, Qty Keluar, Harga Satuan, Saldo Setelah Mutasi, Keterangan, Dibuat Oleh/Pada.

Jenis Mutasi:
- `Penerimaan PO` (referensi: No PO)
- `Penerimaan Tanpa PO` (stok awal go-live, pembelian tunai langsung; referensi opsional)
- `Penggunaan WO` (referensi: No WO — **dipicu oleh modul tahap 3**, jangan buat UI-nya sekarang, tapi sediakan fungsi server-nya, lihat Titik Integrasi)
- `Penyesuaian +` / `Penyesuaian −` (stock opname, barang rusak/hilang; keterangan wajib)

**Sheet `Penerimaan Tanpa PO`** (opsional — boleh cukup lewat Mutasi Stok jika lebih sederhana, tapi jika pembelian tunai perlu mencatat akun pembayaran, simpan: ID, Tanggal, ID Produk, Qty, Harga Satuan, ID Akun Pembayaran (opsional — kosong untuk stok awal), Keterangan, audit). Catatan: pencatatan akun di sini hanya untuk arsip; **tidak** masuk pengeluaran project mana pun.

### 2. Penerimaan Barang dari PO

Halaman/aksi "Terima Barang" dari detail PO (hanya PO berstatus `Disetujui` atau `Diterima Sebagian`):
- Tampilkan item PO dengan Qty dipesan, Qty sudah diterima, dan input **Qty diterima sekarang** (boleh parsial per item; validasi: tidak melebihi sisa).
- Saat disimpan, untuk setiap item yang diterima: catat mutasi `Penerimaan PO`, tambah Qty Tersedia, **update Harga Beli Terakhir** = harga beli satuan item PO tersebut, update `Qty Diterima` di PO Item, dan **sinkronkan harga beli/HPP di master Produk/Jasa** = harga beli terakhir.
- Update status PO: `Diterima Sebagian` jika belum semua item penuh, `Diterima` jika seluruh item sudah diterima penuh.
- Seluruh rangkaian ini harus konsisten — gunakan LockService dan susun urutan tulis agar jika terjadi error di tengah, jelaskan strategi pemulihannya (minimal: validasi penuh sebelum menulis apa pun, lalu tulis berurutan; log error yang jelas).

### 3. Penerimaan Tanpa PO

Form: pilih produk (Material), tanggal, qty, harga satuan, akun pembayaran (opsional; kosongkan untuk stok awal), keterangan. Efek: mutasi `Penerimaan Tanpa PO`, stok bertambah, harga beli terakhir & HPP master ter-update (kecuali user mencentang opsi "jangan update harga" — berguna untuk stok awal yang harganya historis).

### 4. Penyesuaian Stok (Opname)

Form: pilih produk, jenis (+/−), qty, keterangan wajib (alasan). Penyesuaian memakai harga beli terakhir untuk nilai mutasi. Stok tidak boleh menjadi negatif.

### 5. Halaman Inventory

- **Daftar Stok**: Nama Produk, Satuan, Qty Tersedia, Harga Beli Terakhir, Nilai Stok; baris dengan qty 0 atau di bawah ambang tertentu diberi penanda. Summary: total nilai stok. Pencarian nama produk.
- **Riwayat Mutasi**: tabel mutasi dengan filter produk, jenis mutasi, rentang tanggal; kolom referensi (No PO/No WO) tampil sebagai informasi.
- Tombol menuju form Penerimaan Tanpa PO dan Penyesuaian. (Penerimaan PO diakses dari detail PO.)

## Aturan Bisnis

1. Hanya produk bertipe **Material** yang punya stok; Jasa tidak pernah muncul di inventory.
2. Harga pokok stok = **harga beli terakhir**. Setiap penerimaan (PO maupun tanpa PO, kecuali opsi "jangan update harga") meng-update harga beli terakhir dan menyinkronkan kolom harga beli/HPP master Produk/Jasa.
3. Stok tidak boleh negatif — penggunaan/penyesuaian minus yang melebihi saldo ditolak dengan pesan jelas.
4. Mutasi bersifat append-only (tidak diedit/dihapus). Koreksi dilakukan lewat mutasi penyesuaian baru.
5. Saldo di sheet `Stok` harus selalu konsisten dengan akumulasi mutasi. Sediakan fungsi utilitas "rekalkulasi saldo dari mutasi" yang bisa dijalankan manual jika terjadi ketidaksesuaian.
6. Audit trail di semua pencatatan.

## Titik Integrasi Masa Depan — Tahap 3 (JANGAN buat UI-nya sekarang)

Sediakan **fungsi server** `gunakanStok(noWO, idProduk, qty, tanggal, keterangan)` (nama sesuaikan konvensi) yang: memvalidasi saldo cukup, mencatat mutasi `Penggunaan WO` dengan harga beli terakhir saat itu, mengurangi saldo, dan **mengembalikan harga satuan & total** yang dipakai — modul Pengeluaran tahap 3 akan memanggil fungsi ini dan mencatat hasilnya sebagai pengeluaran project. Sediakan juga fungsi pembatalan penggunaan (mutasi balik) untuk kebutuhan koreksi dari tahap 3.

## Ketentuan Teknis (Google Apps Script + Spreadsheet)

1. `LockService` untuk semua operasi tulis dan generate ID — krusial di modul ini karena satu aksi penerimaan menulis ke banyak sheet (Mutasi, Stok, PO Item, PO header, master Produk/Jasa).
2. Batch read/write (`getValues`/`setValues`); hindari operasi per sel dalam loop.
3. Semua agregasi/saldo dihitung di kode server-side, bukan formula spreadsheet.
4. Validasi dua sisi (client + server). Timezone Asia/Jakarta. Format Rupiah konsisten.
5. Modifikasi modul existing dibatasi pada: update `Qty Diterima` & status di sheet PO (sesuai desain tahap 1) dan update kolom harga beli/HPP di master Produk/Jasa. Selain itu read-only.
6. Sheet baru auto-create dengan header jika belum ada.

## Fase Pengerjaan (commit per fase)

- **Fase 1**: Sheet Stok + Mutasi Stok, halaman Daftar Stok & Riwayat Mutasi, fungsi rekalkulasi saldo.
- **Fase 2**: Penerimaan barang dari PO (parsial per item, update status PO, harga beli terakhir, sinkron HPP master).
- **Fase 3**: Penerimaan Tanpa PO + Penyesuaian Stok + fungsi server `gunakanStok` & pembatalannya (tanpa UI).

## Acceptance Criteria

1. Penerimaan PO parsial berfungsi: terima sebagian item → status `Diterima Sebagian`; terima sisa → status `Diterima`; qty melebihi sisa ditolak.
2. Setiap penerimaan meng-update Qty Tersedia, Harga Beli Terakhir, dan harga beli/HPP di master Produk/Jasa dengan benar (verifikasi: buat penawaran baru setelah penerimaan, HPP item memakai harga baru).
3. Penerimaan tanpa PO dan penyesuaian +/− berfungsi; opsi "jangan update harga" bekerja; keterangan wajib pada penyesuaian.
4. Stok tidak pernah negatif; mutasi append-only; fungsi rekalkulasi menghasilkan saldo identik dengan sheet Stok.
5. Fungsi `gunakanStok` teruji via pengujian server-side: mengurangi saldo, mencatat mutasi `Penggunaan WO` dengan harga beli terakhir, mengembalikan harga & total; gagal dengan pesan jelas jika saldo kurang; fungsi pembatalan mengembalikan saldo.
6. Riwayat mutasi terfilter dengan benar dan saldo setelah mutasi konsisten berurutan.
7. Tidak ada regresi pada modul existing maupun modul PO tahap 1.
