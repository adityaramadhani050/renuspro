      // ── CATATAN untuk modul berikutnya (BELUM di-override) ─────────────────
      //  Fungsi berikut punya FIELD HITUNGAN / agregasi / logika multi-tabel,
      //  JANGAN dibuat `supa.from(...)` mentah — pindahkan sebagai EDGE FUNCTION
      //  / RPC (milestone berikutnya). Sementara tetap lewat Apps Script:
      //   • getWorkOrderList / getWorkOrderDashboard → gabung penawaran+klien+WO,
      //     hitung jenisWO/hpp/margin
      //   • get*Dashboard (BOM/DED/QC), get*SummaryByWO → agregasi
      //   • getFinanceReportData, getSalesReportData, getLaporanProfitabilitas,
      //     getLaporanKeuntunganBulanan, getRealisasiHPP → laporan/agregasi
      //   • getCashManagerBootstrap, getSaldoAkun, getDetailKasProjectWO → hitung
      //   • get*Bundle / get*InitialData → gabungan banyak tabel (bootstrap)
      //   • getKategoriPengeluaran, getBankAccounts, getWAConfig, *PdfB64, dll →
      //     dari ScriptProperties / Drive (bukan tabel) → tetap di Apps Script
      //  Lihat supabase/functions/ + PANDUAN-EDGE-FUNCTIONS.md.

      console.log('[supabase-overrides] aktif — login + master data + baca (M5 b1-b9 + M6 WO+HPP+BOM+QC+DED+dashboards) memakai Supabase.');
    })
    .catch(function (e) { console.error('[supabase-overrides] gagal memuat supabase-js:', e); });
})();
