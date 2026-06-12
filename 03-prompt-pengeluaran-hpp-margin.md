# Tugas: Implementasi Modul Pengeluaran Project — Realisasi HPP & Margin (Modul 3 dari 3)

## Konteks Aplikasi

ERP berbasis **Google Apps Script** (web app), frontend **HTML/JS** (`google.script.run`), database **Google Spreadsheet**. Modul existing: Penawaran, Work Order, Invoice, Kwitansi, Produk/Jasa, Template Paket, Customer, plus hasil roadmap tahap sebelumnya: **Supplier, Akun Pembayaran, Purchase Order** (tahap 1) dan **Inventory** (tahap 2, termasuk fungsi server `gunakanStok` dan pembatalannya).

Alur bisnis existing: sales membuat Penawaran (sudah mencantumkan **estimasi HPP**) → deal → generate No Work Order → finance membuat Invoice dari WO → invoice terbayar → Kwitansi otomatis. Work Order adalah pusat monitor & manajemen administrasi project.

Modul ini adalah **tahap final**: pencatatan seluruh pengeluaran per work order untuk menghitung **Realisasi HPP** dan **Realisasi Margin**, dibandingkan dengan estimasi.

---

## LANGKAH 0 — Eksplorasi Wajib Sebelum Coding

1. Pelajari implementasi tahap 1 & 2 (sheet PO, Pembayaran PO, fungsi penyimpanan pembayaran PO, sheet Stok/Mutasi, signature fungsi `gunakanStok` dan pembatalannya, master Akun Pembayaran termasuk akun sistem "Stok") serta konvensi repo.
2. Identifikasi dan laporkan untuk konfirmasi saya:
   - Sheet/kolom **nilai kontrak** work order (pastikan exclude atau include PPN) dan **estimasi HPP** di penawaran, serta relasi penawaran ↔ WO.
   - Nilai status WO, khususnya status closed/selesai.
   - Mekanisme dokumen cetak existing (invoice/kwitansi) untuk dipakai laporan.
3. Ikuti konvensi kode existing. Tunggu konfirmasi mapping sebelum implementasi.

---

## Konsep: Tiga Sumber Pengeluaran Project

Setiap pengeluaran **wajib terikat ke tepat satu work order** dan berasal dari salah satu sumber:

| Sumber | Cara tercatat | Akun Pembayaran | No PO |
|---|---|---|---|
| **Pembayaran PO** (PO ber-peruntukan Work Order) | **Otomatis** — setiap pembayaran PO yang peruntukannya WO langsung tercatat sebagai pengeluaran WO tersebut | Akun yang dipakai membayar PO | Terisi otomatis |
| **Penggunaan Stok** | Diinput dari modul ini; harga satuan otomatis = harga beli terakhir via fungsi `gunakanStok` tahap 2 | Akun sistem "Stok" (otomatis) | — |
| **Pengeluaran Langsung** (jasa tukang, transport & akomodasi, perizinan, dll.) | Input manual oleh finance | Dipilih dari master akun (Bank/Kas/Personal) | Opsional (teks bebas, untuk PO eksternal/nota) |

Catatan penting anti-double-counting:
- Pembelian stok (PO ber-peruntukan Stok, atau penerimaan tanpa PO) **tidak pernah** menjadi pengeluaran project. HPP project hanya menanggung **penggunaan** stoknya.
- Pembayaran PO ber-peruntukan Stok juga **tidak** masuk pengeluaran project mana pun.
- Realisasi HPP project = pembayaran PO-WO + penggunaan stok + pengeluaran langsung. Tidak ada jalur lain.

## Spesifikasi

### 1. Database

**Sheet `Pengeluaran`**: ID Pengeluaran (`EXP-YYYYMM-XXX`), No Work Order (wajib), Tanggal, **Sumber** ("Pembayaran PO" / "Penggunaan Stok" / "Langsung"), No PO (terisi otomatis untuk Pembayaran PO; opsional teks bebas untuk Langsung), ID Referensi (ID Pembayaran PO atau ID Mutasi Stok, untuk sumber otomatis), ID Akun Pembayaran, Deskripsi, Qty, Satuan, Harga Satuan, Total (dihitung kode), Catatan, Dibuat Oleh/Pada, Diubah Oleh/Pada.

### 2. Pencatatan Otomatis dari Pembayaran PO

