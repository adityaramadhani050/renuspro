      // ── Data Kontrak/SPK per WO (WorkOrder.gs → getKontrakData) ───────────
      window.gsRoute('getKontrakData', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString().trim();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          var base = await _woDocBase(noWO);
          if (!base) return { success: false, message: 'Work Order tidak ditemukan.' };
          var row = base.row;
          var nilaiKontrak = parseFloat(row.subtotal) || 0;
          var tc = _jsonObj(row.term_conditions); var k = tc.kontrak || {};
          var d = _woAnyDate(row.tanggal_deal) || new Date();
          var spk = _woSeq(noWO) + '/RGI/SPK/' + _WO_ROMAWI[d.getMonth() + 1] + '/' + d.getFullYear();
          var termins;
          if (Array.isArray(k.termins) && k.termins.length) {
            termins = k.termins.map(function (t) { return { persen: Number(t.persen) || 0, ket: String(t.ket || '') }; });
          } else {
            termins = [
              { persen: Number(k.terminDP) || 0, ket: 'From PO' },
              { persen: Number(k.terminTermin) || 0, ket: 'Material On Site' },
              { persen: Number(k.terminPelunasan) || 0, ket: 'After BAST' }
            ];
          }
          return {
            success: true, noWO: noWO, namaProject: row.nama_project || '', spkNomor: spk,
            klien: { nama: row.nama_klien || '', alamat: base.alamat }, nilaiKontrak: nilaiKontrak,
            tanggal: { hari: _WO_HARI[d.getDay()], tgl: d.getDate(), bulan: _WO_BULAN[d.getMonth()], tahun: d.getFullYear() },
            termins: termins, leadTimeHari: Number(k.leadTimeHari) || 0,
            garansi: { instalasi: Number(k.garansiInstalasi) || 0, panel: Number(k.garansiPanel) || 0, inverter: Number(k.garansiInverter) || 0, baterai: Number(k.garansiBaterai) || 0 },
            rekening: _woParseBank(await _woInvoiceBankText(noWO))
          };
        }
      });

      // ── Bootstrap Invoice (Invoice.gs → getInvoiceInitialData) ────────────
      //  woList (dari _woListData) diperkaya nilai tagihan + daftar penawaran
      //  pre-deal (untuk invoice DP sebelum deal). nextNo dibuat saat simpan.
      window.gsRoute('getInvoiceInitialData', {
        mode: 'fn',
        handler: async function () {
          try {
            var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
            var woList = await _woListData();
            var res = await Promise.all([
              _safe(_all('invoice', 'no_wo,no_penawaran,dpp')),
              _safe(_all('penawaran', 'no_penawaran,rev,tanggal,nama_project,klien_id,subtotal,diskon,pajak,grand_total,items,status,no_wo')),
              _safe(_all('klien', 'id,nama_klien'))
            ]);
            var tagihMap = {}, tagihByPen = {};
            (res[0].data || []).forEach(function (r) {
              var dpp = parseFloat(r.dpp) || 0;
              if (r.no_wo) tagihMap[r.no_wo] = (tagihMap[r.no_wo] || 0) + dpp;
              if (r.no_penawaran) tagihByPen[r.no_penawaran] = (tagihByPen[r.no_penawaran] || 0) + dpp;
            });
            var klienMap = {}; (res[2].data || []).forEach(function (k) { klienMap[k.id] = k.nama_klien || ''; });

            var woEnriched = woList.map(function (w) {
              var nilaiKontrak = Math.max(0, (w.subtotal || 0) - (w.diskon || 0));
              var ppnRate = nilaiKontrak > 0 ? Math.round((w.pajak || 0) / nilaiKontrak * 100) : 0;
              var ditagihDpp = tagihMap[w.noWO] || 0;
              return {
                noWO: w.noWO, isPredeal: false, id: w.id, rev: w.rev, tanggal: w.tanggal,
                namaProject: w.namaProject, namaKlien: w.namaKlien, klienId: w.klienId,
                subtotal: w.subtotal, diskon: w.diskon, pajak: w.pajak, grandTotal: w.grandTotal,
                items: w.items, nilaiKontrak: nilaiKontrak, ppnRate: ppnRate,
                ditagihDpp: ditagihDpp, sisaDpp: Math.max(0, nilaiKontrak - ditagihDpp)
              };
            });

            // Penawaran pre-deal: bukan status Deal & belum punya WO, rev tertinggi.
            var latestRev = {};
            (res[1].data || []).forEach(function (r, i) {
              var id = (r.no_penawaran || '').toString(); if (!id) return;
              var status = (r.status || '').toString(); var noWO = (r.no_wo || '').toString();
              if (status === 'Deal' || noWO) return;
              var rev = parseInt(r.rev) || 0;
              if (!latestRev[id] || rev > latestRev[id].rev) latestRev[id] = { rev: rev, row: r };
            });
            var penawaranPreDeal = Object.keys(latestRev).map(function (id) {
              var r = latestRev[id].row;
              var subtotal = parseFloat(r.subtotal) || 0, diskon = parseFloat(r.diskon) || 0, pajak = parseFloat(r.pajak) || 0;
              var nilaiKontrak = Math.max(0, subtotal - diskon);
              var ppnRate = nilaiKontrak > 0 ? Math.round(pajak / nilaiKontrak * 100) : 0;
              var ditagihDpp = tagihByPen[id] || 0;
              return {
                noWO: '', isPredeal: true, id: id, rev: (r.rev != null ? r.rev : '0').toString(),
                tanggal: _fmtTgl(r.tanggal), namaProject: r.nama_project || '',
                namaKlien: klienMap[r.klien_id] || r.klien_id || '', klienId: r.klien_id || '',
                subtotal: subtotal, diskon: diskon, pajak: pajak, grandTotal: parseFloat(r.grand_total) || 0,
                items: _jsonStr(r.items, '[]'), nilaiKontrak: nilaiKontrak, ppnRate: ppnRate,
                ditagihDpp: ditagihDpp, sisaDpp: Math.max(0, nilaiKontrak - ditagihDpp), status: r.status || ''
              };
            }).sort(function (a, b) { return b.id.localeCompare(a.id, undefined, { numeric: true }); });

            return { success: true, woList: woEnriched, penawaranPreDeal: penawaranPreDeal, nextNo: '' };
          } catch (e) {
            return { success: false, error: String(e), woList: [], penawaranPreDeal: [], nextNo: '' };
          }
        }
      });

      // ── Laporan Profitabilitas (Pengeluaran.gs → getLaporanProfitabilitas) ─
      window.gsRoute('getLaporanProfitabilitas', {
        mode: 'fn',
        handler: async function (args) {
          var params = args[0] || {};
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(_all('pengeluaran', 'no_wo,nama_akun,total')),
            _safe(_all('penawaran', 'no_penawaran,rev,tanggal,nama_project,dibuat_oleh,klien_id,subtotal,diskon,total_hpp,status,no_wo')),
            _safe(_all('klien', 'id,nama_klien'))
          ]);
          var expByWO = {}, expByAkun = {};
          (res[0].data || []).forEach(function (r) {
            var noWO = (r.no_wo || '').toString().trim(); var total = parseFloat(r.total) || 0; var akun = (r.nama_akun || '').toString();
            expByWO[noWO] = (expByWO[noWO] || 0) + total; expByAkun[akun] = (expByAkun[akun] || 0) + total;
          });
          var klienMap = {}; (res[2].data || []).forEach(function (k) { klienMap[k.id] = k.nama_klien || ''; });
          var latestRev = {};
          (res[1].data || []).forEach(function (r) { var noPen = (r.no_penawaran || '').toString(); if (!noPen) return; var rev = parseInt(r.rev) || 0; if (!latestRev[noPen] || rev > latestRev[noPen].rev) latestRev[noPen] = { rev: rev, row: r }; });
          var rows = [];
          Object.keys(latestRev).forEach(function (noPen) {
            var r = latestRev[noPen].row;
            var status = (r.status || '').toString();
            var noWO = (r.no_wo || '').toString().trim();
            if (!noWO || (status !== 'Deal' && status !== 'Closed')) return;
            if (params.status && params.status !== status) return;
            var tanggal = _fmtTgl(r.tanggal);
            if (!_inDateRange(tanggal, params.tanggalDari, params.tanggalSampai)) return;
            var nilaiKontrak = Math.max(0, (parseFloat(r.subtotal) || 0) - (parseFloat(r.diskon) || 0));
            var estimasiHPP = parseFloat(r.total_hpp) || 0;
            var realisasiHPP = expByWO[noWO] || 0;
            var margEst = nilaiKontrak > 0 ? (nilaiKontrak - estimasiHPP) / nilaiKontrak * 100 : null;
            var margReal = nilaiKontrak > 0 ? (nilaiKontrak - realisasiHPP) / nilaiKontrak * 100 : null;
            rows.push({
              noWO: noWO, namaProject: r.nama_project || '', namaKlien: klienMap[r.klien_id] || r.klien_id || '',
              namaSales: r.dibuat_oleh || '', tanggal: tanggal, status: status, nilaiKontrak: nilaiKontrak,
              estimasiHPP: estimasiHPP, realisasiHPP: realisasiHPP, selisih: estimasiHPP - realisasiHPP,
              marginEstimasi: margEst, marginRealisasi: margReal,
              isOverBudget: margReal !== null && margEst !== null && margReal < margEst
            });
          });
          rows.sort(function (a, b) { return b.noWO.localeCompare(a.noWO, undefined, { numeric: true }); });
          var totalKontrak = 0, totalRealisasi = 0, sumMargReal = 0, countMarg = 0;
          rows.forEach(function (r2) { totalKontrak += r2.nilaiKontrak; totalRealisasi += r2.realisasiHPP; if (r2.marginRealisasi !== null) { sumMargReal += r2.marginRealisasi; countMarg++; } });
          var rekapAkun = Object.keys(expByAkun).map(function (nama) { return { namaAkun: nama, total: expByAkun[nama] }; }).sort(function (a, b) { return b.total - a.total; });
          return { success: true, rows: rows, summary: { totalKontrak: totalKontrak, totalRealisasiHPP: totalRealisasi, rataMarginRealisasi: countMarg > 0 ? sumMargReal / countMarg : null }, rekapAkun: rekapAkun };
        }
      });

      // ── Laporan Keuntungan Bulanan (Pengeluaran.gs → getLaporanKeuntunganBulanan) ─
      window.gsRoute('getLaporanKeuntunganBulanan', {
        mode: 'fn',
        handler: async function (args) {
          var params = args[0] || {};
          var tahun = parseInt(params.tahun, 10) || new Date().getFullYear();
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(_all('invoice', 'tanggal,dpp')),
            _safe(_all('pengeluaran', 'tanggal,no_wo,total,kategori')),
            _safe(_all('penawaran', 'no_wo,nama_project'))
          ]);
          var woMap = {}; (res[2].data || []).forEach(function (p) { var w = (p.no_wo || '').toString().trim(); if (w && !woMap[w]) woMap[w] = { namaProject: p.nama_project || '' }; });
          var bulanData = []; for (var b = 0; b < 12; b++) bulanData.push({ bulan: _WO_BULAN[b], bulanIdx: b + 1, invoiceDPP: 0, pengeluaranProject: 0, pengeluaranNonProject: 0, kategoriProjectTotal: {}, kategoriNonProjectTotal: {} });
          (res[0].data || []).forEach(function (r) { var tp = _fmtTgl(r.tanggal).split('/'); if (tp.length !== 3) return; if (parseInt(tp[2], 10) !== tahun) return; bulanData[parseInt(tp[1], 10) - 1].invoiceDPP += parseFloat(r.dpp) || 0; });
          (res[1].data || []).forEach(function (r) {
            var tp = _fmtTgl(r.tanggal).split('/'); if (tp.length !== 3) return; if (parseInt(tp[2], 10) !== tahun) return;
            var total = parseFloat(r.total) || 0; var noWO = (r.no_wo || '').toString().trim(); var d = bulanData[parseInt(tp[1], 10) - 1];
            if (noWO) { d.pengeluaranProject += total; var wi = woMap[noWO] || { namaProject: '' }; var label = noWO + (wi.namaProject ? ' - ' + wi.namaProject : ''); d.kategoriProjectTotal[label] = (d.kategoriProjectTotal[label] || 0) + total; }
            else { d.pengeluaranNonProject += total; var kat = (r.kategori || 'Lainnya').toString(); d.kategoriNonProjectTotal[kat] = (d.kategoriNonProjectTotal[kat] || 0) + total; }
          });
          var _sortKat = function (m) { return Object.keys(m).map(function (k) { return { kategori: k, total: m[k] }; }).sort(function (a, b) { return b.total - a.total; }); };
          var kpTahun = {}, knpTahun = {};
          bulanData.forEach(function (d) { Object.keys(d.kategoriProjectTotal).forEach(function (k) { kpTahun[k] = (kpTahun[k] || 0) + d.kategoriProjectTotal[k]; }); Object.keys(d.kategoriNonProjectTotal).forEach(function (k) { knpTahun[k] = (knpTahun[k] || 0) + d.kategoriNonProjectTotal[k]; }); });
          var totInv = 0, totPP = 0, totPNP = 0;
          var rows = bulanData.map(function (d) {
            var keuntungan = d.invoiceDPP - d.pengeluaranProject - d.pengeluaranNonProject;
            var margin = d.invoiceDPP > 0 ? (keuntungan / d.invoiceDPP * 100) : null;
            totInv += d.invoiceDPP; totPP += d.pengeluaranProject; totPNP += d.pengeluaranNonProject;
            return { bulan: d.bulan, bulanIdx: d.bulanIdx, invoiceDPP: d.invoiceDPP, pengeluaranProject: d.pengeluaranProject, pengeluaranNonProject: d.pengeluaranNonProject, keuntungan: keuntungan, margin: margin, kategoriProject: _sortKat(d.kategoriProjectTotal), kategoriNonProject: _sortKat(d.kategoriNonProjectTotal) };
          });
          var totalKeuntungan = totInv - totPP - totPNP; var totalMargin = totInv > 0 ? (totalKeuntungan / totInv * 100) : null;
          return {
            success: true, tahun: tahun, rows: rows,
            summary: { totalInvoiceDPP: totInv, totalPengeluaranProject: totPP, totalPengeluaranNonProject: totPNP, totalPengeluaran: totPP + totPNP, totalKeuntungan: totalKeuntungan, totalMargin: totalMargin },
            kategoriProjectTahunan: _sortKat(kpTahun), kategoriNonProjectTahunan: _sortKat(knpTahun)
          };
        }
      });

      // ── Laporan Keuangan (Invoice.gs → getFinanceReportData) ──────────────
      window.gsRoute('getFinanceReportData', {
        mode: 'fn',
        handler: async function (args) {
          var filter = args[0] || {};
          var _frParse = function (s) { if (!s) return null; var p = s.split('-'); if (p.length !== 3) return null; return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2])); };
          var _aging = function (t) { if (!t) return null; var pr = t.split('/'); if (pr.length !== 3) return null; var d = new Date(parseInt(pr[2]), parseInt(pr[1]) - 1, parseInt(pr[0])); if (isNaN(d.getTime())) return null; return Math.floor((new Date() - d) / 86400000); };
          var dateFrom = filter.from ? _frParse(filter.from) : null;
          var dateTo = filter.to ? _frParse(filter.to) : null;
          if (dateTo) dateTo.setHours(23, 59, 59);
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var woList = await _woListData();
          var iq = await _safe(_all('invoice', 'no_invoice,no_wo,no_penawaran,tanggal,jenis,dpp,ppn_persen,ppn_nominal,total,status_bayar,tanggal_bayar,bukti_file_id'));
          var invByWO = {}, invByPen = {};
          var aging = { current: 0, gte30: 0, gte60: 0, gte90: 0 };
          var totalTagihan = 0, totalTerbayar = 0, totalTagihanDpp = 0, totalTerbayarDpp = 0;
          (iq.data || []).forEach(function (r) {
            var noInv = (r.no_invoice || '').toString(); if (!noInv) return;
            var noWO = (r.no_wo || '').toString(); var noPen = (r.no_penawaran || '').toString();
            var tgl = _fmtTgl(r.tanggal); var jenis = (r.jenis || '').toString();
            var dpp = parseFloat(r.dpp) || 0, ppnPct = parseFloat(r.ppn_persen) || 0, ppnNom = parseFloat(r.ppn_nominal) || 0, total = parseFloat(r.total) || 0;
            var status = (r.status_bayar || 'Belum Lunas').toString();
            var tglBayar = r.tanggal_bayar ? _fmtTgl(r.tanggal_bayar) : '';
            if (!tglBayar) { var legacy = (r.bukti_file_id || '').toString(); if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(legacy)) tglBayar = _fmtTgl(legacy); }
            if (dateFrom || dateTo) {
              var invDate = null; var s = (r.tanggal || '').toString();
              if (s.indexOf('T') > 0) invDate = new Date(s);
              else { var dp = s.split('-'); if (dp.length === 3) invDate = new Date(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2])); }
              if (invDate) { if (dateFrom && invDate < dateFrom) return; if (dateTo && invDate > dateTo) return; } else return;
            }
            var inv = { noInv: noInv, noWO: noWO, noPen: noPen, tgl: tgl, jenis: jenis, dpp: dpp, ppnPct: ppnPct, ppnNom: ppnNom, total: total, status: status, tglBayar: tglBayar };
            totalTagihan += total; totalTagihanDpp += dpp;
            if (status === 'Lunas') { totalTerbayar += total; totalTerbayarDpp += dpp; }
            if (status !== 'Lunas') { var days = _aging(tgl); if (days !== null) { if (days >= 90) aging.gte90 += total; else if (days >= 60) aging.gte60 += total; else if (days >= 30) aging.gte30 += total; else aging.current += total; } }
            if (noWO) { (invByWO[noWO] = invByWO[noWO] || []).push(inv); } else if (noPen) { (invByPen[noPen] = invByPen[noPen] || []).push(inv); }
          });
          var woRows = woList.map(function (w) {
            var invoices = invByWO[w.noWO] || [];
            invoices.sort(function (a, b) { return a.noInv.localeCompare(b.noInv, undefined, { numeric: true }); });
            var tagihan = 0, terbayar = 0; invoices.forEach(function (inv) { tagihan += inv.total; if (inv.status === 'Lunas') terbayar += inv.total; });
            var nilaiKontrak = Math.max(0, (w.subtotal || 0) - (w.diskon || 0));
            var ppnRate = nilaiKontrak > 0 ? Math.round((w.pajak || 0) / nilaiKontrak * 100) : 0;
            var bruto = nilaiKontrak + (w.pajak || 0);
            return { noWO: w.noWO, noPenawaran: w.id, namaKlien: w.namaKlien, namaProject: w.namaProject, nilaiKontrak: nilaiKontrak, ppnRate: ppnRate, invoices: invoices, tagihan: tagihan, terbayar: terbayar, outstanding: tagihan - terbayar, belumDitagih: Math.max(0, bruto - tagihan) };
          });
          var preDealRows = [];
          Object.keys(invByPen).forEach(function (noPen) {
            var invList = invByPen[noPen].filter(function (inv) { return !inv.noWO; });
            if (!invList.length) return;
            invList.sort(function (a, b) { return a.noInv.localeCompare(b.noInv, undefined, { numeric: true }); });
            var tagihan = 0, terbayar = 0; invList.forEach(function (inv) { tagihan += inv.total; if (inv.status === 'Lunas') terbayar += inv.total; });
            preDealRows.push({ noWO: '', noPenawaran: noPen, namaKlien: invList[0].namaKlien || '', namaProject: invList[0].namaProject || '', nilaiKontrak: 0, ppnRate: 0, invoices: invList, tagihan: tagihan, terbayar: terbayar, outstanding: tagihan - terbayar, belumDitagih: 0, isPredeal: true });
          });
          return {
            success: true,
            summary: { totalTagihanDpp: totalTagihanDpp, totalTerbayarDpp: totalTerbayarDpp, totalOutstandingDpp: totalTagihanDpp - totalTerbayarDpp, totalTagihan: totalTagihan, totalTerbayar: totalTerbayar, totalOutstanding: totalTagihan - totalTerbayar, aging: aging },
            rows: woRows.concat(preDealRows)
          };
        }
      });

      // ── Detail reserve stok per WO (Inventory.gs → getReserveDetailByStok) ─
      window.gsRoute('getReserveDetailByStok', {
        mode: 'fn',
        handler: async function (args) {
          var idStok = (args[0] || '').toString().trim();
          if (!idStok) return { success: false, list: [], total: 0, message: 'ID Stok wajib.' };
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(supa.from('bom_item').select('no_wo,nama_material,satuan,qty_reserved,qty_dikirim').eq('stok_id', idStok)),
            _safe(supa.from('bom_project').select('no_wo,nama_project,nama_klien'))
          ]);
          var projMap = {}; (res[1].data || []).forEach(function (r) { if (r.no_wo) projMap[r.no_wo] = r; });
          var byWO = {};
          (res[0].data || []).forEach(function (r) {
            var held = (Number(r.qty_reserved) || 0) - (Number(r.qty_dikirim) || 0);
            if (held <= 0) return;
            var noWO = (r.no_wo || '').toString().trim();
            if (!byWO[noWO]) byWO[noWO] = { qty: 0, items: [] };
            byWO[noWO].qty += held;
            byWO[noWO].items.push({ namaMaterial: (r.nama_material || '').toString(), satuan: (r.satuan || '').toString(), qty: held });
          });
          var list = [], total = 0;
          Object.keys(byWO).forEach(function (w) {
            var pj = projMap[w] || {};
            list.push({ noWO: w, namaProject: pj.nama_project || '', namaKlien: pj.nama_klien || '', qty: byWO[w].qty, items: byWO[w].items });
            total += byWO[w].qty;
          });
          list.sort(function (a, b) { return b.qty - a.qty; });
          return { success: true, list: list, total: total };
        }
      });

      // ── Rincian lot produk (Inventory.gs → getRincianLotProduk) — FIFO ────
      window.gsRoute('getRincianLotProduk', {
        mode: 'fn',
        handler: async function (args) {
          var idProduk = (args[0] || '').toString().trim();
          var q = await supa.from('mutasi_stok').select('qty_masuk,qty_keluar,harga_satuan').eq('id_produk', idProduk).order('id_mutasi');
          if (q.error) return { success: false, message: q.error.message };
          // Replay FIFO lots (port _replayLotsFromRows).
          var lots = [];
          (q.data || []).forEach(function (r) {
            var masuk = Number(r.qty_masuk) || 0, keluar = Number(r.qty_keluar) || 0, harga = Number(r.harga_satuan) || 0;
            if (masuk > 0) { lots.push({ qty: masuk, harga: harga }); }
            else if (keluar > 0) {
              var sisa = keluar;
              while (sisa > 0 && lots.length > 0) {
                var lot = lots[0];
                if (lot.qty <= sisa) { sisa -= lot.qty; lots.shift(); } else { lot.qty -= sisa; sisa = 0; }
              }
            }
          });
          var qtyTotal = 0, nilaiTotal = 0;
          var rincian = lots.map(function (lot) { qtyTotal += lot.qty; nilaiTotal += lot.qty * lot.harga; return { qty: lot.qty, harga: lot.harga, nilai: lot.qty * lot.harga }; });
          return { success: true, lots: rincian, qtyTotal: qtyTotal, nilaiTotal: nilaiTotal };
        }
      });

      // ── ID Site Survey berikutnya (SiteSurvey.gs → getNextSiteSurveyId) ───
      window.gsRoute('getNextSiteSurveyId', {
        mode: 'fn',
        handler: async function () {
          var q = await _all('site_survey', 'id');
          if (q.error) return { success: false, message: q.error.message };
          var maxNum = 0;
          (q.data || []).forEach(function (r) { var m = (r.id || '').toString().match(/^SVY(\d+)/i); if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10)); });
          return { success: true, id: 'SVY' + ('000' + (maxNum + 1)).slice(-3) };
        }
      });

      // ── Konteks WO untuk engineering (BOM.gs → getWOContextByWO) ──────────
      window.gsRoute('getWOContextByWO', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString().trim();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var woList = await _woListData();
          var wo = woList.filter(function (w) { return w.noWO === noWO; })[0];
          if (!wo) return { success: false, message: 'Work Order tidak ditemukan.' };
          var res = await Promise.all([
            _safe(_all('produk', 'id,tipe')),
            _safe(supa.from('hand_over').select('*').eq('no_wo', noWO).maybeSingle()),
            _safe(_all('site_survey', '*'))   // filter by kolom no_wo ATAU data.noWO di bawah
          ]);
          var tipeMap = {}; (res[0].data || []).forEach(function (p) { if (p.id) tipeMap[p.id] = (p.tipe || '').toString().trim().toLowerCase(); });
          var kelompokList = []; try { kelompokList = JSON.parse(wo.items || '[]'); } catch (e) {}
          var budMaterial = 0, budJasa = 0, kelompok = [];
          kelompokList.forEach(function (k) {
            var disp = { nama: (k.namaKelompok || '').toString(), items: [] };
            (k.subItems || []).forEach(function (s) {
              var pid = (s.produkId || '').toString().trim();
              var tipe = pid ? (tipeMap[pid] || '') : '';
              var isJasa = (tipe === 'jasa') || ((!pid || !tipe) && _woKeywordHitJasa((s.deskripsi || '').toString().toLowerCase()));
              var qty = Number(s.qty) || 0, hpp = Number(s.hpp) || 0;
              if (isJasa) budJasa += qty * hpp; else budMaterial += qty * hpp;
              disp.items.push({ deskripsi: (s.deskripsi || '').toString(), qty: qty, unit: (s.unit || '').toString(), hpp: hpp, totalHpp: qty * hpp });
            });
            kelompok.push(disp);
          });
          var ho = null;
          var hr = res[1].data;
          if (hr) ho = { status: hr.status || '', mom: hr.mom || '', tglJadwal: hr.tgl_jadwal ? hr.tgl_jadwal.toString().slice(0, 10) : '', waktu: hr.waktu ? hr.waktu.toString().slice(0, 5) : '', mode: hr.mode || '', selesaiOleh: hr.selesai_oleh || '', selesaiPada: _fmtTs(hr.selesai_pada) };
          var surveys = (res[2].data || []).filter(function (r) {
            var sd = _jsonObj(r.data);
            return (r.no_wo || '').toString().trim() === noWO || (sd.noWO || '').toString().trim() === noWO;
          }).map(function (r) {
            return { id: r.id || '', tanggalSurvey: _fmtTgl(r.tanggal_survey), dibuatOleh: r.dibuat_oleh || '', namaSite: r.nama_site || '', namaPIC: r.nama_pic || '', telepon: r.no_telepon || '', alamat: r.alamat || '' };
          }).sort(function (a, b) { return b.id.localeCompare(a.id, undefined, { numeric: true }); });
          return {
            success: true, noWO: noWO, id: wo.id || '', rev: wo.rev != null ? wo.rev : '', tanggal: wo.tanggal || '',
            dibuatOleh: wo.dibuatOleh || '', namaProject: wo.namaProject || '', namaKlien: wo.namaKlien || '',
            jenisWO: wo.jenisWO || 'Material', status: wo.status || '', catatanCustomer: wo.catatanCustomer || '',
            kelompok: kelompok, budget: { material: budMaterial, jasa: budJasa, total: budMaterial + budJasa }, ho: ho, surveys: surveys
          };
        }
      });

      // ── Helper bersama: peta pricelist id → {idSupplier, hargaBeli} ────────
      async function _priceMap() {
        var q = await _all('pricelist', 'id,id_supplier,harga_beli');
        var m = {}; (q.data || []).forEach(function (p) { m[(p.id || '').toString()] = { idSupplier: (p.id_supplier || '').toString(), hargaBeli: Number(p.harga_beli) || 0 }; });
        return m;
      }

      // ── BOM perlu dibeli (BOM.gs → getBOMNeedPurchase) ────────────────────
      window.gsRoute('getBOMNeedPurchase', {
        mode: 'fn',
        handler: async function () {
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(_all('bom_item', 'id,no_wo,kategori,pricelist_id,nama_material,merek,supplier,satuan,qty,stok_id,qty_reserved,qty_beli,qty_menunggu_bl')),
            _safe(supa.from('bom_project').select('no_wo,nama_project,nama_klien')),
            _priceMap()
          ]);
          var projMap = {}; (res[1].data || []).forEach(function (r) { if (r.no_wo) projMap[r.no_wo] = { namaProject: r.nama_project || '', namaKlien: r.nama_klien || '' }; });
          var priceMap = res[2];
          var list = [];
          (res[0].data || []).forEach(function (r) {
            var qtyBeli = Number(r.qty_beli) || 0, qtyMenunggu = Number(r.qty_menunggu_bl) || 0;
            if (qtyBeli <= 0 && qtyMenunggu <= 0) return;
            var noWO = (r.no_wo || '').toString().trim(); var pj = projMap[noWO] || {};
            var plId = (r.pricelist_id || '').toString(); var pm = priceMap[plId] || {};
            list.push({
              id: (r.id || '').toString(), noWO: noWO, namaProject: pj.namaProject || '', namaKlien: pj.namaKlien || '',
              kategori: (r.kategori || 'Lainnya').toString(), namaMaterial: r.nama_material || '', merek: r.merek || '',
              supplier: (r.supplier || '').toString() || '(tanpa supplier)', satuan: r.satuan || '', qty: Number(r.qty) || 0,
              qtyReserved: Number(r.qty_reserved) || 0, idStok: (r.stok_id || '').toString(), qtyBeli: qtyBeli, qtyMenunggu: qtyMenunggu,
              pricelistId: plId, idSupplier: pm.idSupplier || '', hargaBeli: pm.hargaBeli || 0
            });
          });
          return { success: true, list: list };
        }
      });

      // ── BOM menunggu beli langsung (BOM.gs → getBOMMenungguBL) ────────────
      window.gsRoute('getBOMMenungguBL', {
        mode: 'fn',
        handler: async function (args) {
          var fSup = (args[0] && args[0].idSupplier) ? args[0].idSupplier.toString().trim() : '';
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(_all('bom_item', 'id,no_wo,kategori,pricelist_id,nama_material,merek,supplier,satuan,qty_menunggu_bl')),
            _safe(supa.from('bom_project').select('no_wo,nama_project')),
            _priceMap()
          ]);
          var projMap = {}; (res[1].data || []).forEach(function (r) { if (r.no_wo) projMap[r.no_wo] = r.nama_project || ''; });
          var priceMap = res[2];
          var list = [];
          (res[0].data || []).forEach(function (r) {
            var qMen = Number(r.qty_menunggu_bl) || 0; if (qMen <= 0) return;
            var plId = (r.pricelist_id || '').toString(); var pm = priceMap[plId] || {};
            // Exclude hanya bila item punya supplier ter-resolve yg BEDA dari
            // filter. Item tanpa supplier ter-resolve tetap tampil agar bisa
            // dilink (jangan sampai "Tunggu Beli" tak pernah selesai).
            if (fSup && pm.idSupplier && pm.idSupplier !== fSup) return;
            var noWO = (r.no_wo || '').toString().trim();
            list.push({
              id: (r.id || '').toString(), noWO: noWO, namaProject: projMap[noWO] || '', kategori: (r.kategori || 'Lainnya').toString(),
              namaMaterial: r.nama_material || '', merek: r.merek || '', supplier: r.supplier || '', satuan: r.satuan || '',
              qtyMenunggu: qMen, pricelistId: plId, idSupplier: pm.idSupplier || '', hargaBeli: pm.hargaBeli || 0
            });
          });
          return { success: true, list: list };
        }
      });

      // ── Riwayat revisi penawaran (Penawaran.gs → getRiwayatRevisi) ────────
      window.gsRoute('getRiwayatRevisi', {
        mode: 'fn',
        handler: async function (args) {
          var noPen = (args[0] || '').toString().trim();
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(supa.from('penawaran').select('*').eq('no_penawaran', noPen)),
            _safe(_all('klien', 'id,nama_klien'))
          ]);
          var klienMap = {}; (res[1].data || []).forEach(function (k) { klienMap[k.id] = k.nama_klien || ''; });
          var list = (res[0].data || []).map(function (r) {
            return {
              id: (r.no_penawaran || '').toString(), rev: (parseInt(r.rev) || 0).toString(),
              tanggal: _fmtTgl(r.tanggal), validUntil: _fmtTgl(r.valid_hingga), namaProject: r.nama_project || '',
              klienId: (r.klien_id || '').toString(), namaKlien: klienMap[r.klien_id] || r.klien_id || '',
              dibuatOleh: r.dibuat_oleh || '', subtotal: parseFloat(r.subtotal) || 0, diskon: parseFloat(r.diskon) || 0,
              pajak: parseFloat(r.pajak) || 0, grandTotal: parseFloat(r.grand_total) || 0, hpp: parseFloat(r.total_hpp) || 0,
              profit: parseFloat(r.estimasi_keuntungan) || 0, marginPersen: parseFloat(r.margin_persen) || 0,
              termConditions: _jsonStr(r.term_conditions, '{}'), items: _jsonStr(r.items, '[]'),
              status: r.status || 'On-Progress', noWO: r.no_wo || '', channelMarketing: r.channel_marketing || ''
            };
          });
          list.sort(function (a, b) { return parseInt(b.rev) - parseInt(a.rev); });
          return list;
        }
      });

      // ── Item PO untuk penerimaan (PurchaseOrder.gs → getPOItemsUntukPenerimaan) ─
      window.gsRoute('getPOItemsUntukPenerimaan', {
        mode: 'fn',
        handler: async function (args) {
          var noPO = (args[0] || '').toString().trim();
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(supa.from('purchase_order').select('status_po').eq('no_po', noPO).maybeSingle()),
            _safe(supa.from('po_item').select('id_item,nama_item,satuan,harga_beli_satuan,qty,qty_diterima,id_produk').eq('no_po', noPO))
          ]);
          if (!res[0].data) return { success: false, message: 'PO tidak ditemukan.' };
          var statusPO = (res[0].data.status_po || '').toString();
          var ok = ['Aktif', 'Diterima Sebagian', 'Menunggu Gudang', 'Menunggu Penerimaan Gudang'];
          if (ok.indexOf(statusPO) === -1) return { success: false, message: 'PO berstatus "' + statusPO + '" tidak bisa diterima.' };
          var items = (res[1].data || []).map(function (r) {
            var qty = Number(r.qty) || 0, qtyDiterima = Number(r.qty_diterima) || 0;
            return {
              idItem: (r.id_item || '').toString(), namaItem: (r.nama_item || '').toString(), satuan: (r.satuan || '').toString(),
              hargaBeli: Number(r.harga_beli_satuan) || 0, qtyPesan: qty, qtyDiterima: qtyDiterima,
              qtySisa: Math.max(0, qty - qtyDiterima), idProduk: (r.id_produk || '').toString()
            };
          });
          return { success: true, items: items, statusPO: statusPO };
        }
      });

      // ═══════════════════════════════════════════════════════════════════════
      //  GAP CASH MANAGER (perlu 00-ddl-gap-cashmanager.sql dijalankan dulu)
      //  Ayat silang, bank account, kategori, saldo akun, bundle, bootstrap.
      // ═══════════════════════════════════════════════════════════════════════
      window.gsRoute('getAyatSilangList', { mode: 'fn', handler: async function () { return { success: true, list: await _ayatArr() }; } });
      // getBankAccounts kini bersumber dari akun_pembayaran (SATU master).
      // label = nama_akun, detail = detail rekening. Dipakai dropdown Invoice.
      async function _bankFromAkun() {
        var q = await supa.from('akun_pembayaran').select('id,nama_akun,detail,status').order('id');
        return (q.data || []).filter(function (r) { return (r.id || '').toString() !== 'AP001'; }) // Stok bukan bank
          .map(function (r) { return { id: (r.id || '').toString(), label: r.nama_akun || '', detail: r.detail || '' }; });
      }
      window.gsRoute('getBankAccounts', {
        mode: 'fn',
        handler: async function () { return { success: true, accounts: await _bankFromAkun() }; }
      });
      window.gsRoute('getKategoriPengeluaran', {
        mode: 'fn',
        handler: async function () {
          var q = await supa.from('kategori_pengeluaran').select('nama').order('urutan');
          if (q.error) return { success: false, list: [], message: q.error.message };
          return { success: true, list: (q.data || []).map(function (r) { return r.nama; }) };
        }
      });
      window.gsRoute('getSaldoAkun', { mode: 'fn', handler: function () { return _saldoAkun(); } });
      window.gsRoute('getMutasiBundle', {
        mode: 'fn',
        handler: async function () {
          var r = await Promise.all([_pemArr(), _pengArr(), _ayatArr()]);
          return { success: true, pemasukan: r[0], pengeluaran: r[1], ayatSilang: r[2] };
        }
      });
      window.gsRoute('getCashManagerBootstrap', {
        mode: 'fn',
        handler: async function () {
          var out = { success: true };
          try { out.paymentRequests = await _paymentReqArr(); } catch (e) { out.paymentRequests = []; }
          try { out.workOrders = await _woListData(); } catch (e) { out.workOrders = []; }
          try { out.bankAccounts = await _bankFromAkun(); } catch (e) { out.bankAccounts = []; }
          try { var kt = await supa.from('kategori_pengeluaran').select('nama').order('urutan'); out.kategori = (kt.data || []).map(function (r) { return r.nama; }); } catch (e) { out.kategori = []; }
          try { out.saldo = await _saldoAkun(); } catch (e) { out.saldo = { success: false }; }
          try { out.pemasukan = await _pemArr(); } catch (e) { out.pemasukan = []; }
          try { out.pengeluaran = await _pengArr(); } catch (e) { out.pengeluaran = []; }
          try { out.ayatSilang = await _ayatArr(); } catch (e) { out.ayatSilang = []; }
          return out;
        }
      });

      // ═══════════════════════════════════════════════════════════════════════
      //  MILESTONE 7 — TULIS (write). Data BARU kini masuk Supabase, BUKAN Sheets.
      //  ⚠ Setelah ini, tambah/ubah data lewat aplikasi Vercel = ke Supabase.
      //  Jangan input data yang sama lewat app lama (Sheets) → nanti berbeda.
      //  Pilot: Master Customer (klien).
      // ═══════════════════════════════════════════════════════════════════════
