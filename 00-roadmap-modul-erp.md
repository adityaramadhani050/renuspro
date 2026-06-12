# Roadmap Pengembangan: PO → Inventory → Pengeluaran (Realisasi HPP & Margin)

Paket ini terdiri dari 3 prompt yang dikerjakan **berurutan** via Claude Code, masing-masing dalam sesi terpisah. Setiap modul harus selesai, teruji, dan di-commit sebelum lanjut ke modul berikutnya.

## Urutan & Dependensi

| Urutan | Modul | File Prompt | Bergantung Pada |
|---|---|---|---|
| 1 | Master Supplier + Akun Pembayaran + Purchase Order (dengan pembayaran termin) | `01-prompt-supplier-purchase-order.md` | Modul existing (Produk/Jasa, Work Order) |
| 2 | Inventory (stok, penerimaan barang, mutasi, harga beli terakhir, sinkron HPP master) | `02-prompt-inventory.md` | Modul 1 (PO) |
| 3 | Pengeluaran Project + Realisasi HPP & Margin + Laporan | `03-prompt-pengeluaran-hpp-margin.md` | Modul 1 & 2 |

## Alur Bisnis End-to-End (Target Akhir)

1. Finance membuat **PO** ke supplier, item diambil dari master Produk/Jasa. Peruntukan PO: **Stok** atau **Work Order tertentu**.
2. Barang diterima → dicatat di **Inventory** → stok bertambah, **harga beli terakhir** ter-update, dan harga beli/HPP di master Produk/Jasa ikut tersinkron (agar estimasi HPP penawaran sales selalu memakai harga terkini).
3. **Pembayaran PO** (bisa parsial/termin) dicatat dengan akun pembayaran. Pembayaran PO yang peruntukannya Work Order otomatis tercatat sebagai **pengeluaran project** WO tersebut (mencantumkan No PO).
4. Work Order memakai stok → **penggunaan stok** dicatat dengan harga beli terakhir secara otomatis → stok berkurang → masuk realisasi HPP project.
5. Pengeluaran lain non-PO (jasa tukang, transport, perizinan, dll.) diinput manual oleh finance, terikat ke WO.
6. Panel **Realisasi HPP & Margin** di detail WO + laporan profitabilitas + export laporan pengeluaran per WO menghitung semuanya.

## Keputusan Desain yang Sudah Final

- Master Supplier: ada, dengan CRUD.
- PO mendukung dua peruntukan: Stok dan Work Order langsung.
- Pembayaran PO bisa parsial/termin; satu PO bisa punya banyak catatan pembayaran.
- Harga pokok stok: **harga beli terakhir** (bukan rata-rata, bukan FIFO).
- Harga beli/HPP di master Produk/Jasa **otomatis ter-update** mengikuti harga beli terakhir dari penerimaan barang.
- Stok bisa masuk **tanpa PO** (stok awal saat go-live, pembelian tunai langsung) + penyesuaian stok (opname).
- Pengeluaran project dihitung dari 3 sumber: pembayaran PO ber-peruntukan WO (otomatis), penggunaan stok (otomatis, akun sistem "Stok"), dan input manual.
- Nilai kontrak & seluruh perhitungan margin memakai angka **exclude PPN**.
- WO berstatus closed → seluruh data pengeluaran terkait terkunci.
- Fase awal: tanpa approval workflow dan tanpa upload bukti/nota.

## Cara Eksekusi

Untuk setiap prompt: jalankan Claude Code dalam **plan mode** dulu, review rencananya, baru izinkan implementasi. Minta commit per fase sesuai pembagian fase di masing-masing prompt. Uji dengan data nyata sebelum lanjut ke modul berikutnya.