Tambahkan hook pada fungsi penyimpanan pembayaran PO (tahap 1 sudah menyiapkan fungsinya terpisah): jika PO ber-peruntukan Work Order, otomatis buat baris Pengeluaran (Sumber = Pembayaran PO, deskripsi mis. "Pembayaran PO {No PO} — {Nama Supplier}", total = jumlah pembayaran, akun = akun pembayaran PO, ID Referensi = ID pembayaran). Jika pembayaran PO dihapus (sesuai aturan tahap 1), pengeluaran terkait ikut terhapus. Pengeluaran bersumber Pembayaran PO **tidak bisa diedit/dihapus dari modul Pengeluaran** — kelola dari detail PO; tampilkan keterangan dan tautan/teks pengarah.

### 3. Penggunaan Stok

Form (dari halaman Pengeluaran atau panel WO): pilih WO aktif, pilih item stok (pencarian; tampilkan qty tersedia dan harga beli terakhir), qty dipakai, tanggal, keterangan. Simpan dengan memanggil fungsi `gunakanStok` tahap 2 — harga satuan & total dari hasil fungsi tersebut, akun otomatis "Stok", ID Referensi = ID mutasi. Penghapusan pengeluaran jenis ini memanggil fungsi pembatalan tahap 2 (stok kembali) — dengan konfirmasi.

### 4. Pengeluaran Langsung

Form: pilih WO aktif, tanggal (default hari ini), akun pembayaran (dropdown akun aktif, kecuali "Stok"), No PO (opsional, teks bebas), deskripsi, qty, satuan, harga satuan, catatan. Total realtime di form. Edit & hapus diizinkan selama WO belum closed (hapus dengan konfirmasi).

### 5. Halaman Menu Pengeluaran

Tabel seluruh pengeluaran: ID, Tanggal, No WO, Customer, Sumber, No PO, Akun Pembayaran, Deskripsi, Qty, Satuan, Harga Satuan, Total. Filter: No WO, Sumber, Akun Pembayaran, rentang tanggal; pencarian No PO. Tombol tambah: "Pengeluaran Langsung" dan "Penggunaan Stok". Baris bersumber otomatis ditandai dan aksinya dibatasi sesuai aturan di atas. Fase awal: **tanpa approval workflow dan tanpa upload bukti/nota**.

### 6. Panel "Realisasi HPP & Margin" di Detail Work Order

**Ringkasan:** Nilai Kontrak (excl. PPN), Estimasi HPP (dari penawaran), Realisasi HPP (total pengeluaran WO), Selisih Estimasi vs Realisasi (Rp & %, indikator **hijau** jika realisasi ≤ estimasi, **merah** jika over), Margin Estimasi = (Kontrak − Estimasi HPP) ÷ Kontrak × 100%, Margin Realisasi = (Kontrak − Realisasi HPP) ÷ Kontrak × 100%.

**Breakdown per akun pembayaran** (tabel: akun, total, % — grup "Stok" tersendiri) dan **breakdown per sumber** (Pembayaran PO / Penggunaan Stok / Langsung).

**Daftar pengeluaran WO** + tombol tambah cepat (WO terisi otomatis) + tombol **"Export Laporan Pengeluaran"** (bagian 8). Tampilkan juga daftar PO ber-peruntukan WO ini beserta status pembayarannya — agar terlihat komitmen biaya yang PO-nya belum lunas (sisa tagihan PO belum masuk realisasi).

### 7. Halaman Laporan Profitabilitas Project

Tabel semua WO: No WO, Customer/Project, Tanggal, Status WO, Nilai Kontrak, Estimasi HPP, Realisasi HPP, Selisih (Rp), Margin Estimasi (%), Margin Realisasi (%). Filter periode (tanggal WO) & status; baris dengan margin realisasi < margin estimasi diberi penanda. Summary cards: Total Nilai Kontrak, Total Realisasi HPP, Rata-rata Margin Realisasi (terfilter). Tab/bagian tambahan: **Rekap per Akun Pembayaran** (total pengeluaran per akun dalam periode terfilter — untuk rekonsiliasi rekening; grup "Stok" tersendiri). Export CSV/Excel.

### 8. Export Laporan Pengeluaran per Work Order

Format mengikuti mekanisme dokumen existing (PDF/cetak seperti invoice/kwitansi; jika tidak ada, halaman cetak + export CSV). Struktur:

