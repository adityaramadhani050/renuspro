      // ── Master Klien (Customer.gs → getCustomerList) ──────────────────────
      // Balikan lama: ARRAY [{ id, nama, perusahaan, kontak, alamat }]
      window.gsRoute('getCustomerList', {
        mode: 'fn',
        handler: async function () {
          var q = await supa.from('klien')
            .select('id,nama_klien,perusahaan,kontak,alamat').order('id');
          if (q.error) { console.error('[getCustomerList]', q.error); return []; }
          return (q.data || []).map(function (r) {
            return {
              id: r.id || '', nama: r.nama_klien || '', perusahaan: r.perusahaan || '',
              kontak: r.kontak || '', alamat: r.alamat || ''
            };
          });
        }
      });

      // ── Master Supplier (Supplier.gs → getSupplierList) ───────────────────
      // Balikan lama: ARRAY [{ id, nama, pic, telepon, email, alamat, catatan,
      //                 status, dibuatOleh, dibuatPada, alias }]
      window.gsRoute('getSupplierList', {
        mode: 'fn',
        handler: async function () {
          var q = await supa.from('supplier')
            .select('id_supplier,nama,pic,telepon,email,alamat,catatan,status,dibuat_oleh,dibuat_pada,nama_alias')
            .order('id_supplier');
          if (q.error) { console.error('[getSupplierList]', q.error); return []; }
          return (q.data || []).map(function (r) {
            return {
              id: r.id_supplier || '', nama: r.nama || '', pic: r.pic || '',
              telepon: r.telepon || '', email: r.email || '', alamat: r.alamat || '',
              catatan: r.catatan || '', status: r.status || '',
              dibuatOleh: r.dibuat_oleh || '', dibuatPada: r.dibuat_pada || '',
              alias: r.nama_alias || ''
            };
          });
        }
      });

      // ── Master Produk/Jasa (Produk.gs → getProdukList) ────────────────────
      // Balikan lama: ARRAY [{ sku, nama, unit, harga, hpp, tipe, stokId, qtyTersedia }]
      window.gsRoute('getProdukList', {
        mode: 'fn',
        handler: async function () {
          var q = await supa.from('produk')
            .select('id,nama,unit,harga_satuan,hpp,tipe,stok_id,qty_tersedia').order('id');
          if (q.error) { console.error('[getProdukList]', q.error); return []; }
          return (q.data || []).map(function (r) {
            return {
              sku: r.id || '', nama: r.nama || '', unit: r.unit || '',
              harga: Number(r.harga_satuan) || 0, hpp: Number(r.hpp) || 0,
              tipe: r.tipe || '', stokId: r.stok_id || '',
              qtyTersedia: Number(r.qty_tersedia) || 0
            };
          });
        }
      });

      // ── Manajemen User (Auth.gs → getUserList) ────────────────────────────
      // Balikan lama: ARRAY [{ id, nama, username, role, aktif, targetBulanan,
      //                 leadId, noWa, email }]
      window.gsRoute('getUserList', {
        mode: 'fn',
        handler: async function () {
          var q = await supa.from('app_user')
            .select('id,nama,username,role,aktif,target_bulanan,lead_id,no_whatsapp,email').order('id');
          if (q.error) { console.error('[getUserList]', q.error); return []; }
          return (q.data || []).map(function (r) {
            return {
              id: r.id || '', nama: r.nama || '', username: r.username || '',
              role: r.role || '', aktif: r.aktif !== false,
              targetBulanan: Number(r.target_bulanan) || 0,
              leadId: r.lead_id || '', noWa: r.no_whatsapp || '', email: r.email || ''
            };
          });
        }
      });

      // ── Akun Pembayaran (Settings.gs → getAkunPembayaranList) ─────────────
      // Balikan lama: { id, namaAkun, tipe, keterangan, status, dibuatOleh,
      //                 dibuatPada, locked }  (locked = id 'AP001')
      window.gsRoute('getAkunPembayaranList', {
        mode: 'fn',
        handler: async function () {
          var q = await supa.from('akun_pembayaran')
            .select('id,nama_akun,tipe,keterangan,status,dibuat_oleh,dibuat_pada,detail').order('id');
          if (q.error) return _fail(q.error);
          return {
            success: true,
            list: (q.data || []).map(function (r) {
              return {
                id: r.id || '', namaAkun: r.nama_akun || '', tipe: r.tipe || '',
                keterangan: r.keterangan || '', status: r.status || '',
                dibuatOleh: r.dibuat_oleh || '', dibuatPada: r.dibuat_pada || '',
                detail: r.detail || '', locked: (r.id === 'AP001')
              };
            })
          };
        }
      });

      // ── Kategori Pricelist (Pricelist.gs → getKategoriList) ────────────────
      // Balikan lama: { success:true, list:[ "NamaKategori", ... ] } (string2)
      window.gsRoute('getKategoriList', {
        mode: 'fn',
        handler: async function () {
          var q = await supa.from('pricelist_kategori').select('nama').order('nama');
          if (q.error) return _fail(q.error);
          return { success: true, list: (q.data || []).map(function (r) { return r.nama; }) };
        }
      });

      // ═══════════════════════════════════════════════════════════════════════
      //  MILESTONE 5 — BACA (list) tabel-sederhana. Bentuk balikan HARUS persis
      //  seperti Apps Script lama (nama field & tipe). Tanggal → dd/MM/yyyy,
      //  jsonb → string (frontend mem-JSON.parse).
      // ═══════════════════════════════════════════════════════════════════════

      // ── Invoice (Invoice.gs → getInvoiceList) — balik ARRAY ───────────────
      window.gsRoute('getInvoiceList', { mode: 'fn', handler: function () { return _invoiceList(); } });

      // ── Kwitansi (Kwitansi.gs → getKwitansiList) — balik ARRAY ────────────
      window.gsRoute('getKwitansiList', {
        mode: 'fn',
        handler: async function () {
          var q = await _all('kwitansi', '*');
          if (q.error) { console.error('[getKwitansiList]', q.error); return []; }
          var list = (q.data || []).map(function (r) {
            return {
              id: r.no_kwitansi || '', noInvoice: r.no_invoice || '', noWO: r.no_wo || '',
              tanggal: _fmtTgl(r.tanggal), terimaDari: r.terima_dari || '',
              jumlah: parseFloat(r.jumlah) || 0, untuk: r.untuk_pembayaran || '',
              metode: r.metode || '', catatan: r.catatan || '', dibuatOleh: r.dibuat_oleh || ''
            };
          });
          list.sort(function (a, b) { return b.id.localeCompare(a.id, undefined, { numeric: true }); });
          return list;
        }
      });

      // ── Purchase Order (PurchaseOrder.gs → getPOList) — balik ARRAY ───────
      window.gsRoute('getPOList', {
        mode: 'fn',
        handler: async function () {
          var q = await _all('purchase_order', '*');
          if (q.error) { console.error('[getPOList]', q.error); return []; }
          // Peta no_wo → nama_project dari penawaran (nama project tidak kritikal).
          var woNama = {};
          var pq = await _all('penawaran', 'no_wo,nama_project');
          if (!pq.error) (pq.data || []).forEach(function (p) {
            var w = (p.no_wo || '').toString().trim();
            if (w && p.nama_project) woNama[w] = p.nama_project;
          });
          return (q.data || []).map(function (r) {
            var noWO = r.no_wo || '';
            var subtotal = parseFloat(r.subtotal) || 0;
            var diskonNom = parseFloat(r.diskon_nominal) || 0;
            return {
              noPO: r.no_po || '', tanggal: _fmtTgl(r.tanggal), idSupplier: r.id_supplier || '',
              namaSupplier: r.nama_supplier || '', peruntukan: r.peruntukan || '', noWO: noWO,
              namaProject: noWO ? (woNama[noWO] || '') : '', statusPO: r.status_po || '',
              subtotal: subtotal, nilaiDPP: Math.max(0, subtotal - diskonNom),
              ppnPersen: parseFloat(r.ppn_persen) || 0, ppnNominal: parseFloat(r.ppn_nominal) || 0,
              grandTotal: parseFloat(r.grand_total) || 0, catatan: r.catatan || '',
              statusBayar: r.status_bayar || '', totalDibayar: parseFloat(r.total_dibayar) || 0,
              dibuatOleh: r.dibuat_oleh || '', dibuatPada: _fmtTgl(r.dibuat_pada),
              diskonPersen: parseFloat(r.diskon_persen) || 0, diskonNominal: diskonNom,
              quotNo: r.no_quotation || '', quotTanggal: _fmtTgl(r.tanggal_quotation),
              termConditions: _jsonStr(r.term_conditions, ''), quotFileId: r.quot_file_id || '',
              quotFileUrl: r.quot_file_url || '', quotFileName: r.quot_file_nama || ''
            };
          });
        }
      });

      // ── Mutasi Stok (Inventory.gs → getMutasiStokList) — balik ARRAY ──────
      window.gsRoute('getMutasiStokList', {
        mode: 'fn',
        handler: async function (args) {
          var params = args[0] || {};
          var q = await _all('mutasi_stok', '*', function(x){return x.order('id_mutasi');});
          if (q.error) { console.error('[getMutasiStokList]', q.error); return []; }
          var list = (q.data || []).map(function (r) {
            return {
              idMutasi: r.id_mutasi || '', tanggal: _fmtTgl(r.tanggal), idProduk: r.id_produk || '',
              namaProduk: r.nama_produk || '', jenisMutasi: r.jenis_mutasi || '', referensi: r.referensi || '',
              qtyMasuk: Number(r.qty_masuk) || 0, qtyKeluar: Number(r.qty_keluar) || 0,
              hargaSatuan: Number(r.harga_satuan) || 0, saldoSetelah: Number(r.saldo_setelah) || 0,
              keterangan: r.keterangan || '', dibuatOleh: r.dibuat_oleh || '',
              dibuatPada: r.dibuat_pada ? r.dibuat_pada.toString() : ''
            };
          }).filter(function (row) {
            if (params.idProduk && row.idProduk !== params.idProduk) return false;
            if (params.jenisMutasi && row.jenisMutasi !== params.jenisMutasi) return false;
            return true;
          });
          list.reverse(); // terbaru dulu (id menaik → dibalik)
          return list;
        }
      });

      // ── Pricelist (Pricelist.gs → getPricelistAll) — balik {success,list} ─
      window.gsRoute('getPricelistAll', {
        mode: 'fn',
        handler: async function () {
          var q = await _all('pricelist', '*');
          if (q.error) return { success: false, list: [], message: q.error.message };
          // Peta supplier → alias/nama.
          var supMap = {};
          var sq = await supa.from('supplier').select('id_supplier,nama,nama_alias');
          if (!sq.error) (sq.data || []).forEach(function (s) {
            supMap[s.id_supplier] = (s.nama_alias && s.nama_alias.trim()) ? s.nama_alias : s.nama;
          });
          var list = (q.data || []).map(function (r) {
            var idSup = r.id_supplier || '';
            return {
              id: r.id || '', idSupplier: idSup,
              namaSupplier: supMap[idSup] || idSup || '(supplier terhapus)',
              kategori: r.kategori || '', namaMaterial: r.nama_material || '',
              spesifikasi: r.spesifikasi || '', merek: r.merek || '', satuan: r.satuan || '',
              hargaBeli: Number(r.harga_beli) || 0, termasukPPN: r.termasuk_ppn === true,
              updateTerakhir: r.dibuat_pada ? r.dibuat_pada.toString() : '', ready: r.ready === true
            };
          });
          return { success: true, list: list };
        }
      });

      // ── Site Engineer aktif (BOM/QC/DED → getSiteEngineerList) ────────────
      window.gsRoute('getSiteEngineerList', {
        mode: 'fn',
        handler: async function () {
          var q = await supa.from('app_user').select('id,nama,username,role,aktif')
            .eq('role', 'siteengineer');
          if (q.error) return { success: false, list: [], message: q.error.message };
          var list = (q.data || []).filter(function (u) { return u.aktif !== false; })
            .map(function (u) { return { id: u.id, nama: u.nama, username: u.username }; });
          return { success: true, list: list };
        }
      });

      // ── Opsi user HO (Schedule/HO → getHOUserOptions) ─────────────────────
      window.gsRoute('getHOUserOptions', {
        mode: 'fn',
        handler: async function () {
          var q = await supa.from('app_user').select('id,nama,role,email,aktif');
          if (q.error) return { success: false, list: [], message: q.error.message };
          var list = (q.data || []).filter(function (u) { return u.aktif !== false; })
            .map(function (u) { return { id: u.id, nama: u.nama, role: u.role, email: u.email || '' }; });
          return { success: true, list: list };
        }
      });

      // ═══════════════════════════════════════════════════════════════════════
      //  MILESTONE 5 — BATCH 2 (site survey, produk per-supplier, hand over)
      // ═══════════════════════════════════════════════════════════════════════

      // ── Site Survey list (SiteSurvey.gs → getSiteSurveyList) ──────────────
      window.gsRoute('getSiteSurveyList', {
        mode: 'fn',
        handler: async function () {
          var q = await _all('site_survey', '*');
          if (q.error) return { success: false, list: [], message: q.error.message };
          var list = (q.data || []).map(function (r) {
            var d = _jsonObj(r.data);
            return {
              id: r.id || '', tanggalSurvey: _fmtTgl(r.tanggal_survey),
              dibuatOleh: r.dibuat_oleh || '', dibuatOlehId: d.dibuatOlehId || '',
              noWO: r.no_wo || d.noWO || '', namaSite: r.nama_site || '',
              namaPIC: r.nama_pic || '', telepon: r.no_telepon || '', alamat: r.alamat || '',
              latitude: (r.latitude !== null && r.latitude !== undefined) ? Number(r.latitude) : null,
              longitude: (r.longitude !== null && r.longitude !== undefined) ? Number(r.longitude) : null,
              dibuatPada: r.dibuat_pada ? r.dibuat_pada.toString() : ''
            };
          });
          list.sort(function (a, b) { return b.id.localeCompare(a.id, undefined, { numeric: true }); });
          return { success: true, list: list };
        }
      });

      // ── Site Survey per WO (SiteSurvey.gs → getSiteSurveysByWO) ───────────
      window.gsRoute('getSiteSurveysByWO', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString().trim();
          if (!noWO) return { success: true, list: [] };
          // Tautan bisa ada di kolom no_wo ATAU di data.noWO (data lama/migrasi).
          // Samakan dgn getSiteSurveyList yg toleran (r.no_wo || d.noWO).
          var q = await _all('site_survey', '*');
          if (q.error) return { success: false, list: [], message: q.error.message };
          var matched = (q.data || []).filter(function (r) {
            var d = _jsonObj(r.data);
            return (r.no_wo || '').toString().trim() === noWO || (d.noWO || '').toString().trim() === noWO;
          });
          var list = matched.map(function (r) {
            return {
              id: r.id || '', tanggalSurvey: _fmtTgl(r.tanggal_survey),
              dibuatOleh: r.dibuat_oleh || '', namaSite: r.nama_site || '',
              namaPIC: r.nama_pic || '', telepon: r.no_telepon || '', alamat: r.alamat || ''
            };
          });
          list.sort(function (a, b) { return b.id.localeCompare(a.id, undefined, { numeric: true }); });
          return { success: true, list: list };
        }
      });

      // ── Produk per Supplier (Supplier.gs → getProdukBySupplier) ───────────
      //  = pricelist milik supplier (tanpa filter ready). leadTime di sumber
      //  lama selalu kosong → dipertahankan '' agar sama persis.
      window.gsRoute('getProdukBySupplier', {
        mode: 'fn',
        handler: async function (args) {
          var idSupplier = (args[0] || '').toString().trim();
          var q = await supa.from('pricelist')
            .select('id,nama_material,spesifikasi,merek,satuan,harga_beli').eq('id_supplier', idSupplier);
          if (q.error) return { success: false, list: [], message: q.error.message };
          var list = (q.data || []).map(function (it) {
            // `nama` (label lama = "nama - spesifikasi") dipertahankan agar nama item
            // yang tersimpan di PO tak berubah. Field terpisah dipakai frontend untuk
            // menyusun label konsisten "Merek - Nama Material (Spesifikasi/Tipe)".
            var label = (it.nama_material || '') + (it.spesifikasi ? ' - ' + it.spesifikasi : '');
            return {
              id: it.id || '', nama: label, unit: it.satuan || '',
              namaMaterial: it.nama_material || '', merek: it.merek || '', spesifikasi: it.spesifikasi || '',
              hargaBeli: Number(it.harga_beli) || 0, leadTime: ''
            };
          }).sort(function (a, b) { return a.nama.localeCompare(b.nama); });
          return { success: true, list: list };
        }
      });

      // ── Hand Over per WO (WorkOrder.gs → getHandOverByWO) ─────────────────
      window.gsRoute('getHandOverByWO', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString().trim();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          var q = await supa.from('hand_over').select('*').eq('no_wo', noWO).maybeSingle();
          if (q.error) return { success: false, message: q.error.message };
          var bayar = (typeof _woPembayaranLunas === 'function') ? await _woPembayaranLunas(noWO) : { count: 0, total: 0 };
          if (!q.data) return { success: true, record: null, hasPembayaranLunas: bayar.count > 0, bayarCount: bayar.count, bayarTotal: bayar.total };
          var r = q.data;
          // Peserta disimpan sebagai CSV user id → resolve ke nama untuk tampilan
          // (token yang bukan id dibiarkan apa adanya, kompat data lama by-nama).
          var pesertaNama = '';
          if (r.peserta) {
            var uq = await supa.from('app_user').select('id,nama');
            var nmById = {}; (uq.data || []).forEach(function (u) { if (u.id != null) nmById[u.id.toString()] = u.nama || ''; });
            pesertaNama = (r.peserta || '').split(',').map(function (t) { t = t.trim(); return t ? (nmById[t] || t) : ''; }).filter(Boolean).join(', ');
          }
          return {
            success: true,
            hasPembayaranLunas: bayar.count > 0, bayarCount: bayar.count, bayarTotal: bayar.total,
            record: {
              noWO: noWO, status: r.status || '', dimintaOleh: r.diminta_oleh || '',
              dimintaPada: _fmtTs(r.diminta_pada),
              tglJadwal: r.tgl_jadwal ? r.tgl_jadwal.toString().slice(0, 10) : '',
              waktu: r.waktu ? r.waktu.toString().slice(0, 5) : '',
              mode: r.mode || '', linkMeet: r.link_meet || '', lokasi: r.lokasi || '',
              peserta: r.peserta || '', pesertaNama: pesertaNama, catatanUndangan: r.catatan_undangan || '',
              dijadwalkanOleh: r.dijadwalkan_oleh || '', dijadwalkanPada: _fmtTs(r.dijadwalkan_pada),
              mom: r.mom || '', selesaiOleh: r.selesai_oleh || '', selesaiPada: _fmtTs(r.selesai_pada),
              meetEventId: r.meet_event_id || ''
            }
          };
        }
      });

      // ═══════════════════════════════════════════════════════════════════════
      //  MILESTONE 5 — BATCH 3 (checklist DED, detail site survey, request bayar)
      // ═══════════════════════════════════════════════════════════════════════

      // ── Checklist DED master (DED.gs → getDEDChecklist) ───────────────────
      window.gsRoute('getDEDChecklist', {
        mode: 'fn',
        handler: async function () {
          var q = await supa.from('ded_checklist').select('*').order('urutan');
          if (q.error) return { success: false, list: [], message: q.error.message };
          var list = (q.data || []).map(function (r, i) {
            return {
              kode: r.kode || '', label: r.label || '', wajib: r.wajib === true,
              urutan: Number(r.urutan) || (i + 1), instruksi: r.instruksi || ''
            };
          });
          list.sort(function (a, b) { return a.urutan - b.urutan; });
          return { success: true, list: list };
        }
      });

      // ── Detail Site Survey (SiteSurvey.gs → getSiteSurveyDetail) ──────────
      window.gsRoute('getSiteSurveyDetail', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim();
          if (!id) return { success: false, message: 'ID wajib.' };
          var q = await supa.from('site_survey').select('*').eq('id', id).maybeSingle();
          if (q.error) return { success: false, message: q.error.message };
          if (!q.data) return { success: false, message: 'Survey tidak ditemukan.' };
          var r = q.data, d = _jsonObj(r.data);
          return {
            success: true,
            survey: {
              id: r.id || '', tanggalSurvey: _fmtTgl(r.tanggal_survey),
              dibuatOleh: r.dibuat_oleh || '', dibuatOlehId: d.dibuatOlehId || '',
              noWO: r.no_wo || d.noWO || '', namaSite: r.nama_site || '',
              namaPIC: r.nama_pic || '', telepon: r.no_telepon || '', alamat: r.alamat || '',
              latitude: (r.latitude !== null && r.latitude !== undefined) ? Number(r.latitude) : null,
              longitude: (r.longitude !== null && r.longitude !== undefined) ? Number(r.longitude) : null,
              dibuatPada: r.dibuat_pada ? r.dibuat_pada.toString() : '',
              arahBangunan: d.arahBangunan || '', tinggiBangunan: d.tinggiBangunan || 0,
              fotoBangunan: d.fotoBangunan || null, kelistrikan: d.kelistrikan || {},
              bos: d.bos || {}, atap: d.atap || {}, jalurKabel: d.jalurKabel || {}
            }
          };
        }
      });

      // ── Request Pembayaran PO (PurchaseOrder.gs → getPaymentRequestList) ──
      window.gsRoute('getPaymentRequestList', {
        mode: 'fn',
        handler: async function (args) {
          var params = args[0] || {};
          var q = await _all('po_payment_request', '*', function(x){return x.order('id_request');});
          if (q.error) return { success: false, list: [], message: q.error.message };
          var list = (q.data || []).map(function (r) {
            return {
              idReq: r.id_request || '', noPO: r.no_po || '', noWO: r.no_wo || '',
              namaSupplier: r.nama_supplier || '', grandTotalPO: parseFloat(r.grand_total_po) || 0,
              tanggalRequest: _fmtTgl(r.tanggal_request), jumlah: parseFloat(r.jumlah) || 0,
              persentase: parseFloat(r.persentase) || 0, catatan: r.catatan || '',
              status: r.status || '', dibuatOleh: r.dibuat_oleh || '',
              dibuatPada: r.dibuat_pada ? r.dibuat_pada.toString() : '', namaAkun: r.nama_akun || '',
              diapproveOleh: r.diapprove_oleh || '', tanggalApprove: _fmtTgl(r.tanggal_approve),
              invoiceFileId: r.invoice_file_id || '', invoiceFileUrl: r.invoice_file_url || '',
              invoiceFileName: r.invoice_file_nama || '', catatanTolak: r.catatan_tolak || '',
              buktiFileId: r.bukti_file_id || '', buktiFileUrl: r.bukti_file_url || '',
              buktiFileName: r.bukti_file_nama || ''
            };
          }).filter(function (row) { return params.status ? row.status === params.status : true; });
          list.reverse();
          return { success: true, list: list };
        }
      });

      // ═══════════════════════════════════════════════════════════════════════
      //  MILESTONE 5 — BATCH 4 (bootstrap penawaran + Template Paket)
      // ═══════════════════════════════════════════════════════════════════════

      // ── getInitialData: bundle klien + produk + templatePaket + nextNo ────
      //  Dipakai form Penawaran & menu Template Paket. nextNo hanya PETUNJUK
      //  tampilan (nomor asli ditetapkan Apps Script saat simpan) → aman.
      window.gsRoute('getInitialData', {
        mode: 'fn',
        handler: async function () {
          try {
            // Jalankan PARALEL & tiap query tahan-error: kegagalan satu tabel
            // (mis. penawaran/template) TIDAK boleh mengosongkan daftar klien.
            var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
            var res = await Promise.all([
              _all('klien', 'id,nama_klien,perusahaan,alamat,kontak', function (q) { return q.order('id'); }),
              _all('produk', 'id,nama,unit,harga_satuan,hpp', function (q) { return q.order('id'); }),
              _safe(supa.from('template_paket').select('id,nama_paket,daftar_item')),
              _safe(_all('penawaran', 'no_penawaran'))
            ]);
            var kq = res[0], pq = res[1], tq = res[2], nq = res[3];
            if (kq.error) console.error('[getInitialData] klien:', kq.error);
            if (pq.error) console.error('[getInitialData] produk:', pq.error);
            if (tq.error) console.error('[getInitialData] template:', tq.error);
            if (nq.error) console.error('[getInitialData] penawaran:', nq.error);

            var klienList = (kq.data || []).map(function (r) {
              return {
                id: r.id || '', nama: r.nama_klien || '', perusahaan: r.perusahaan || '',
                alamat: r.alamat || '', kontak: r.kontak || ''
              };
            });

            var produkMap = {}, produkList = [];
            (pq.data || []).forEach(function (r) {
              var pid = r.id || '';
              var p = { nama: r.nama || '', unit: r.unit || '', harga: Number(r.harga_satuan) || 0, hpp: Number(r.hpp) || 0 };
              produkMap[pid] = p;
              produkList.push({ id: pid, nama: p.nama, unit: p.unit, harga: p.harga, hpp: p.hpp });
            });

            var templatePaket = {};
            (tq.data || []).forEach(function (r) {
              if (!r.id || !r.nama_paket) return;
              var raw = _jsonObj(r.daftar_item);
              if (!Array.isArray(raw)) { try { raw = JSON.parse(r.daftar_item || '[]'); } catch (e) { raw = []; } }
              if (!Array.isArray(raw)) raw = [];
              var items = raw.map(function (it) {
                var p = produkMap[it.produkId] || {};
                return {
                  produkId: it.produkId, deskripsi: it.deskripsi || p.nama || '',
                  qty: it.qty || 1, unit: p.unit || it.unit || '',
                  harga: p.harga || it.harga || 0, hpp: p.hpp || it.hpp || 0
                };
              });
              templatePaket[r.id.toString()] = { nama: r.nama_paket.toString(), items: items };
            });

            // nextNo — nomor penawaran berikutnya (petunjuk): cari NNN terbesar
            // dari "NNN/QUOT..." lalu +1, format NNN/QUOT/{bulan romawi}/{tahun}.
            var maxId = 0;
            (nq.data || []).forEach(function (r) {
              var m = (r.no_penawaran || '').toString().match(/^(\d+)\/QUOT/);
              if (m) { var n = parseInt(m[1], 10); if (n > maxId) maxId = n; }
            });
            var roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
            var now = new Date();
            var mo = now.getMonth(), yr = now.getFullYear();
            try {
              var parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric', month: 'numeric' }).formatToParts(now);
              mo = parseInt(parts.find(function (p) { return p.type === 'month'; }).value, 10) - 1;
              yr = parseInt(parts.find(function (p) { return p.type === 'year'; }).value, 10);
            } catch (e) {}
            // padStart (min 3 digit) — jangan slice(-3) agar tak wrap ke '000' setelah >999.
            var nextNo = String(maxId + 1).padStart(3, '0') + '/QUOT/' + roman[mo] + '/' + yr;

            // success:true selama tak ada exception fatal — klien tetap tampil
            // walau template/penawaran gagal (mereka hanya memengaruhi menu lain).
            return { klien: klienList, produk: produkList, templatePaket: templatePaket, nextNo: nextNo, success: true };
          } catch (e) {
            console.error('[getInitialData]', e);
            return { klien: [], produk: [], templatePaket: {}, nextNo: '001/QUOT/I/' + (new Date().getFullYear()), success: false, error: String(e) };
          }
        }
      });

      // ═══════════════════════════════════════════════════════════════════════
      //  MILESTONE 5 — BATCH 5 (Penawaran list + bootstrap Kwitansi)
      // ═══════════════════════════════════════════════════════════════════════
