# Setup Sheet Template_Invoice & Template_Kwitansi

Fitur Invoice (dan nanti Kwitansi) meng-export PDF dari **sheet template**
dengan mengisi **named range**, lalu menyisipkan baris item & footer secara
dinamis — sama persis seperti mekanisme `Template_Quotation`.

Agar export berfungsi, sheet **Template_Invoice** wajib punya named range berikut.

## Cara membuat named range
1. Buka sheet **Template_Invoice**.
2. Klik sel yang dimaksud (lihat tabel di bawah).
3. Menu **Data → Named ranges** → **Add a range** → ketik nama persis → **Done**.

## Daftar named range Template_Invoice

| Named range | Tunjuk ke sel | Isi otomatis |
|---|---|---|
| `inv_no` | sel di sebelah label **No.** | Nomor invoice (271/RGI-INV/VI/2026) |
| `inv_tanggal` | sel di sebelah **Date** | Tanggal invoice |
| `inv_no_po` | sel di sebelah **No. PO** | No PO pelanggan |
| `inv_tgl_po` | sel di sebelah **Tgl. PO** | Tanggal PO pelanggan |
| `inv_klien_nama` | sel di sebelah **Name :** | Nama klien |
| `inv_klien_perusahaan` | sel di sebelah **Perusahaan :** | Perusahaan klien |
| `inv_klien_alamat` | sel di sebelah **Alamat :** | Alamat klien |
| `inv_klien_kontak` | sel di sebelah **No.Telp :** | Kontak klien |
| `inv_item_zona_start` | **baris jangkar** di tabel item (1 baris kosong tepat di bawah header tabel `No / Description / Qty / Unit / Price / Amount`) | Titik mulai penyisipan baris item |

### Penting soal `inv_item_zona_start`
- Tunjuk ke **satu baris** (boleh 1 sel saja, mis. `A14`) yang berada **tepat di bawah baris header tabel**.
- Semua baris di **bawah** baris jangkar ini akan **dihapus & ditulis ulang** setiap export. Jadi jangan taruh konten tetap (footer/ttd) di sheet — footer dibuat otomatis oleh sistem.
- Format baris jangkar (border, font, alignment) akan **dicontoh** untuk seluruh baris item.

### Struktur kolom tabel item (samakan dengan Template_Quotation)
| Kolom | Isi |
|---|---|
| A | No |
| B–D (merge) | Description |
| E | Qty |
| F | Unit |
| G | Price (IDR) |
| H | Amount (IDR) |

> Footer (TOTAL, PPN, GRAND TOTAL, Terbilang, Catatan, Tanda tangan) **digenerate
> otomatis** di bawah baris item — tidak perlu dibuat manual di sheet.

### Isi otomatis zona item (layout baru)
Sistem mengisi zona item dengan satu **baris tagihan utama** lalu **scope read-only**:
- **Baris A**: `A | <Nama Project> | Qty=1 | Unit=Ls | Price=DPP | Amount=DPP`
- Baris keterangan pembayaran: mis. *"DP 30% dari total kontrak Rp 119.000.000"*
- Label **"Deskripsi:"** lalu rincian scope dari penawaran (kelompok + item:
  deskripsi, qty, unit — **tanpa harga**).

## Daftar named range Template_Kwitansi

Buat sheet **Template_Kwitansi** (desain bebas: kop, judul "KWITANSI", dll),
lalu tambahkan named range berikut. Kwitansi **tidak** punya baris dinamis —
sistem hanya mengisi sel-sel ini lalu export.

| Named range | Tunjuk ke sel | Isi otomatis |
|---|---|---|
| `kw_no` | sel di sebelah **Nomor** | No kwitansi (178/RGI-KW/XII/2025) |
| `kw_metode` | sel di sebelah **Pembayaran** | Metode (Transfer/Tunai) |
| `kw_ref_invoice` | sel di sebelah **No. Invoice** | No invoice terkait |
| `kw_terima_dari` | sel di sebelah **Sudah Terima Dari** | Nama klien/pembayar |
| `kw_terbilang` | sel di sebelah **Banyaknya Uang** | Jumlah dalam huruf + "Rupiah" (Title Case) |
| `kw_untuk` | sel di sebelah **Untuk Pembayaran** | Deskripsi pembayaran |
| `kw_jumlah` | sel nominal besar (mis. `Rp7.490.600`) | Jumlah angka — beri format sel `"Rp"#,##0` |
| `kw_tanggal` | sel tanggal kanan (mis. *Surabaya, 24 Desember 2025*) | Otomatis terisi `Surabaya, <tgl panjang>` |

> - `kw_jumlah` diisi **angka** — format tampilan (Rp, ribuan) diatur lewat format sel.
> - `kw_tanggal` sudah termasuk prefix **"Surabaya, "** + tanggal format panjang Indonesia.
> - Karena tidak ada baris dinamis, **tidak perlu** named range zona item untuk kwitansi.

## Sheet data (dibuat otomatis)
- **Invoice_Main** — dibuat otomatis saat invoice pertama disimpan (tak perlu manual).