**A. Header**: "Laporan Pengeluaran Project", No WO, Customer/Project, tanggal cetak.
**B. Ringkasan**: Nilai Kontrak (excl. PPN), Estimasi HPP, Estimasi Margin (Rp & %), Realisasi HPP, Realisasi Margin (Rp & %), Selisih Estimasi vs Realisasi (hemat/over).
**C. Rekap total pengeluaran per akun pembayaran**: Nama Akun | Total | % — termasuk baris "Stok"; baris terakhir TOTAL = Realisasi HPP di B.
**D. Rincian pengeluaran per akun**: dikelompokkan per akun (termasuk grup "Stok"); tiap grup berisi tabel Tanggal | Sumber | No PO | Deskripsi | Qty | Satuan | Harga Satuan | Total, diakhiri **Subtotal akun** yang sama dengan angka akun di C.

Validasi internal: jumlah subtotal D = total C = Realisasi HPP di B. Jika tidak sama, ada bug agregasi yang harus diperbaiki.

## Aturan Bisnis

1. Setiap pengeluaran wajib terikat tepat satu WO; tidak ada pengeluaran overhead non-project di modul ini.
2. Semua perhitungan margin memakai nilai **exclude PPN**. Jika nilai kontrak tersimpan include PPN, konfirmasi cara konversinya dulu.
3. WO berstatus **closed**: seluruh pengeluarannya terkunci (tambah/edit/hapus diblokir, termasuk dari hook pembayaran PO — pembayaran PO untuk WO closed harus ditolak dengan pesan jelas).
4. Edge cases: WO tanpa pengeluaran → Realisasi HPP = Rp 0 tanpa error; estimasi HPP kosong → tampilkan "−" (hindari pembagian nol/NaN); qty/harga ≤ 0 ditolak validasi.
5. Pengeluaran bersumber otomatis (Pembayaran PO, Penggunaan Stok) hanya dikelola lewat sumbernya; integritas ID Referensi dijaga.
6. Audit trail di semua pencatatan; penghapusan selalu dengan dialog konfirmasi.

## Ketentuan Teknis (Google Apps Script + Spreadsheet)

1. `LockService` untuk generate ID dan semua operasi tulis — terutama hook pembayaran PO dan penggunaan stok yang menulis lintas sheet.
2. Batch read/write (`getValues`/`setValues`); agregasi HPP/margin dihitung server-side, bukan formula spreadsheet.
3. Validasi dua sisi (client + server). Timezone Asia/Jakarta. Format Rupiah konsisten (titik ribuan, tanpa desimal).
4. Read-only ke modul existing & modul tahap 1–2, kecuali titik integrasi yang memang disiapkan (hook pembayaran PO, pemanggilan fungsi `gunakanStok`/pembatalan).
5. Sheet baru auto-create dengan header jika belum ada. Error handling mengikuti pola existing.

## Fase Pengerjaan (commit per fase)

- **Fase 1**: Sheet Pengeluaran + pengeluaran Langsung (form, tabel, filter, edit/hapus) — modul sudah berguna sejak fase ini.
- **Fase 2**: Integrasi otomatis — hook pembayaran PO ber-peruntukan WO + form Penggunaan Stok (via fungsi tahap 2) + aturan pengelolaan sumber otomatis.
- **Fase 3**: Panel Realisasi HPP & Margin di detail WO (ringkasan, breakdown, daftar PO terkait).
- **Fase 4**: Laporan Profitabilitas + Rekap per Akun + Export Laporan Pengeluaran per WO.

## Acceptance Criteria

1. Pengeluaran Langsung: CRUD berfungsi, terikat WO aktif, total akurat, terkunci saat WO closed.
2. Pembayaran PO ber-peruntukan WO otomatis memunculkan pengeluaran dengan No PO, akun, dan nominal benar; penghapusan pembayaran PO menghapus pengeluarannya; tidak bisa diedit dari modul Pengeluaran; pembayaran PO ber-peruntukan Stok TIDAK memunculkan pengeluaran.
3. Penggunaan Stok: harga satuan otomatis = harga beli terakhir, stok berkurang, akun "Stok", saldo kurang ditolak; penghapusan mengembalikan stok.
4. Panel WO menampilkan seluruh angka (kontrak, estimasi & realisasi HPP, selisih, kedua margin, breakdown per akun & per sumber) dengan akurat; indikator hijau/merah benar; PO belum lunas milik WO tampil sebagai informasi komitmen.
5. Laporan profitabilitas konsisten dengan panel WO; filter periode dan rekap per akun berfungsi; export terbuka dengan benar.
6. Export Laporan Pengeluaran per WO memuat struktur A–D lengkap dan seluruh angka antar bagian konsisten (subtotal D = rekap C = realisasi B).
7. Tidak ada double counting: pembelian/penerimaan stok dan pembayaran PO-Stok tidak pernah menambah realisasi HPP project mana pun.
8. Tidak ada regresi pada modul existing maupun modul tahap 1–2.
