# Struktur Proyek RenusPro

Aplikasi Google Apps Script (web app) untuk dashboard sales & pembuat penawaran.
Kode di-restrukturisasi **per fitur** agar mudah dirawat. Saat runtime, GAS
menggabungkan seluruh file `.gs`, dan `Index.html` menyusun seluruh partial
HTML lewat `<?!= include('NamaFile'); ?>` — sehingga pemecahan ini **tidak
mengubah perilaku**, hanya kerapian.

## Backend (`.gs`)

| File | Isi |
|------|-----|
| `Main.gs` | `doGet()` (templating), helper `include()`, `getSpreadsheet()`, `getActiveUserName()` |
| `Dashboard.gs` | `getDashboardRawData()` — data mentah untuk kalkulasi KPI di klien |
| `Penawaran.gs` | list, riwayat revisi, `getInitialData`, generate nomor, simpan, revisi, status, hapus |
| `Produk.gs` | list, simpan, edit, hapus produk/jasa |
| `Customer.gs` | list, simpan, edit, hapus klien |
| `TemplatePaket.gs` | map template, simpan, hapus |
| `PdfExport.gs` | `exportQuotationDariTemplate()` + helper (batch API) |
| `Auth.gs` | login, sesi, manajemen user (`Master_User`) |
| `SheetInit.gs` | pembuatan sheet default (fallback) |

> Fungsi `getTcPdfJasaB64` / `getTcPdfMaterialB64` (untuk lampiran T&C PDF)
> berada di file `.gs` lain di luar repo ini, dan ter-resolve otomatis saat runtime.

## Frontend (`Index.html` + partial)

`Index.html` kini hanya kerangka (head, sidebar, header, area konten) + daftar `include`.

**Tampilan/markup:** `Styles.html`, `Page_Dashboard.html`, `Page_Penawaran.html`,
`Page_Produk.html`, `Page_Template.html`, `Page_Customer.html`, `Page_Users.html`,
`Modals.html` (semua modal + login screen + template baris item).

**JavaScript per fitur (urutan include = urutan eksekusi asli):**
`JS_Backdrop` → `JS_Core` → `JS_Dashboard` → `JS_Penawaran_List` →
`JS_Form_Penawaran` → `JS_Riwayat` → `JS_Template` → `JS_Penawaran_Misc` →
`JS_Pdf` → `JS_Auth_Users` → `JS_Sidebar_Misc` → `JS_SearchableDropdown` →
`JS_DashboardFilter` → `JS_Pagination`.

## Debugging & Refactoring yang dilakukan

1. **Dead code dihapus** (genuinely ter-shadow, tanpa mengubah perilaku):
   - Backend `getDashboardStats()` (~325 baris) — tak lagi dipakai sejak dashboard
     pindah ke `getDashboardRawData()` + kalkulasi di klien.
   - Definisi duplikat di frontend yang selalu ditimpa versi terakhir:
     `loadPenawaran` (2×), `loadProduk`, `loadCustomer`, `loadTemplate`,
     `filterPenawaran`, `resetFilterPenawaran`, `filterTabel`, dan blok
     `window.onload` pertama. Versi final (dengan pagination) tetap dipakai.
2. **Verifikasi**: seluruh partial JS + gabungannya lolos `node --check`; inventaris
   fungsi frontend identik dengan versi lama (tidak ada fungsi live yang hilang);
   inventaris fungsi backend hanya kehilangan `getDashboardStats` (disengaja).

## Cara deploy

Unggah seluruh file `.gs` dan `.html` ke proyek Apps Script (mis. via `clasp push`).
Entry point tetap `doGet`. Pastikan deploy **Execute as: Me** agar akses sheet konsisten.
