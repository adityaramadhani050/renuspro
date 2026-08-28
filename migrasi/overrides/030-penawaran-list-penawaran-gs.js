      // ── Penawaran list (Penawaran.gs → getPenawaranList) — balik ARRAY ────
      //  Ambil rev TERTINGGI per no_penawaran; kolom nama beda: valid_hingga,
      //  total_hpp, estimasi_keuntungan. hoStatus dari hand_over.
      window.gsRoute('getPenawaranList', {
        mode: 'fn',
        handler: async function () {
          var q = await _all('penawaran', '*', function(x){return x.order('no_penawaran').order('rev');});
          if (q.error) { console.error('[getPenawaranList]', q.error); return []; }
          // Peta klien id→nama & hand_over no_wo→status.
          var klienMap = {};
          var kq = await _all('klien', 'id,nama_klien');
          if (!kq.error) (kq.data || []).forEach(function (k) { klienMap[k.id] = k.nama_klien || ''; });
          var hoMap = {};
          var hq = await supa.from('hand_over').select('no_wo,status');
          if (!hq.error) (hq.data || []).forEach(function (h) { if (h.no_wo) hoMap[h.no_wo] = h.status || ''; });

          var orderMap = {}, latestMap = {}, counter = 0;
          (q.data || []).forEach(function (r) {
            var no = (r.no_penawaran || '').toString();
            if (!no) return;
            var rev = parseInt(r.rev) || 0;
            if (!(no in orderMap)) orderMap[no] = counter++;
            if (!(no in latestMap) || rev > (latestMap[no]._rev || 0)) {
              latestMap[no] = {
                _rev: rev, id: no, rev: rev.toString(),
                tanggal: _fmtTgl(r.tanggal), validUntil: _fmtTgl(r.valid_hingga),
                namaProject: r.nama_project || '', klienId: r.klien_id || '',
                namaKlien: klienMap[r.klien_id] || r.klien_id || '', dibuatOleh: r.dibuat_oleh || '',
                subtotal: parseFloat(r.subtotal) || 0, diskon: parseFloat(r.diskon) || 0,
                pajak: parseFloat(r.pajak) || 0, grandTotal: parseFloat(r.grand_total) || 0,
                hpp: parseFloat(r.total_hpp) || 0, profit: parseFloat(r.estimasi_keuntungan) || 0,
                marginPersen: parseFloat(r.margin_persen) || 0,
                termConditions: _jsonStr(r.term_conditions, '{}'), items: _jsonStr(r.items, '[]'),
                status: r.status || 'On-Progress', noWO: r.no_wo || '',
                hoStatus: r.no_wo ? (hoMap[r.no_wo] || '') : '',
                tanggalDeal: _fmtTgl(r.tanggal_deal), channelMarketing: r.channel_marketing || '',
                catatanFail: r.catatan_fail || '', kodeWin: r.kode_win || '', catatanWin: r.catatan_win || '',
                kodeLost: r.kode_lost || '', tanggalFail: _fmtTgl(r.tanggal_fail),
                lessonLearned: r.lesson_learned || '', action: r.action || ''
              };
            }
          });
          // Urut berdasarkan nomor urut (NNN) numerik, terbaru di atas. String sort
          // salah untuk 4 digit ('1000' < '101'), jadi parse angka depan. Fallback
          // ke urutan fetch bila format tak terbaca.
          var _seq = function (no) { var m = (no || '').toString().match(/^(\d+)/); return m ? parseInt(m[1], 10) : -1; };
          return Object.keys(latestMap)
            .sort(function (a, b) { var d = _seq(b) - _seq(a); return d !== 0 ? d : (orderMap[b] - orderMap[a]); })
            .map(function (no) { var it = Object.assign({}, latestMap[no]); delete it._rev; return it; });
        }
      });

      // ── Bootstrap Kwitansi (Kwitansi.gs → getKwitansiInitialData) ─────────
      //  { success, invoiceList, nextNo:'' } — nextNo dibuat saat simpan (Apps Script).
      window.gsRoute('getKwitansiInitialData', {
        mode: 'fn',
        handler: async function () {
          try {
            return { success: true, invoiceList: await _invoiceList(), nextNo: '' };
          } catch (e) {
            return { success: false, error: String(e), invoiceList: [], nextNo: '' };
          }
        }
      });

      // ═══════════════════════════════════════════════════════════════════════
      //  MILESTONE 5 — BATCH 6 (Detail Purchase Order — 5 sumber, paralel)
      // ═══════════════════════════════════════════════════════════════════════

      // ── Detail PO (PurchaseOrder.gs → getPODetail) ────────────────────────
      window.gsRoute('getPODetail', {
        mode: 'fn',
        handler: async function (args) {
          var noPO = (args[0] || '').toString().trim();
          if (!noPO) return { success: false, message: 'No PO wajib.' };
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(supa.from('purchase_order').select('*').eq('no_po', noPO).maybeSingle()),
            _safe(supa.from('po_item').select('*').eq('no_po', noPO)),
            _safe(supa.from('pembayaran_po').select('*').eq('no_po', noPO)),
            _safe(supa.from('po_payment_request').select('*').eq('no_po', noPO)),
            _safe(supa.from('penerimaan_po_log').select('*').eq('no_po', noPO))
          ]);
          var hq = res[0], iq = res[1], bq = res[2], pq = res[3], lq = res[4];
          if (!hq.data) return { success: false, message: 'No PO tidak ditemukan.' };
          var r = hq.data;
          var header = {
            noPO: r.no_po || '', tanggal: _fmtTgl(r.tanggal), idSupplier: r.id_supplier || '',
            namaSupplier: r.nama_supplier || '', peruntukan: r.peruntukan || '', noWO: r.no_wo || '',
            statusPO: r.status_po || '', subtotal: parseFloat(r.subtotal) || 0,
            ppnPersen: parseFloat(r.ppn_persen) || 0, ppnNominal: parseFloat(r.ppn_nominal) || 0,
            grandTotal: parseFloat(r.grand_total) || 0, catatan: r.catatan || '',
            statusBayar: r.status_bayar || '', totalDibayar: parseFloat(r.total_dibayar) || 0,
            dibuatOleh: r.dibuat_oleh || '', dibuatPada: _fmtTgl(r.dibuat_pada),
            diubahOleh: r.diubah_oleh || '', diubahPada: _fmtTgl(r.diubah_pada),
            diskonPersen: parseFloat(r.diskon_persen) || 0, diskonNominal: parseFloat(r.diskon_nominal) || 0,
            quotNo: r.no_quotation || '', quotTanggal: _fmtTgl(r.tanggal_quotation),
            termConditions: _jsonStr(r.term_conditions, ''), quotFileId: r.quot_file_id || '',
            quotFileUrl: r.quot_file_url || '', quotFileName: r.quot_file_nama || ''
          };
          var items = (iq.data || []).map(function (ir) {
            return {
              idItem: ir.id_item || '', noPO: ir.no_po || '', namaItem: ir.nama_item || '',
              qty: parseFloat(ir.qty) || 0, satuan: ir.satuan || '',
              hargaBeli: parseFloat(ir.harga_beli_satuan) || 0, total: parseFloat(ir.total) || 0,
              catatan: ir.catatan || '', qtyDiterima: parseFloat(ir.qty_diterima) || 0,
              produkId: ir.id_produk || ''
            };
          });
          var pembayaran = (bq.data || []).map(function (br) {
            return {
              idBayar: br.id_bayar || '', noPO: br.no_po || '', tanggalBayar: _fmtTgl(br.tanggal_bayar),
              idAkun: br.id_akun || '', namaAkun: br.nama_akun || '', jumlah: parseFloat(br.jumlah) || 0,
              catatan: br.catatan || '', dibuatOleh: br.dibuat_oleh || '', dibuatPada: _fmtTgl(br.dibuat_pada)
            };
          });
          var paymentRequests = (pq.data || []).map(function (pr) {
            return {
              idReq: pr.id_request || '', tanggalRequest: _fmtTgl(pr.tanggal_request),
              jumlah: parseFloat(pr.jumlah) || 0, persentase: parseFloat(pr.persentase) || 0,
              catatan: pr.catatan || '', status: pr.status || '', dibuatOleh: pr.dibuat_oleh || '',
              namaAkun: pr.nama_akun || '', tanggalApprove: _fmtTgl(pr.tanggal_approve),
              invoiceFileUrl: pr.invoice_file_url || '', invoiceFileName: pr.invoice_file_nama || '',
              catatanTolak: pr.catatan_tolak || '', buktiFileUrl: pr.bukti_file_url || '',
              buktiFileName: pr.bukti_file_nama || ''
            };
          });
          var riwayatPenerimaan = (lq.data || []).map(function (lr) {
            var det = _jsonObj(lr.detail_item); if (!Array.isArray(det)) det = [];
            return {
              idLog: lr.id_log || '', noPO: lr.no_po || '', tanggal: _fmtTgl(lr.tanggal),
              mode: lr.mode || '', jumlahItem: parseFloat(lr.jumlah_item) || 0, items: det,
              dibuatOleh: lr.dibuat_oleh || '', dibuatPada: _fmtTgl(lr.dibuat_pada),
              buktiFileId: lr.bukti_file_id || '', buktiFileUrl: lr.bukti_file_url || '',
              buktiFileName: lr.bukti_file_nama || ''
            };
          });
          return { success: true, po: header, items: items, pembayaran: pembayaran, paymentRequests: paymentRequests, riwayatPenerimaan: riwayatPenerimaan };
        }
      });

      // ═══════════════════════════════════════════════════════════════════════
      //  MILESTONE 5 — BATCH 7 (Cash pemasukan/pengeluaran + Pengiriman)
      //  Catatan: getAyatSilangList & getMutasiBundle TETAP Apps Script karena
      //  tabel ayat_silang belum ada di skema Supabase.
      // ═══════════════════════════════════════════════════════════════════════

      // ── Pemasukan (Pengeluaran.gs → getPemasukanList) ─────────────────────
      window.gsRoute('getPemasukanList', {
        mode: 'fn',
        handler: async function (args) {
          var params = args[0] || {};
          var q = await _all('pemasukan', '*');
          if (q.error) return { success: false, list: [], message: q.error.message };
          var list = (q.data || []).map(function (r) {
            return {
              id: r.id_pemasukan || '', tanggal: _fmtTgl(r.tanggal), sumber: r.sumber || '',
              kategori: r.kategori || '', idAkun: r.id_akun || '', namaAkun: r.nama_akun || '',
              noRef: r.no_invoice_ref || '', idReferensi: r.id_referensi || '', deskripsi: r.deskripsi || '',
              jumlah: parseFloat(r.jumlah) || 0, catatan: r.catatan || '',
              dibuatOleh: r.dibuat_oleh || '', dibuatPada: r.dibuat_pada ? r.dibuat_pada.toString() : '',
              diubahOleh: r.diubah_oleh || '', diubahPada: r.diubah_pada ? r.diubah_pada.toString() : ''
            };
          }).filter(function (row) {
            if (params.sumber && row.sumber !== params.sumber) return false;
            if (params.kategori && row.kategori !== params.kategori) return false;
            if (params.idAkun && row.idAkun !== params.idAkun.toString()) return false;
            return _inDateRange(row.tanggal, params.tanggalDari, params.tanggalSampai);
          });
          list.reverse();
          return { success: true, list: list };
        }
      });

      // ── Pengeluaran (Pengeluaran.gs → getPengeluaranList) ─────────────────
      window.gsRoute('getPengeluaranList', {
        mode: 'fn',
        handler: async function (args) {
          var params = args[0] || {};
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(_all('pengeluaran', '*')),
            _safe(_all('penawaran', 'no_wo,nama_project,klien_id')),
            _safe(_all('klien', 'id,nama_klien'))
          ]);
          var eq = res[0], pq = res[1], kq = res[2];
          if (eq.error) return { success: false, list: [], message: eq.error.message };
          var klienMap = {};
          (kq.data || []).forEach(function (k) { klienMap[k.id] = k.nama_klien || ''; });
          var woMap = {};
          (pq.data || []).forEach(function (p) {
            var w = (p.no_wo || '').toString().trim();
            if (w && !woMap[w]) woMap[w] = { namaProject: p.nama_project || '', namaKlien: klienMap[p.klien_id] || p.klien_id || '' };
          });
          var list = (eq.data || []).map(function (r) {
            var noWO = r.no_wo || '';
            var wi = woMap[noWO] || { namaProject: '', namaKlien: '' };
            return {
              id: r.id_pengeluaran || '', noWO: noWO, namaProject: wi.namaProject, namaKlien: wi.namaKlien,
              tanggal: _fmtTgl(r.tanggal), sumber: r.sumber || '', noPO: r.no_po || '',
              idReferensi: r.id_referensi || '', idAkun: r.id_akun || '', namaAkun: r.nama_akun || '',
              deskripsi: r.deskripsi || '', qty: parseFloat(r.qty) || 0, satuan: r.satuan || '',
              hargaSatuan: parseFloat(r.harga_satuan) || 0, total: parseFloat(r.total) || 0,
              catatan: r.catatan || '', dibuatOleh: r.dibuat_oleh || '',
              dibuatPada: r.dibuat_pada ? r.dibuat_pada.toString() : '',
              diubahOleh: r.diubah_oleh || '', diubahPada: r.diubah_pada ? r.diubah_pada.toString() : '',
              kategori: r.kategori || ''
            };
          }).filter(function (row) {
            if (params.noWO && row.noWO !== params.noWO.toString()) return false;
            if (params.sumber && row.sumber !== params.sumber) return false;
            if (params.idAkun && row.idAkun !== params.idAkun.toString()) return false;
            if (params.noPO && row.noPO.toLowerCase().indexOf(params.noPO.toLowerCase()) === -1) return false;
            return _inDateRange(row.tanggal, params.tanggalDari, params.tanggalSampai);
          });
          list.reverse();
          return { success: true, list: list };
        }
      });

      // ── Pengiriman / Surat Jalan (Inventory.gs → getPengirimanList) ───────
      window.gsRoute('getPengirimanList', {
        mode: 'fn',
        handler: async function (args) {
          var params = args[0] || {};
          var fStatus = (params.status || '').toString();
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(_all('pengiriman', '*')),
            _safe(supa.from('bom_project').select('no_wo,nama_project,nama_klien'))
          ]);
          var gq = res[0], bq = res[1];
          if (gq.error) return { success: false, list: [], message: gq.error.message };
          var projMap = {};
          (bq.data || []).forEach(function (r) { if (r.no_wo) projMap[r.no_wo] = r; });
          var list = (gq.data || []).map(function (r) {
            var noWO = r.no_wo || '';
            var pj = projMap[noWO] || {};
            var items = _jsonObj(r.items); if (!Array.isArray(items)) items = [];
            return {
              idKirim: r.id_kirim || '', noSuratJalan: r.no_surat_jalan || '', noWO: noWO,
              namaProject: pj.nama_project || '', namaKlien: pj.nama_klien || '',
              tanggalKirim: _fmtTgl(r.tanggal_kirim), status: r.status || '',
              dikirimOleh: r.dikirim_oleh || '', alamat: r.alamat || '', kendaraan: r.kendaraan || '',
              driver: r.driver || '', catatan: r.catatan || '', items: items,
              diterimaOleh: r.diterima_oleh || '', diterimaPada: r.diterima_pada ? r.diterima_pada.toString() : '',
              buktiFileUrl: r.bukti_file_url || '', buktiFileName: r.bukti_file_name || ''
            };
          }).filter(function (row) { return fStatus ? row.status === fStatus : true; });
          list.reverse();
          return { success: true, list: list };
        }
      });

      // ═══════════════════════════════════════════════════════════════════════
      //  MILESTONE 5 — BATCH 8 (Penerimaan Barang: PO menunggu + riwayat + bundle)
      // ═══════════════════════════════════════════════════════════════════════

      // ── PO menunggu penerimaan (Inventory.gs → getPOMenungguPenerimaan) ───
      window.gsRoute('getPOMenungguPenerimaan', {
        mode: 'fn',
        handler: async function () { return await _poMenunggu(); }
      });

      // ── Riwayat penerimaan (Inventory.gs → getRiwayatPenerimaanList) ──────
      window.gsRoute('getRiwayatPenerimaanList', {
        mode: 'fn',
        handler: async function (args) {
          var params = args[0] || {};
          return { success: true, list: await _riwayatPenerimaan(params.noPO || null) };
        }
      });

      // ── Bundle Penerimaan Barang (Inventory.gs → getPenerimaanBundle) ─────
      window.gsRoute('getPenerimaanBundle', {
        mode: 'fn',
        handler: async function () {
          var out = { success: true };
          try { out.pending = await _poMenunggu(); } catch (e) { out.pending = []; }
          try { out.riwayat = await _riwayatPenerimaan(null); } catch (e) { out.riwayat = []; }
          return out;
        }
      });

      // ═══════════════════════════════════════════════════════════════════════
      //  MILESTONE 5 — BATCH 9 (Request pengiriman — bikin tab Pengiriman lambat)
      // ═══════════════════════════════════════════════════════════════════════

      // ── Request pengiriman material (Inventory.gs → getPengirimanRequests) ─
      //  Gabung pengiriman_request (status Diminta) + bom_item (reserved-dikirim)
      //  + bom_project (nama). reqMap membatasi qty sesuai target request (parsial).
      window.gsRoute('getPengirimanRequests', {
        mode: 'fn',
        handler: async function () {
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(supa.from('pengiriman_request').select('*').eq('status', 'Diminta')),
            _safe(_all('bom_item', 'id,no_wo,kategori,nama_material,merek,satuan,stok_id,qty_reserved,qty_dikirim')),
            _safe(supa.from('bom_project').select('no_wo,nama_project,nama_klien'))
          ]);
          var rq = res[0], bq = res[1], pq = res[2];
          if (rq.error) return { success: false, list: [], message: rq.error.message };
          var projMap = {};
          (pq.data || []).forEach(function (r) { if (r.no_wo) projMap[r.no_wo] = r; });
          var bomByWO = {};
          (bq.data || []).forEach(function (it) {
            var w = (it.no_wo || '').toString().trim(); if (!w) return;
            (bomByWO[w] = bomByWO[w] || []).push(it);
          });
          var out = [];
          (rq.data || []).forEach(function (req) {
            var noWO = (req.no_wo || '').toString().trim();
            var pj = projMap[noWO] || {};
            // reqMap: null = legacy (semua reserved). Array (termasuk kosong) =
            // material terpilih PC (parsial) — meniru perilaku Apps Script lama.
            var reqMap = null;
            var arr = _jsonObj(req.items);
            if (Array.isArray(arr)) { reqMap = {}; arr.forEach(function (x) { reqMap[(x.bomItemId || '').toString()] = Number(x.target) || 0; }); }
            var mats = [];
            (bomByWO[noWO] || []).forEach(function (it) {
              var reserved = Number(it.qty_reserved) || 0;
              var dikirim = Number(it.qty_dikirim) || 0;
              var sisa = reserved - dikirim;
              if (sisa <= 0) return;
              var bid = (it.id || '').toString();
              if (reqMap) {
                if (!(bid in reqMap)) return;
                var byTarget = reqMap[bid] - dikirim;
                if (byTarget <= 0) return;
                if (byTarget < sisa) sisa = byTarget;
              }
              mats.push({
                id: bid, kategori: it.kategori || '', namaMaterial: it.nama_material || '',
                merek: it.merek || '', satuan: it.satuan || '', idStok: it.stok_id || '',
                qtyReserved: reserved, qtyDikirim: dikirim, qtySisa: sisa
              });
            });
            out.push({
              noWO: noWO, namaProject: pj.nama_project || '', namaKlien: pj.nama_klien || '',
              alamat: req.alamat || '', dimintaOleh: req.diminta_oleh || '',
              dimintaPada: req.diminta_pada ? req.diminta_pada.toString() : '', items: mats
            });
          });
          return { success: true, list: out };
        }
      });

      // ═══════════════════════════════════════════════════════════════════════
      //  MILESTONE 6 — COMPUTE READS (override client, TANPA Edge Function).
      //  Fungsi "berhitung" ternyata cukup dikerjakan di sisi klien: beberapa
      //  query + gabung/olah di JS. Edge Function hanya perlu untuk TULIS
      //  (atomik) atau agregasi sangat berat. Bentuk balikan tetap disamakan.
      // ═══════════════════════════════════════════════════════════════════════

      // ── Work Order list (WorkOrder.gs → getWorkOrderList) — balik ARRAY ───
      //  Sumber: view work_order + produk(tipe) + hand_over + work_order_catatan
      //  + work_order_jenis_override. jenisWO = override || auto(items+tipe+kata).
      async function _woListData() {
        var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
        var res = await Promise.all([
          _safe(_all('work_order', '*')),
          _safe(_all('produk', 'id,tipe')),
          _safe(supa.from('hand_over').select('no_wo,status')),
          _safe(supa.from('work_order_catatan').select('no_wo,catatan')),
          _safe(supa.from('work_order_jenis_override').select('no_wo,jenis_manual'))
        ]);
        var wq = res[0], pq = res[1], hq = res[2], cq = res[3], jq = res[4];
        if (wq.error) { console.error('[getWorkOrderList]', wq.error); return []; }
        var tipeMap = {}; (pq.data || []).forEach(function (p) { if (p.id) tipeMap[p.id] = (p.tipe || '').toString().trim().toLowerCase(); });
        var hoMap = {}; (hq.data || []).forEach(function (h) { if (h.no_wo) hoMap[h.no_wo] = h.status || ''; });
        var catatanMap = {}; (cq.data || []).forEach(function (c) { if (c.no_wo) catatanMap[c.no_wo] = c.catatan || ''; });
        var jenisOverride = {}; (jq.data || []).forEach(function (j) {
          var w = (j.no_wo || '').toString().trim(); var v = (j.jenis_manual || '').toString().trim();
          if (w && (v === 'Jasa' || v === 'Material')) jenisOverride[w] = v;
        });
        var list = (wq.data || []).map(function (r) {
          var noWO = (r.no_wo || '').toString();
          var jenisAuto = _woJenisAuto(r.items, tipeMap);
          var jenisManual = jenisOverride[noWO] || '';
          var jenisEfektif = jenisManual || jenisAuto;
          return {
            noWO: noWO, id: (r.no_penawaran || '').toString(), rev: (r.rev != null ? r.rev : '').toString(),
            tanggal: _fmtTgl(r.tanggal), validUntil: _fmtTgl(r.valid_until), namaProject: r.nama_project || '',
            klienId: r.klien_id || '', namaKlien: r.nama_klien || '', dibuatOleh: r.dibuat_oleh || '',
            subtotal: parseFloat(r.subtotal) || 0, diskon: parseFloat(r.diskon) || 0, pajak: parseFloat(r.pajak) || 0,
            grandTotal: parseFloat(r.grand_total) || 0, hpp: parseFloat(r.hpp) || 0, profit: parseFloat(r.profit) || 0,
            marginPersen: parseFloat(r.margin_persen) || 0, termConditions: _jsonStr(r.term_conditions, '{}'),
            items: _jsonStr(r.items, '[]'), status: (r.status || '').toString(), hoStatus: hoMap[noWO] || '',
            catatanCustomer: catatanMap[noWO] || '', jenisWO: jenisEfektif, jenisWOAuto: jenisAuto,
            jenisWOManual: jenisManual, adaJasa: jenisEfektif === 'Jasa'
          };
        });
        list.sort(function (a, b) { return b.noWO.localeCompare(a.noWO, undefined, { numeric: true }); });
        return list;
      }
      window.gsRoute('getWorkOrderList', { mode: 'fn', handler: function () { return _woListData(); } });

      // ── Work Order dashboard (WorkOrder.gs → getWorkOrderDashboard) ───────
      //  = _woListData + agregasi invoice/pembayaran per WO (menu Work Order).
      window.gsRoute('getWorkOrderDashboard', {
        mode: 'fn',
        handler: async function () {
          var woList = await _woListData();
          var invList = await _invoiceList();
          var invByWO = {};
          invList.forEach(function (inv) {
            var noWO = inv.noWO || ''; if (!noWO) return;
            (invByWO[noWO] = invByWO[noWO] || []).push({
              id: inv.id, tanggal: inv.tanggal, jenis: inv.jenis, persen: inv.persen,
              dpp: inv.dpp, ppnNominal: inv.ppnNominal, total: inv.total,
              statusBayar: inv.statusBayar, kwitansiId: inv.kwitansiId
            });
          });
          var sumKontrak = 0, sumDitagih = 0, sumLunas = 0;
          var woDashboard = woList.map(function (w) {
            var nilaiKontrak = Math.max(0, (w.subtotal || 0) - (w.diskon || 0));
            var ppnRate = nilaiKontrak > 0 ? Math.round((w.pajak || 0) / nilaiKontrak * 100) : 0;
            var invoices = invByWO[w.noWO] || [];
            var totalDitagihDpp = 0, totalLunasDpp = 0, totalLunasTotal = 0;
            invoices.forEach(function (inv) {
              totalDitagihDpp += inv.dpp;
              if (inv.statusBayar === 'Lunas') { totalLunasDpp += inv.dpp; totalLunasTotal += inv.total; }
            });
            var sisaDpp = Math.max(0, nilaiKontrak - totalDitagihDpp);
            var pctDitagih = nilaiKontrak > 0 ? Math.min(100, Math.round(totalDitagihDpp / nilaiKontrak * 100)) : 0;
            var pctLunas = nilaiKontrak > 0 ? Math.min(100, Math.round(totalLunasDpp / nilaiKontrak * 100)) : 0;
            var paymentStatus;
            if (invoices.length === 0) paymentStatus = 'Belum Ditagih';
            else if (pctLunas >= 100 && pctDitagih >= 100) paymentStatus = 'Lunas';
            else if (totalLunasDpp > 0) paymentStatus = 'Lunas Sebagian';
            else paymentStatus = 'Ditagih';
            sumKontrak += nilaiKontrak;
            sumDitagih += totalDitagihDpp + Math.round(totalDitagihDpp * ppnRate / 100);
            sumLunas += totalLunasTotal;
            return {
              noWO: w.noWO, id: w.id, rev: w.rev, tanggal: w.tanggal, namaProject: w.namaProject,
              namaKlien: w.namaKlien, dibuatOleh: w.dibuatOleh, subtotal: w.subtotal, diskon: w.diskon,
              pajak: w.pajak, grandTotal: w.grandTotal, hpp: w.hpp, profit: w.profit, marginPersen: w.marginPersen,
              items: w.items, termConditions: w.termConditions, catatanCustomer: w.catatanCustomer,
              nilaiKontrak: nilaiKontrak, ppnRate: ppnRate, totalDitagihDpp: totalDitagihDpp,
              totalLunasDpp: totalLunasDpp, totalLunasTotal: totalLunasTotal, sisaDpp: sisaDpp,
              pctDitagih: pctDitagih, pctLunas: pctLunas, paymentStatus: paymentStatus, invoices: invoices,
              hoStatus: w.hoStatus || '', jenisWO: w.jenisWO || 'Material', jenisWOAuto: w.jenisWOAuto || 'Material',
              jenisWOManual: w.jenisWOManual || '', adaJasa: !!w.adaJasa
            };
          });
          return {
            success: true, woList: woDashboard,
            summary: { totalWO: woDashboard.length, totalKontrak: sumKontrak, totalDitagih: sumDitagih, totalLunas: sumLunas }
          };
        }
      });

      // ── Realisasi HPP & Margin per WO (WorkOrder.gs → getRealisasiHPP) ────
      //  Semua sumber difilter per-WO (data kecil) → aman di klien.
      async function _realisasiHPP(noWO) {
          noWO = (noWO || '').toString().trim();
          if (!noWO) return { success: false, message: 'No WO wajib diisi.' };
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(supa.from('penawaran').select('rev,subtotal,diskon,total_hpp,nama_project,klien_id').eq('no_wo', noWO)),
            _safe(_all('klien', 'id,nama_klien')),
            _safe(supa.from('pengeluaran').select('*').eq('no_wo', noWO)),
            _safe(supa.from('purchase_order').select('no_po,nama_supplier,status_po,status_bayar,grand_total,total_dibayar').eq('no_wo', noWO))
          ]);
          var penq = res[0], kq = res[1], eq = res[2], poq = res[3];
          var klienMap = {}; (kq.data || []).forEach(function (k) { klienMap[k.id] = k.nama_klien || ''; });

          // Revisi tertinggi penawaran untuk WO ini.
          var nilaiKontrak = 0, estimasiHPP = 0, namaProject = '', namaKlien = '', maxRev = -1;
          (penq.data || []).forEach(function (p) {
            var rev = parseInt(p.rev) || 0;
            if (rev <= maxRev) return;
            maxRev = rev;
            nilaiKontrak = Math.max(0, (parseFloat(p.subtotal) || 0) - (parseFloat(p.diskon) || 0));
            estimasiHPP = parseFloat(p.total_hpp) || 0;
            namaProject = (p.nama_project || '').toString();
            namaKlien = klienMap[p.klien_id] || p.klien_id || '';
          });

          var realisasiHPP = 0, akunMap = {}, sumberMap = { 'Pembayaran PO': 0, 'Penggunaan Stok': 0, 'Langsung': 0 };
          var pengeluaranList = [];
          (eq.data || []).forEach(function (r) {
            var total = parseFloat(r.total) || 0;
            var sumber = (r.sumber || '').toString();
            var namaAkun = (r.nama_akun || '').toString();
            realisasiHPP += total;
            akunMap[namaAkun] = (akunMap[namaAkun] || 0) + total;
            if (sumber in sumberMap) sumberMap[sumber] += total;
            pengeluaranList.push({
              id: r.id_pengeluaran || '', tanggal: _fmtTgl(r.tanggal), sumber: sumber,
              noPO: r.no_po || '', idReferensi: r.id_referensi || '', idAkun: r.id_akun || '',
              namaAkun: namaAkun, deskripsi: r.deskripsi || '', qty: parseFloat(r.qty) || 0,
              satuan: r.satuan || '', hargaSatuan: parseFloat(r.harga_satuan) || 0, total: total,
              catatan: r.catatan || ''
            });
          });

          var selisih = estimasiHPP - realisasiHPP;
          var selisihPersen = estimasiHPP > 0 ? Math.round(selisih / estimasiHPP * 100) : null;
          var marginEstimasi = nilaiKontrak > 0 ? ((nilaiKontrak - estimasiHPP) / nilaiKontrak * 100) : null;
          var marginRealisasi = nilaiKontrak > 0 ? ((nilaiKontrak - realisasiHPP) / nilaiKontrak * 100) : null;
          var breakdownAkun = Object.keys(akunMap).map(function (nama) {
            return { namaAkun: nama, total: akunMap[nama], persen: realisasiHPP > 0 ? Math.round(akunMap[nama] / realisasiHPP * 100) : 0 };
          }).sort(function (a, b) { return b.total - a.total; });
          var breakdownSumber = Object.keys(sumberMap).map(function (s) {
            return { sumber: s, total: sumberMap[s], persen: realisasiHPP > 0 ? Math.round(sumberMap[s] / realisasiHPP * 100) : 0 };
          });
          var poTerkait = (poq.data || []).map(function (r) {
            var gt = parseFloat(r.grand_total) || 0, tb = parseFloat(r.total_dibayar) || 0;
            return {
              noPO: r.no_po || '', namaSupplier: r.nama_supplier || '', statusPO: r.status_po || '',
              statusBayar: r.status_bayar || '', grandTotal: gt, totalDibayar: tb, sisaTagihan: Math.max(0, gt - tb)
            };
          });
          pengeluaranList.reverse();

          return {
            success: true, noWO: noWO, namaProject: namaProject, namaKlien: namaKlien,
            nilaiKontrak: nilaiKontrak, estimasiHPP: estimasiHPP, realisasiHPP: realisasiHPP,
            selisih: selisih, selisihPersen: selisihPersen, marginEstimasi: marginEstimasi,
            marginRealisasi: marginRealisasi, breakdownAkun: breakdownAkun, breakdownSumber: breakdownSumber,
            pengeluaranList: pengeluaranList, poTerkait: poTerkait
          };
      }
      window.gsRoute('getRealisasiHPP', { mode: 'fn', handler: function (args) { return _realisasiHPP(args[0]); } });
