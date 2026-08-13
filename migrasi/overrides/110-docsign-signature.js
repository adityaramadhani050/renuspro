      // ── DocSign / Tanda Tangan Digital (app_config 'DOC_SIGN') ────────────
      //  Sebelumnya TIDAK dimigrasi (masih proxy Apps Script) sehingga tombol
      //  Simpan di Pengaturan tidak berbuat apa-apa saat backend lama mati.
      //  Konsumen sekarang: generator Invoice PDF sisi klien (JS_PdfClient).
      //  Disimpan di app_config: { enabled: bool, base64: '<png tanpa prefix>' }.
      async function _docSignCfg() {
        var q = await supa.from('app_config').select('value').eq('key', 'DOC_SIGN').maybeSingle();
        var v = (q.data && q.data.value) || {};
        if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = {}; } }
        return (v && typeof v === 'object') ? v : {};
      }
      async function _docSignSave(patch) {
        var cur = await _docSignCfg();
        var next = {}; for (var k in cur) next[k] = cur[k];
        for (var k2 in patch) next[k2] = patch[k2];
        var up = await supa.from('app_config').upsert(
          { key: 'DOC_SIGN', value: next, updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );
        return { error: up.error, value: next };
      }
      window.gsRoute('getDocSignConfig', {
        mode: 'fn',
        handler: async function () {
          var v = await _docSignCfg();
          return { sigBase64: v.base64 || '', sigEnabled: v.enabled !== false };
        }
      });
      window.gsRoute('saveDocSignConfig', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {}, patch = {};
          if (p.sigEnabled !== undefined) patch.enabled = !!p.sigEnabled;
          var r = await _docSignSave(patch);
          if (r.error) return { success: false, message: r.error.message };
          return { success: true };
        }
      });
      window.gsRoute('saveSignatureImage', {
        mode: 'fn',
        handler: async function (a) {
          var b64 = (a[0] || '').toString().replace(/^data:[^;]+;base64,/, '');
          var r = await _docSignSave({ base64: b64 });
          if (r.error) return { success: false, message: r.error.message };
          return { success: true };
        }
      });
      window.gsRoute('clearSignatureImage', {
        mode: 'fn',
        handler: async function () {
          var r = await _docSignSave({ base64: '' });
          if (r.error) return { success: false, message: r.error.message };
          return { success: true };
        }
      });

      // ── Data Kwitansi untuk PDF sisi klien (buatKwitansiPDF) ───────────────
      //  Ambil kwitansi + bank account dari invoice terkait (rekening tujuan).
      window.gsRoute('getKwitansiForPdf', {
        mode: 'fn',
        handler: async function (a) {
          var id = (a[0] || '').toString();
          if (!id) return { success: false, message: 'ID kwitansi kosong.' };
          var q = await supa.from('kwitansi').select('*').eq('no_kwitansi', id).maybeSingle();
          if (q.error || !q.data) return { success: false, message: 'Kwitansi tidak ditemukan.' };
          var r = q.data, noInv = (r.no_invoice || '').toString(), bank = '';
          if (noInv) {
            var iq = await supa.from('invoice').select('bank_account').eq('no_invoice', noInv).maybeSingle();
            if (iq.data) bank = (iq.data.bank_account || '').toString();
          }
          return {
            success: true,
            data: {
              id: (r.no_kwitansi || '').toString(),
              noInvoice: noInv,
              tanggal: (r.tanggal || '').toString(),
              terimaDari: (r.terima_dari || '').toString(),
              jumlah: parseFloat(r.jumlah) || 0,
              untuk: (r.untuk_pembayaran || '').toString(),
              metode: (r.metode || 'Transfer').toString(),
              catatan: (r.catatan || '').toString(),
              bankAccount: bank
            }
          };
        }
      });

      // ── PO Term & Condition options (app_config 'TC_PO_OPTIONS') ──────────
      //  Sebelumnya dari Script Properties Apps Script; kini dari Supabase.
      var _TC_PO_FIELDS = [
        { key: 'po_material_status', label: 'Material Status' },
        { key: 'po_down_payment', label: 'Down Payment' },
        { key: 'po_balance_pay', label: 'Balance Payment' },
        { key: 'po_delivery_cond', label: 'Delivery Condition' },
        { key: 'po_warranty', label: 'Warranty' },
        { key: 'po_documents', label: 'Documents' }
      ];
      var _TC_PO_DEFAULTS = {
        po_material_status: ['Ready Stock', 'Indent 4-6 Weeks After DP', '-'],
        po_down_payment: ['50% From PO', 'Cover GIRO 30 Days', '-'],
        po_balance_pay: ['Before Shipping', '70% 60 Days After Receive Invoice & BAST', '-'],
        po_delivery_cond: ['DDP', 'Franco Jakarta/Surabaya', 'Loco', 'Free On Board'],
        po_warranty: ['A Year', 'Back to Back from Manufacture', '-'],
        po_documents: ['Datasheet', 'Warranty', 'Datasheet & Warranty', '-']
      };
      window.gsRoute('getPOTCOptions', {
        mode: 'fn',
        handler: async function () {
          var q = await supa.from('app_config').select('value').eq('key', 'TC_PO_OPTIONS').maybeSingle();
          var opts = (q.data && q.data.value) ? q.data.value : {};
          if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch (e) { opts = {}; } }
          if (!opts || typeof opts !== 'object') opts = {};
          _TC_PO_FIELDS.forEach(function (f) { if (!opts[f.key]) opts[f.key] = _TC_PO_DEFAULTS[f.key] || ['-']; });
          return { success: true, fields: _TC_PO_FIELDS, options: opts };
        }
      });
      window.gsRoute('savePOTCOptions', {
        mode: 'fn',
        handler: async function (a) {
          var payload = a[0] || {};
          var up = await supa.from('app_config').upsert({ key: 'TC_PO_OPTIONS', value: payload, updated_at: new Date().toISOString() }, { onConflict: 'key' });
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Syarat & Ketentuan PO berhasil disimpan.' };
        }
      });

      // ── Data Purchase Order untuk PDF sisi klien (buatPOPDF) ───────────────
      //  PO header + item + supplier (nama/alamat/kontak/email) + term conditions.
      window.gsRoute('getPOForPdf', {
        mode: 'fn',
        handler: async function (a) {
          var noPO = (a[0] || '').toString().trim();
          if (!noPO) return { success: false, message: 'No PO wajib.' };
          var hq = await supa.from('purchase_order').select('*').eq('no_po', noPO).maybeSingle();
          if (hq.error || !hq.data) return { success: false, message: 'PO tidak ditemukan.' };
          var h = hq.data;
          var iq = await supa.from('po_item').select('*').eq('no_po', noPO).order('id_item');
          var items = (iq.data || []).map(function (ir) {
            return {
              namaItem: (ir.nama_item || '').toString(), qty: parseFloat(ir.qty) || 0,
              satuan: (ir.satuan || '').toString(), hargaBeli: parseFloat(ir.harga_beli_satuan) || 0,
              total: parseFloat(ir.total) || 0
            };
          });
          var sup = {};
          if (h.id_supplier) {
            var sq = await supa.from('supplier').select('nama,pic,telepon,email,alamat').eq('id_supplier', h.id_supplier).maybeSingle();
            if (sq.data) sup = {
              nama: (sq.data.nama || '').toString(), pic: (sq.data.pic || '').toString(),
              telepon: (sq.data.telepon || '').toString(), email: (sq.data.email || '').toString(),
              alamat: (sq.data.alamat || '').toString()
            };
          }
          var tc = h.term_conditions;
          if (typeof tc === 'string') { try { tc = JSON.parse(tc); } catch (e) { tc = {}; } }
          if (!tc || typeof tc !== 'object') tc = {};
          return {
            success: true,
            data: {
              po: {
                noPO: (h.no_po || '').toString(), tanggal: (h.tanggal || '').toString(),
                quotNo: (h.no_quotation || '').toString(), quotTanggal: (h.tanggal_quotation || '').toString(),
                namaSupplier: (h.nama_supplier || '').toString(), peruntukan: (h.peruntukan || '').toString(),
                noWO: (h.no_wo || '').toString(),
                subtotal: parseFloat(h.subtotal) || 0, diskonPersen: parseFloat(h.diskon_persen) || 0,
                diskonNominal: parseFloat(h.diskon_nominal) || 0, ppnPersen: parseFloat(h.ppn_persen) || 0,
                ppnNominal: parseFloat(h.ppn_nominal) || 0, grandTotal: parseFloat(h.grand_total) || 0,
                catatan: (h.catatan || '').toString(), dibuatOleh: (h.dibuat_oleh || '').toString()
              },
              items: items, supplier: sup, tc: tc
            }
          };
        }
      });
