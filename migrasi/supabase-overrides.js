/* =============================================================================
 *  RenusPro — Override modul ke Supabase (Milestone 4)
 *  Dimuat SETELAH gs-run-shim.js. Meng-override fungsi tertentu (mulai: login)
 *  agar memakai Supabase, tanpa mengubah tampilan. Fungsi lain yang BELUM
 *  di-override tetap jalan lewat backend Apps Script lama.
 *
 *  CARA PAKAI: isi 2 nilai di bawah (Project URL & anon key dari Supabase →
 *  Settings → API). Bila belum diisi, file ini TIDAK berbuat apa-apa (login
 *  lama tetap dipakai).
 * ========================================================================== */
(function () {
  'use strict';

  // ── ISI DUA NILAI INI ──────────────────────────────────────────────────────
  var SUPABASE_URL  = 'https://kekmetvugzwnxcpbqvfv.supabase.co';   // contoh: https://abcd1234.supabase.co
  var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtla21ldHZ1Z3p3bnhjcGJxdmZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5MTgyMDAsImV4cCI6MjEwMTQ5NDIwMH0.CACdZkn_uXCbDETd-pAj8YHfOQuhZ_Qje1X0Avlw_-c';      // anon public key (aman untuk frontend)
  // ───────────────────────────────────────────────────────────────────────────

  // Nyalakan jadi `true` HANYA SETELAH Edge Function 'get-stok-list' ter-deploy
  // (lihat migrasi/PANDUAN-EDGE-FUNCTIONS.md). Selama false, getStokList tetap
  // memakai Apps Script lama supaya Inventory tidak rusak.
  var ENABLE_EDGE_STOK = true;

  if (!SUPABASE_URL || SUPABASE_URL.indexOf('ISI_') === 0 ||
      !SUPABASE_ANON || SUPABASE_ANON.indexOf('ISI_') === 0) {
    return; // belum dikonfigurasi → biarkan login lama (Apps Script) tetap jalan
  }

  import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
    .then(function (mod) {
      var supa = mod.createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: true } });
      window.supa = supa; // dipakai override modul berikutnya

      if (typeof window.gsRoute !== 'function') {
        console.error('[supabase-overrides] gs-run-shim belum dimuat.');
        return;
      }

      // ── LOGIN → Supabase Auth (email + password), profil dari app_user ──
      window.gsRoute('loginUser', {
        mode: 'fn',
        handler: async function (args) {
          var email = (args[0] || '').toString().trim();
          var password = (args[1] || '').toString();
          if (!email || !password) return { success: false, message: 'Email dan password wajib diisi.' };
          if (email.indexOf('@') === -1) return { success: false, message: 'Masukkan EMAIL (bukan username) untuk login.' };

          var r = await supa.auth.signInWithPassword({ email: email, password: password });
          if (r.error) return { success: false, message: 'Email atau password salah.' };
          window.__RENUS_TOKEN__ = (r.data && r.data.session) ? r.data.session.access_token : '';

          var uid = r.data.user.id;
          var p = await supa.from('app_user')
            .select('id,nama,username,role,lead_id,aktif').eq('auth_uid', uid).maybeSingle();
          if (p.error || !p.data) return { success: false, message: 'Profil user tidak ditemukan di app_user.' };
          if (p.data.aktif === false) return { success: false, message: 'Akun ini tidak aktif. Hubungi administrator.' };

          return {
            success: true,
            message: 'Selamat datang, ' + (p.data.nama || '') + '!',
            user: {
              id: p.data.id, nama: p.data.nama, username: p.data.username,
              role: (p.data.role || 'sales').toLowerCase(), leadId: p.data.lead_id || ''
            }
          };
        }
      });

      // ═══════════════════════════════════════════════════════════════════════
      //  MASTER DATA (baca) — override sederhana `supa.from(...).select()`.
      //  Semua memetakan kolom Supabase (snake_case) → nama field yang DIHARAPKAN
      //  frontend (camelCase). Bentuk balikan HARUS sama persis dengan Apps Script
      //  lama, kalau tidak UI bisa rusak. Semua balik: { success:true, list:[...] }.
      // ═══════════════════════════════════════════════════════════════════════

      // Helper: bungkus error jadi bentuk seragam.
      function _fail(error) { return { success: false, message: error.message || String(error) }; }

      // Helper: format tanggal → 'dd/MM/yyyy' (zona Asia/Jakarta), meniru _fmtTgl
      // Apps Script. Supabase `date` → 'YYYY-MM-DD'; `timestamptz` → ISO ...Z.
      function _fmtTgl(v) {
        if (!v) return '';
        var s = v.toString();
        var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); // date-only → langsung, tanpa geser TZ
        if (m) return m[3] + '/' + m[2] + '/' + m[1];
        var d = new Date(s);
        if (isNaN(d.getTime())) return s;
        try {
          var p = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric'
          }).formatToParts(d);
          var g = function (t) { var x = p.find(function (e) { return e.type === t; }); return x ? x.value : ''; };
          return g('day') + '/' + g('month') + '/' + g('year');
        } catch (e) {
          var z = function (n) { return (n < 10 ? '0' : '') + n; };
          return z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + d.getFullYear();
        }
      }

      // Helper: field JSON (jsonb Supabase = objek) → STRING, karena frontend lama
      // mem-`JSON.parse` field ini (mis. invoice.items, po.termConditions).
      function _jsonStr(v, dflt) {
        if (v === null || v === undefined) return dflt;
        if (typeof v === 'string') return v;
        try { return JSON.stringify(v); } catch (e) { return dflt; }
      }

      // Helper: field JSON → OBJEK (kebalikan _jsonStr) untuk baca isinya.
      function _jsonObj(v) {
        if (!v) return {};
        if (typeof v === 'object') return v;
        try { return JSON.parse(v); } catch (e) { return {}; }
      }

      // Helper: timestamp → 'dd/MM/yyyy HH:mm' (Asia/Jakarta), meniru _hoTs.
      function _fmtTs(v) {
        if (!v) return '';
        var d = new Date(v.toString());
        if (isNaN(d.getTime())) return v.toString();
        try {
          var p = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false
          }).formatToParts(d);
          var g = function (t) { var x = p.find(function (e) { return e.type === t; }); return x ? x.value : ''; };
          return g('day') + '/' + g('month') + '/' + g('year') + ' ' + g('hour') + ':' + g('minute');
        } catch (e) { return _fmtTgl(v); }
      }

      // Helper: filter rentang tanggal (tgl 'dd/MM/yyyy', dari/sampai 'yyyy-MM-dd').
      function _inDateRange(tgl, dari, sampai) {
        if (!dari && !sampai) return true;
        var tp = (tgl || '').split('/');
        if (tp.length !== 3) return true;
        var ms = new Date(parseInt(tp[2]), parseInt(tp[1]) - 1, parseInt(tp[0])).getTime();
        if (dari) { var fd = dari.split('-'); if (ms < new Date(parseInt(fd[0]), parseInt(fd[1]) - 1, parseInt(fd[2])).getTime()) return false; }
        if (sampai) { var td = sampai.split('-'); if (ms > new Date(parseInt(td[0]), parseInt(td[1]) - 1, parseInt(td[2])).getTime()) return false; }
        return true;
      }

      // Helper bersama: daftar invoice (dipakai getInvoiceList & getKwitansiInitialData).
      async function _invoiceList() {
        var q = await supa.from('invoice').select('*');
        if (q.error) { console.error('[invoiceList]', q.error); return []; }
        var kwMap = {};
        var kq = await supa.from('kwitansi').select('no_kwitansi,no_invoice');
        if (!kq.error) (kq.data || []).forEach(function (k) {
          if (k.no_invoice) kwMap[k.no_invoice] = k.no_kwitansi;
        });
        var list = (q.data || []).map(function (r) {
          return {
            id: r.no_invoice || '', noWO: r.no_wo || '', noPenawaran: r.no_penawaran || '',
            tanggal: _fmtTgl(r.tanggal), jenis: r.jenis || 'Penuh',
            persen: parseFloat(r.persen) || 0, noPO: r.no_po || '', tglPO: _fmtTgl(r.tgl_po),
            klienId: r.klien_id || '', namaKlien: r.nama_klien || '', namaProject: r.nama_project || '',
            dpp: parseFloat(r.dpp) || 0, ppnPersen: parseFloat(r.ppn_persen) || 0,
            ppnNominal: parseFloat(r.ppn_nominal) || 0, total: parseFloat(r.total) || 0,
            items: _jsonStr(r.rincian_item, '[]'), statusBayar: r.status_bayar || 'Belum Lunas',
            catatan: r.catatan || '', dibuatOleh: r.dibuat_oleh || '', bankAccount: r.bank_account || '',
            buktiFileId: r.bukti_file_id || '', buktiFileUrl: r.bukti_file_url || '',
            buktiFileName: r.bukti_file_nama || '', kwitansiId: kwMap[r.no_invoice] || ''
          };
        });
        list.sort(function (a, b) { return b.id.localeCompare(a.id, undefined, { numeric: true }); });
        return list;
      }

      // Helper bersama: PO menunggu penerimaan gudang (dipakai list & bundle).
      async function _poMenunggu() {
        var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
        var res = await Promise.all([
          _safe(supa.from('purchase_order').select('no_po,tanggal,nama_supplier,peruntukan,no_wo,ppn_persen,status_po')),
          _safe(supa.from('po_item').select('*')),
          _safe(supa.from('penawaran').select('no_wo,nama_project'))
        ]);
        var pq = res[0], iq = res[1], nq = res[2];
        var itemsByPO = {};
        (iq.data || []).forEach(function (row) {
          var noPO = (row.no_po || '').toString().trim();
          if (!noPO) return;
          var qtyPesan = Number(row.qty) || 0, qtyDiterima = Number(row.qty_diterima) || 0;
          var qtySisa = qtyPesan - qtyDiterima;
          if (qtySisa <= 0) return;
          if (!itemsByPO[noPO]) itemsByPO[noPO] = [];
          itemsByPO[noPO].push({
            idItem: row.id_item || '', namaItem: row.nama_item || '', satuan: row.satuan || '',
            hargaBeli: Number(row.harga_beli_satuan) || 0, qtyPesan: qtyPesan,
            qtyDiterima: qtyDiterima, qtySisa: qtySisa
          });
        });
        var woNama = {};
        (nq.data || []).forEach(function (p) { var w = (p.no_wo || '').toString().trim(); if (w && p.nama_project) woNama[w] = p.nama_project; });
        var out = [];
        (pq.data || []).forEach(function (r) {
          var status = (r.status_po || '').toString();
          if (status !== 'Menunggu Gudang' && status !== 'Menunggu Penerimaan Gudang') return;
          var noPO = (r.no_po || '').toString().trim();
          var noWO = (r.no_wo || '').toString();
          out.push({
            noPO: noPO, tanggal: _fmtTgl(r.tanggal), namaSupplier: r.nama_supplier || '',
            peruntukan: r.peruntukan || '', noWO: noWO, namaProject: noWO ? (woNama[noWO] || '') : '',
            ppnPersen: parseFloat(r.ppn_persen) || 0,
            jumlahItemPending: (itemsByPO[noPO] || []).length, items: itemsByPO[noPO] || []
          });
        });
        return out;
      }

      // Helper bersama: riwayat penerimaan (dipakai list & bundle & filter noPO).
      async function _riwayatPenerimaan(noPO) {
        var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
        var res = await Promise.all([
          _safe(supa.from('purchase_order').select('no_po,nama_supplier,peruntukan,no_wo')),
          _safe(supa.from('penerimaan_po_log').select('*'))
        ]);
        var pq = res[0], lq = res[1];
        var poInfo = {};
        (pq.data || []).forEach(function (p) {
          if (p.no_po) poInfo[p.no_po] = { namaSupplier: p.nama_supplier || '', peruntukan: p.peruntukan || '', noWO: p.no_wo || '' };
        });
        var list = (lq.data || []).map(function (lr) {
          var det = _jsonObj(lr.detail_item); if (!Array.isArray(det)) det = [];
          var info = poInfo[(lr.no_po || '').toString().trim()] || {};
          return {
            idLog: lr.id_log || '', noPO: lr.no_po || '', namaSupplier: info.namaSupplier || '',
            peruntukan: info.peruntukan || '', noWO: info.noWO || '', tanggal: _fmtTgl(lr.tanggal),
            mode: lr.mode || '', jumlahItem: parseFloat(lr.jumlah_item) || 0, items: det,
            dibuatOleh: lr.dibuat_oleh || '', dibuatPada: lr.dibuat_pada ? lr.dibuat_pada.toString() : '',
            buktiFileId: lr.bukti_file_id || '', buktiFileUrl: lr.bukti_file_url || '',
            buktiFileName: lr.bukti_file_nama || ''
          };
        }).filter(function (row) { return noPO ? row.noPO === noPO : true; });
        list.reverse();
        return list;
      }

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
            .select('id,nama_akun,tipe,keterangan,status,dibuat_oleh,dibuat_pada').order('id');
          if (q.error) return _fail(q.error);
          return {
            success: true,
            list: (q.data || []).map(function (r) {
              return {
                id: r.id || '', namaAkun: r.nama_akun || '', tipe: r.tipe || '',
                keterangan: r.keterangan || '', status: r.status || '',
                dibuatOleh: r.dibuat_oleh || '', dibuatPada: r.dibuat_pada || '',
                locked: (r.id === 'AP001')
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
          var q = await supa.from('kwitansi').select('*');
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
          var q = await supa.from('purchase_order').select('*');
          if (q.error) { console.error('[getPOList]', q.error); return []; }
          // Peta no_wo → nama_project dari penawaran (nama project tidak kritikal).
          var woNama = {};
          var pq = await supa.from('penawaran').select('no_wo,nama_project');
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
          var q = await supa.from('mutasi_stok').select('*').order('id_mutasi');
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
          var q = await supa.from('pricelist').select('*');
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
          var q = await supa.from('site_survey').select('*');
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
          var q = await supa.from('site_survey').select('*').eq('no_wo', noWO);
          if (q.error) return { success: false, list: [], message: q.error.message };
          var list = (q.data || []).map(function (r) {
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
            .select('id,nama_material,spesifikasi,satuan,harga_beli').eq('id_supplier', idSupplier);
          if (q.error) return { success: false, list: [], message: q.error.message };
          var list = (q.data || []).map(function (it) {
            var label = (it.nama_material || '') + (it.spesifikasi ? ' - ' + it.spesifikasi : '');
            return {
              id: it.id || '', nama: label, unit: it.satuan || '',
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
          if (!q.data) return { success: true, record: null };
          var r = q.data;
          return {
            success: true,
            record: {
              noWO: noWO, status: r.status || '', dimintaOleh: r.diminta_oleh || '',
              dimintaPada: _fmtTs(r.diminta_pada),
              tglJadwal: r.tgl_jadwal ? r.tgl_jadwal.toString().slice(0, 10) : '',
              waktu: r.waktu ? r.waktu.toString().slice(0, 5) : '',
              mode: r.mode || '', linkMeet: r.link_meet || '', lokasi: r.lokasi || '',
              peserta: r.peserta || '', catatanUndangan: r.catatan_undangan || '',
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
          var q = await supa.from('po_payment_request').select('*').order('id_request');
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
              _safe(supa.from('klien').select('id,nama_klien,perusahaan,alamat,kontak').order('id')),
              _safe(supa.from('produk').select('id,nama,unit,harga_satuan,hpp').order('id')),
              _safe(supa.from('template_paket').select('id,nama_paket,daftar_item')),
              _safe(supa.from('penawaran').select('no_penawaran'))
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
            var nextNo = ('00' + (maxId + 1)).slice(-3) + '/QUOT/' + roman[mo] + '/' + yr;

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

      // ── Penawaran list (Penawaran.gs → getPenawaranList) — balik ARRAY ────
      //  Ambil rev TERTINGGI per no_penawaran; kolom nama beda: valid_hingga,
      //  total_hpp, estimasi_keuntungan. hoStatus dari hand_over.
      window.gsRoute('getPenawaranList', {
        mode: 'fn',
        handler: async function () {
          var q = await supa.from('penawaran').select('*').order('no_penawaran').order('rev');
          if (q.error) { console.error('[getPenawaranList]', q.error); return []; }
          // Peta klien id→nama & hand_over no_wo→status.
          var klienMap = {};
          var kq = await supa.from('klien').select('id,nama_klien');
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
          return Object.keys(latestMap)
            .sort(function (a, b) { return orderMap[b] - orderMap[a]; })
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
          var q = await supa.from('pemasukan').select('*');
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
            _safe(supa.from('pengeluaran').select('*')),
            _safe(supa.from('penawaran').select('no_wo,nama_project,klien_id')),
            _safe(supa.from('klien').select('id,nama_klien'))
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
            _safe(supa.from('pengiriman').select('*')),
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

      // ── Stok/Inventory (Inventory.gs → getStokList) via EDGE FUNCTION ─────
      //  qtyHold/qtyAvailable DIHITUNG di server (bukan kolom) → pakai Edge
      //  Function 'get-stok-list'. Aktif hanya bila ENABLE_EDGE_STOK = true.
      //  Balikan lama = ARRAY objek langsung (bukan {success,list}).
      if (ENABLE_EDGE_STOK) {
        window.gsRoute('getStokList', {
          mode: 'fn',
          handler: async function () {
            var r = await supa.functions.invoke('get-stok-list', { body: {} });
            if (r.error) { console.error('[get-stok-list]', r.error); return []; }
            return Array.isArray(r.data) ? r.data : []; // setia: array langsung
          }
        });
      }

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
      //  Lihat migrasi/edge-functions/ + PANDUAN-EDGE-FUNCTIONS.md.

      console.log('[supabase-overrides] aktif — login + master data + baca (M5 b1-b8) memakai Supabase.');
    })
    .catch(function (e) { console.error('[supabase-overrides] gagal memuat supabase-js:', e); });
})();
