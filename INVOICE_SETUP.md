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
| `inv_item_zone_start` | **baris jangkar** di tabel item (1 baris kosong tepat di bawah header tabel `No / Description / Qty / Unit / Price / Amount`) | Titik mulai penyisipan baris item |

### Penting soal `inv_item_zone_start`
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

> Footer (Subtotal/DPP, PPN, TOTAL, Terbilang, Catatan, Tanda tangan) **digenerate
> otomatis** di bawah baris item — tidak perlu dibuat manual di sheet.

## Template_Kwitansi (menyusul)
Sheet & named range untuk kwitansi akan didokumentasikan saat fitur Kwitansi dibuat.
Rencana named range: `kw_no`, `kw_tanggal`, `kw_terima_dari`, `kw_jumlah`,
`kw_terbilang`, `kw_untuk`, `kw_ref_invoice`.

## Sheet data (dibuat otomatis)
- **Invoice_Main** — dibuat otomatis saat invoice pertama disimpan (tak perlu manual).
