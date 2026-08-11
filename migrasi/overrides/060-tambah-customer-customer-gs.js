      // ── Tambah customer (Customer.gs → simpanCustomer) ────────────────────
      window.gsRoute('simpanCustomer', {
        mode: 'fn',
        handler: async function (args) {
          var nama = (args[0] || '').toString(), perusahaan = (args[1] || '').toString(), telepon = (args[2] || '').toString(), alamat = (args[3] || '').toString();
          if (!nama) return { success: false, message: 'Nama klien tidak boleh kosong.' };
          var q = await _all('klien', 'id');   // ambil semua id → cari nomor terbesar
          if (q.error) return { success: false, message: q.error.message };
          var maxNum = 0; (q.data || []).forEach(function (r) { var m = (r.id || '').toString().match(/^K(\d+)/i); if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10)); });
          var nextId = 'K' + ('000' + (maxNum + 1)).slice(-3);
          var ins = await supa.from('klien').insert({ id: nextId, nama_klien: nama, perusahaan: perusahaan, alamat: alamat, kontak: telepon });
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Klien (' + nextId + ') berhasil ditambahkan!', newId: nextId };
        }
      });

      // ── Ubah customer (Customer.gs → editCustomer) ────────────────────────
      window.gsRoute('editCustomer', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim(), nama = (args[1] || '').toString(), perusahaan = (args[2] || '').toString(), telepon = (args[3] || '').toString(), alamat = (args[4] || '').toString();
          if (!id) return { success: false, message: 'ID klien wajib.' };
          var up = await supa.from('klien').update({ nama_klien: nama, perusahaan: perusahaan, alamat: alamat, kontak: telepon }).eq('id', id).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'ID klien tidak ditemukan.' };
          return { success: true, message: 'Klien ' + id + ' berhasil diperbarui!' };
        }
      });

      // ── Hapus customer (Customer.gs → hapusCustomer) ──────────────────────
      window.gsRoute('hapusCustomer', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim();
          if (!id) return { success: false, message: 'ID wajib.' };
          var del = await supa.from('klien').delete().eq('id', id).select();
          if (del.error) return { success: false, message: del.error.message };
          if (!del.data || !del.data.length) return { success: false, message: 'ID tidak ditemukan.' };
          return { success: true, message: 'Klien ' + id + ' berhasil dihapus.' };
        }
      });

      // Helper: info stok (qty + harga beli terakhir) untuk produk terkait stok.
      async function _stokInfo(stokId) {
        if (!stokId) return { qty: 0, harga: 0 };
        var q = await supa.from('stok').select('qty_tersedia,harga_beli_terakhir').eq('id_produk', stokId).maybeSingle();
        if (q.error || !q.data) return { qty: 0, harga: 0 };
        return { qty: Number(q.data.qty_tersedia) || 0, harga: Number(q.data.harga_beli_terakhir) || 0 };
      }

      // ── Supplier: simpan / edit / hapus ───────────────────────────────────
      window.gsRoute('simpanSupplier', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {};
          if (!p.nama) return { success: false, message: 'Nama supplier tidak boleh kosong.' };
          var q = await _all('supplier', 'id_supplier');
          if (q.error) return { success: false, message: q.error.message };
          var maxNum = 0; (q.data || []).forEach(function (r) { var m = (r.id_supplier || '').toString().match(/^S(\d+)/i); if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10)); });
          var id = 'S' + ('000' + (maxNum + 1)).slice(-3);
          var ins = await supa.from('supplier').insert({ id_supplier: id, nama: p.nama || '', pic: p.pic || '', telepon: p.telepon || '', email: p.email || '', alamat: p.alamat || '', catatan: p.catatan || '', status: 'Aktif', dibuat_oleh: p.dibuatOleh || '', dibuat_pada: new Date().toISOString(), nama_alias: p.alias || '' });
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Supplier (' + id + ') berhasil ditambahkan!', newId: id };
        }
      });
      window.gsRoute('editSupplier', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {}; var id = (p.id || '').toString().trim();
          if (!id) return { success: false, message: 'ID supplier wajib.' };
          var up = await supa.from('supplier').update({ nama: p.nama || '', pic: p.pic || '', telepon: p.telepon || '', email: p.email || '', alamat: p.alamat || '', catatan: p.catatan || '', status: p.status || '', diubah_oleh: p.diubahOleh || '', diubah_pada: new Date().toISOString(), nama_alias: p.alias || '' }).eq('id_supplier', id).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'ID supplier tidak ditemukan.' };
          return { success: true, message: 'Supplier ' + id + ' berhasil diperbarui!' };
        }
      });
      window.gsRoute('hapusSupplier', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim();
          if (!id) return { success: false, message: 'ID wajib.' };
          var ref = await supa.from('purchase_order').select('no_po').eq('id_supplier', id).limit(1);
          if (!ref.error && ref.data && ref.data.length) return { success: false, message: 'Supplier ' + id + ' tidak dapat dihapus karena masih digunakan di Purchase Order.' };
          var del = await supa.from('supplier').delete().eq('id_supplier', id).select();
          if (del.error) return { success: false, message: del.error.message };
          if (!del.data || !del.data.length) return { success: false, message: 'ID supplier tidak ditemukan.' };
          return { success: true, message: 'Supplier ' + id + ' berhasil dihapus.' };
        }
      });

      // ── Akun Pembayaran: simpan / edit / hapus ────────────────────────────
      window.gsRoute('simpanAkunPembayaran', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {};
          if (!p.namaAkun) return { success: false, message: 'Nama akun wajib diisi.' };
          var q = await _all('akun_pembayaran', 'id');
          if (q.error) return { success: false, message: q.error.message };
          var maxNum = 0; (q.data || []).forEach(function (r) { var m = (r.id || '').toString().match(/^AP(\d+)/i); if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10)); });
          var id = 'AP' + ('000' + (maxNum + 1)).slice(-3);
          var ins = await supa.from('akun_pembayaran').insert({ id: id, nama_akun: p.namaAkun, tipe: p.tipe || 'Bank', keterangan: p.keterangan || '', status: 'Aktif', dibuat_oleh: p.dibuatOleh || '', dibuat_pada: new Date().toISOString(), detail: p.detail || '' });
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Akun ' + id + ' berhasil ditambahkan.', newId: id };
        }
      });
      window.gsRoute('editAkunPembayaran', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {}; var id = (p.id || '').toString();
          if (id === 'AP001') return { success: false, message: 'Akun Stok default tidak bisa diubah.' };
          var up = await supa.from('akun_pembayaran').update({ nama_akun: p.namaAkun, tipe: p.tipe || 'Bank', keterangan: p.keterangan || '', status: p.status || 'Aktif', detail: p.detail || '' }).eq('id', id).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'ID akun tidak ditemukan.' };
          return { success: true, message: 'Akun berhasil diperbarui.' };
        }
      });
      window.gsRoute('hapusAkunPembayaran', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString();
          if (id === 'AP001') return { success: false, message: 'Akun Stok default tidak bisa dihapus.' };
          var ref = await supa.from('pembayaran_po').select('id_bayar').eq('id_akun', id).limit(1);
          if (!ref.error && ref.data && ref.data.length) return { success: false, message: 'Akun sudah digunakan di riwayat pembayaran PO.' };
          var del = await supa.from('akun_pembayaran').delete().eq('id', id).select();
          if (del.error) return { success: false, message: del.error.message };
          if (!del.data || !del.data.length) return { success: false, message: 'ID akun tidak ditemukan.' };
          return { success: true, message: 'Akun berhasil dihapus.' };
        }
      });

      // ── Produk/Jasa: simpan / edit / hapus ────────────────────────────────
      window.gsRoute('simpanProduk', {
        mode: 'fn',
        handler: async function (args) {
          var nama = (args[0] || '').toString(), unit = (args[1] || '').toString(), harga = args[2], hpp = args[3], tipe = (args[4] || '').toString(), stokId = (args[5] || '').toString();
          if (!nama || !unit) return { success: false, message: 'Data nama/unit tidak boleh kosong.' };
          var q = await _all('produk', 'id');
          if (q.error) return { success: false, message: q.error.message };
          var maxNum = 0; (q.data || []).forEach(function (r) { var m = (r.id || '').toString().match(/^P(\d+)/i); if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10)); });
          var id = 'P' + ('000' + (maxNum + 1)).slice(-3);
          var hppFinal = Number(hpp) || 0, qty = 0;
          if (stokId) { var si = await _stokInfo(stokId); qty = si.qty; if (!hppFinal) hppFinal = si.harga; }
          var ins = await supa.from('produk').insert({ id: id, nama: nama, unit: unit, harga_satuan: Number(harga) || 0, hpp: hppFinal, tipe: tipe || '', stok_id: stokId || '', qty_tersedia: qty });
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Produk ' + id + ' berhasil ditambahkan!', id: id };
        }
      });
      window.gsRoute('editProduk', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim(), nama = (args[1] || '').toString(), unit = (args[2] || '').toString(), harga = args[3], hpp = args[4], tipe = (args[5] || '').toString(), stokId = (args[6] || '').toString();
          if (!id) return { success: false, message: 'ID produk wajib.' };
          var hppFinal = Number(hpp) || 0, qty = 0;
          if (stokId) { var si = await _stokInfo(stokId); qty = si.qty; if (!hppFinal) hppFinal = si.harga; }
          var up = await supa.from('produk').update({ nama: nama, unit: unit, harga_satuan: Number(harga) || 0, hpp: hppFinal, tipe: tipe || '', stok_id: stokId || '', qty_tersedia: qty }).eq('id', id).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'ID produk tidak ditemukan.' };
          return { success: true, message: 'Produk ' + id + ' berhasil diperbarui!' };
        }
      });
      // updateProdukKatalog = fungsi EDIT produk yang DIPAKAI form master
      // (editProduk di atas tak dipanggil frontend). Args: id,nama,unit,tipe,harga,hpp.
      window.gsRoute('updateProdukKatalog', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim(), nama = (args[1] || '').toString(), unit = (args[2] || '').toString(), tipe = (args[3] || '').toString(), hargaJual = args[4], hpp = args[5];
          if (!nama || !unit) return { success: false, message: 'Nama/unit tidak boleh kosong.' };
          var up = await supa.from('produk').update({ nama: nama, unit: unit, harga_satuan: Number(hargaJual) || 0, hpp: Number(hpp) || 0, tipe: tipe || '' }).eq('id', id).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'ID produk tidak ditemukan.' };
          return { success: true, message: 'Item ' + id + ' berhasil diperbarui.' };
        }
      });
      window.gsRoute('hapusProduk', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim();
          if (!id) return { success: false, message: 'ID wajib.' };
          var del = await supa.from('produk').delete().eq('id', id).select();
          if (del.error) return { success: false, message: del.error.message };
          if (!del.data || !del.data.length) return { success: false, message: 'ID tidak ditemukan.' };
          return { success: true, message: 'Produk ' + id + ' berhasil dihapus.' };
        }
      });

      // ── Simpan Bank Account (Settings.gs → saveBankAccounts) ──────────────
      //  Frontend kirim SELURUH daftar → sinkronkan tabel bank_account
      //  (upsert semua yang dikirim + hapus yang tak ada lagi).
      //  Simpan ke SATU master akun_pembayaran (Bank Account = akun kas).
      //  id baru → AP###. AP001 (Stok) & akun yang dipakai transaksi TIDAK dihapus.
      window.gsRoute('saveBankAccounts', {
        mode: 'fn',
        handler: async function (args) {
          var payload = Array.isArray(args[0]) ? args[0] : [];
          var cur = await _all('akun_pembayaran', 'id');
          if (cur.error) return { success: false, message: cur.error.message };
          var curIds = {}, maxNum = 0;
          (cur.data || []).forEach(function (r) { var id = (r.id || '').toString(); curIds[id] = true; var m = id.match(/^AP(\d+)/i); if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10)); });
          var keep = {};
          for (var i = 0; i < payload.length; i++) {
            var a = payload[i] || {};
            var id = (a.id || '').toString();
            if (!id || !/^AP\d+/i.test(id)) { maxNum++; id = 'AP' + ('000' + maxNum).slice(-3); } // id baru
            keep[id] = true;
            var label = (a.label || '').toString(), detail = (a.detail || '').toString();
            if (curIds[id]) { var u = await supa.from('akun_pembayaran').update({ nama_akun: label, detail: detail }).eq('id', id); if (u.error) return { success: false, message: u.error.message }; }
            else { var ins = await supa.from('akun_pembayaran').insert({ id: id, nama_akun: label, detail: detail, tipe: 'Bank', status: 'Aktif', dibuat_pada: new Date().toISOString() }); if (ins.error) return { success: false, message: ins.error.message }; }
          }
          // Hapus akun yang dibuang — lindungi AP001 & yang dipakai transaksi.
          var toCheck = (cur.data || []).map(function (r) { return (r.id || '').toString(); }).filter(function (id) { return id && id !== 'AP001' && !keep[id]; });
          for (var j = 0; j < toCheck.length; j++) {
            var idc = toCheck[j], used = false;
            var u1 = await supa.from('pemasukan').select('id_pemasukan').eq('id_akun', idc).limit(1); if (!u1.error && u1.data && u1.data.length) used = true;
            if (!used) { var u2 = await supa.from('pengeluaran').select('id_pengeluaran').eq('id_akun', idc).limit(1); if (!u2.error && u2.data && u2.data.length) used = true; }
            if (!used) { var u3 = await supa.from('pembayaran_po').select('id_bayar').eq('id_akun', idc).limit(1); if (!u3.error && u3.data && u3.data.length) used = true; }
            if (!used) await supa.from('akun_pembayaran').delete().eq('id', idc);
          }
          return { success: true, message: 'Bank Account berhasil disimpan.' };
        }
      });

      // ── Kategori pricelist: tambah / update / hapus ───────────────────────
      window.gsRoute('tambahKategori', {
        mode: 'fn',
        handler: async function (args) {
          var nama = (args[0] || '').toString().trim();
          if (!nama) return { success: false, message: 'Nama kategori wajib diisi.' };
          var ex = await supa.from('pricelist_kategori').select('nama').ilike('nama', nama).limit(1);
          if (!ex.error && ex.data && ex.data.length) return { success: false, message: 'Kategori "' + nama + '" sudah ada.' };
          var ins = await supa.from('pricelist_kategori').insert({ nama: nama });
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Kategori "' + nama + '" ditambahkan.' };
        }
      });
      window.gsRoute('updateKategori', {
        mode: 'fn',
        handler: async function (args) {
          var oldNama = (args[0] || '').toString().trim(), newNama = (args[1] || '').toString().trim();
          if (!oldNama || !newNama) return { success: false, message: 'Nama kategori wajib.' };
          if (oldNama.toLowerCase() !== newNama.toLowerCase()) {
            var ex = await supa.from('pricelist_kategori').select('nama').ilike('nama', newNama).limit(1);
            if (!ex.error && ex.data && ex.data.length) return { success: false, message: 'Kategori "' + newNama + '" sudah ada.' };
          }
          var chk = await supa.from('pricelist_kategori').select('nama').eq('nama', oldNama).maybeSingle();
          if (!chk.data) return { success: false, message: 'Kategori tidak ditemukan.' };
          await supa.from('pricelist_kategori').insert({ nama: newNama });          // buat baru
          await supa.from('pricelist').update({ kategori: newNama }).eq('kategori', oldNama); // pindahkan item
          if (oldNama !== newNama) await supa.from('pricelist_kategori').delete().eq('nama', oldNama);
          return { success: true, message: 'Kategori diperbarui.' };
        }
      });
      window.gsRoute('hapusKategori', {
        mode: 'fn',
        handler: async function (args) {
          var nama = (args[0] || '').toString().trim();
          if (!nama) return { success: false, message: 'Nama kategori wajib.' };
          var used = await supa.from('pricelist').select('id').eq('kategori', nama);
          if (!used.error && used.data && used.data.length) return { success: false, message: 'Kategori dipakai ' + used.data.length + ' item pricelist — ubah item tersebut dulu.' };
          var del = await supa.from('pricelist_kategori').delete().eq('nama', nama);
          if (del.error) return { success: false, message: del.error.message };
          return { success: true, message: 'Kategori "' + nama + '" dihapus.' };
        }
      });

      // ── Kategori Pengeluaran (Pengeluaran.gs → saveKategoriPengeluaran) ────
      window.gsRoute('saveKategoriPengeluaran', {
        mode: 'fn',
        handler: async function (args) {
          var list = Array.isArray(args[0]) ? args[0] : null;
          if (!list) return { success: false, message: 'Format kategori tidak valid.' };
          var seen = {}, clean = [];
          list.forEach(function (k) { var v = (k || '').toString().trim(); if (!v) return; var low = v.toLowerCase(); if (seen[low]) return; seen[low] = true; clean.push(v); });
          if (!clean.length) return { success: false, message: 'Minimal satu kategori harus diisi.' };
          await supa.from('kategori_pengeluaran').delete().neq('nama', ' '); // kosongkan
          var rows = clean.map(function (n, i) { return { nama: n, urutan: i + 1 }; });
          var ins = await supa.from('kategori_pengeluaran').insert(rows);
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Kategori pengeluaran berhasil disimpan.', list: clean };
        }
      });

      // ── Catatan WO (WorkOrder.gs → simpanCatatanWO) ───────────────────────
      window.gsRoute('simpanCatatanWO', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString(), catatan = (args[1] || '').toString(), who = (args[2] || 'Sales Executive').toString();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          var up = await supa.from('work_order_catatan').upsert({ no_wo: noWO, catatan: catatan, diupdate_oleh: who, diupdate_pada: new Date().toISOString() }, { onConflict: 'no_wo' });
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Catatan tersimpan.' };
        }
      });

      // ── Jenis WO manual (WorkOrder.gs → setWorkOrderJenis) ────────────────
      window.gsRoute('setWorkOrderJenis', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString().trim(), jenis = (args[1] || '').toString().trim(), oleh = (args[2] || '').toString();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          if (jenis && jenis !== 'Jasa' && jenis !== 'Material') return { success: false, message: 'Jenis tidak valid.' };
          if (!jenis) {
            var del = await supa.from('work_order_jenis_override').delete().eq('no_wo', noWO); // kembali Auto
            if (del.error) return { success: false, message: del.error.message };
          } else {
            var up = await supa.from('work_order_jenis_override').upsert({ no_wo: noWO, jenis_manual: jenis, diubah_oleh: oleh || '', diubah_pada: new Date().toISOString() }, { onConflict: 'no_wo' });
            if (up.error) return { success: false, message: up.error.message };
          }
          return { success: true, message: 'Jenis WO diperbarui menjadi ' + (jenis || 'Otomatis') + '.' };
        }
      });

      // Helper: normalisasi tanggal → 'YYYY-MM-DD' (untuk kolom date).
      function _isoDate(v) {
        var s = (v || '').toString().trim();
        var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
        var d = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (d) return d[3] + '-' + ('0' + d[2]).slice(-2) + '-' + ('0' + d[1]).slice(-2);
        return null;
      }
      function _todayIso() {
        try { var p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); var g = function (t) { var x = p.find(function (e) { return e.type === t; }); return x ? x.value : ''; }; return g('year') + '-' + g('month') + '-' + g('day'); } catch (e) { return new Date().toISOString().slice(0, 10); }
      }

      // ── Pricelist item: tambah / update / hapus / set ready ────────────────
      window.gsRoute('tambahPricelistItem', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {};
          if (!p.idSupplier) return { success: false, message: 'Supplier wajib dipilih.' };
          if (!p.namaMaterial) return { success: false, message: 'Nama material wajib diisi.' };
          var q = await _all('pricelist', 'id');
          if (q.error) return { success: false, message: q.error.message };
          var maxNum = 0; (q.data || []).forEach(function (r) { var m = (r.id || '').toString().match(/^PL(\d+)/i); if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10)); });
          var id = 'PL' + ('000' + (maxNum + 1)).slice(-3);
          var ins = await supa.from('pricelist').insert({ id: id, id_supplier: p.idSupplier, kategori: p.kategori || '', nama_material: p.namaMaterial || '', spesifikasi: p.spesifikasi || '', merek: p.merek || '', satuan: p.satuan || '', harga_beli: Number(p.hargaBeli) || 0, termasuk_ppn: !!p.termasukPPN, lead_time: '', masa_berlaku_harga: '', dibuat_pada: new Date().toISOString(), ready: !!p.ready });
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Item pricelist ' + id + ' ditambahkan.', id: id };
        }
      });
      window.gsRoute('updatePricelistItem', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim(); var p = args[1] || {};
          if (!id) return { success: false, message: 'ID item wajib.' };
          if (!p.namaMaterial) return { success: false, message: 'Nama material wajib diisi.' };
          var upd = { kategori: p.kategori || '', nama_material: p.namaMaterial || '', spesifikasi: p.spesifikasi || '', merek: p.merek || '', satuan: p.satuan || '', harga_beli: Number(p.hargaBeli) || 0, dibuat_pada: new Date().toISOString() };
          if (p.idSupplier) upd.id_supplier = p.idSupplier;
          if (p.ready != null) upd.ready = !!p.ready;
          var up = await supa.from('pricelist').update(upd).eq('id', id).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'Item tidak ditemukan.' };
          return { success: true, message: 'Item ' + id + ' berhasil diperbarui.' };
        }
      });
      window.gsRoute('hapusPricelistItem', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim();
          if (!id) return { success: false, message: 'ID item wajib.' };
          var del = await supa.from('pricelist').delete().eq('id', id).select();
          if (del.error) return { success: false, message: del.error.message };
          if (!del.data || !del.data.length) return { success: false, message: 'Item tidak ditemukan.' };
          return { success: true, message: 'Item pricelist dihapus.' };
        }
      });
      window.gsRoute('setPricelistReady', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim(), ready = !!args[1];
          if (!id) return { success: false, message: 'ID item wajib.' };
          var up = await supa.from('pricelist').update({ ready: ready }).eq('id', id).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'Item tidak ditemukan.' };
          return { success: true, message: 'Status ready diperbarui.' };
        }
      });

      // ── Ayat Silang: simpan / hapus ───────────────────────────────────────
      window.gsRoute('simpanAyatSilang', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {};
          var idAsal = (p.idAkunAsal || '').toString(), idTujuan = (p.idAkunTujuan || '').toString();
          if (!idAsal || !idTujuan) return { success: false, message: 'Akun asal & tujuan wajib dipilih.' };
          if (idAsal === idTujuan) return { success: false, message: 'Akun asal dan tujuan tidak boleh sama.' };
          if (idAsal === 'AP001' || idTujuan === 'AP001') return { success: false, message: 'Akun Stok tidak bisa dipakai untuk ayat silang.' };
          var jumlah = parseFloat(p.jumlah) || 0;
          if (jumlah <= 0) return { success: false, message: 'Jumlah harus lebih dari 0.' };
          var ym = _todayIso().slice(0, 7).replace('-', ''); // yyyyMM
          var prefix = 'TF-' + ym + '-';
          var q = await _all('ayat_silang', 'id');
          var maxSeq = 0; (q.data || []).forEach(function (r) { var id = (r.id || '').toString(); if (id.indexOf(prefix) === 0) { var s = parseInt(id.slice(prefix.length), 10) || 0; if (s > maxSeq) maxSeq = s; } });
          var id = prefix + ('000' + (maxSeq + 1)).slice(-3);
          var ins = await supa.from('ayat_silang').insert({ id: id, tanggal: _isoDate(p.tanggal) || _todayIso(), id_akun_asal: idAsal, nama_asal: (p.namaAkunAsal || idAsal).toString(), id_akun_tujuan: idTujuan, nama_tujuan: (p.namaAkunTujuan || idTujuan).toString(), jumlah: jumlah, catatan: (p.catatan || '').toString(), dibuat_oleh: (p.dibuatOleh || '').toString(), dibuat_pada: new Date().toISOString() });
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Ayat silang ' + id + ' berhasil dicatat.', id: id };
        }
      });
      window.gsRoute('hapusAyatSilang', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim();
          if (!id) return { success: false, message: 'ID ayat silang wajib diisi.' };
          var del = await supa.from('ayat_silang').delete().eq('id', id).select();
          if (del.error) return { success: false, message: del.error.message };
          if (!del.data || !del.data.length) return { success: false, message: 'Ayat silang tidak ditemukan.' };
          return { success: true, message: 'Ayat silang ' + id + ' berhasil dihapus.' };
        }
      });

      // ── Template Paket: simpan / hapus ────────────────────────────────────
      window.gsRoute('simpanTemplatePaket', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim(), nama = (args[1] || '').toString(), itemsJson = args[2], editId = (args[3] || '').toString().trim();
          if (!id) return { success: false, message: 'ID template wajib.' };
          var items; try { items = typeof itemsJson === 'string' ? JSON.parse(itemsJson || '[]') : (itemsJson || []); } catch (e) { items = []; }
          if (editId) {
            var up = await supa.from('template_paket').update({ id: id, nama_paket: nama, daftar_item: items }).eq('id', editId).select();
            if (up.error) return { success: false, message: up.error.message };
            if (up.data && up.data.length) return { success: true, message: 'Template ' + id + ' berhasil diperbarui!' };
            // editId tak ditemukan → lanjut tambah
          }
          var dup = await supa.from('template_paket').select('id').eq('id', id).maybeSingle();
          if (dup.data) return { success: false, message: 'ID Template ' + id + ' sudah digunakan.' };
          var ins = await supa.from('template_paket').insert({ id: id, nama_paket: nama, daftar_item: items });
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Template ' + id + ' berhasil ditambahkan!' };
        }
      });
      window.gsRoute('hapusTemplatePaket', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim();
          var del = await supa.from('template_paket').delete().eq('id', id).select();
          if (del.error) return { success: false, message: del.error.message };
          if (!del.data || !del.data.length) return { success: false, message: 'Template tidak ditemukan.' };
          return { success: true, message: 'Template ' + id + ' berhasil dihapus.' };
        }
      });

      // ── Schedule: tugas (tambah/edit/hapus/batch) + site engineer ─────────
      function _schTaskRow(p, id) {
        return { id: id, no_wo: (p.noWO || '').toString().trim(), nama_tugas: (p.namaTugas || '').toString().trim(), fase: (p.fase || '').toString(), tanggal_mulai: _schIso(p.mulai), tanggal_selesai: _schIso(p.selesai), progress: Math.max(0, Math.min(100, Number(p.progress) || 0)), warna: (p.warna || '').toString(), urutan: Number(p.urutan) || 0, catatan: (p.catatan || '').toString(), dibuat_oleh: (p.oleh || '').toString(), dibuat_pada: new Date().toISOString() };
      }
      window.gsRoute('saveScheduleTask', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {};
          if (!(p.noWO || '').toString().trim()) return { success: false, message: 'No WO wajib.' };
          if (!(p.namaTugas || '').toString().trim()) return { success: false, message: 'Nama tugas wajib.' };
          var mulai = _schIso(p.mulai), selesai = _schIso(p.selesai);
          if (!mulai || !selesai) return { success: false, message: 'Tanggal mulai & selesai wajib.' };
          if (selesai < mulai) return { success: false, message: 'Tanggal selesai tidak boleh sebelum mulai.' };
          var id = 'TSK-' + new Date().getTime();
          var ins = await supa.from('schedule_task').insert(_schTaskRow(p, id));
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Tugas ditambahkan.', id: id };
        }
      });
      window.gsRoute('updateScheduleTask', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {}; var id = (p.id || '').toString().trim();
          if (!id) return { success: false, message: 'ID tugas wajib.' };
          var mulai = _schIso(p.mulai), selesai = _schIso(p.selesai);
          if (!mulai || !selesai) return { success: false, message: 'Tanggal mulai & selesai wajib.' };
          if (selesai < mulai) return { success: false, message: 'Tanggal selesai tidak boleh sebelum mulai.' };
          var up = await supa.from('schedule_task').update({ nama_tugas: (p.namaTugas || '').toString(), fase: (p.fase || '').toString(), tanggal_mulai: mulai, tanggal_selesai: selesai, progress: Math.max(0, Math.min(100, Number(p.progress) || 0)), warna: (p.warna || '').toString(), urutan: Number(p.urutan) || 0, catatan: (p.catatan || '').toString() }).eq('id', id).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'Tugas tidak ditemukan.' };
          return { success: true, message: 'Tugas diperbarui.' };
        }
      });
      window.gsRoute('saveScheduleTasksBatch', {
        mode: 'fn',
        handler: async function (args) {
          var p = args[0] || {};
          if (!(p.noWO || '').toString().trim()) return { success: false, message: 'No WO wajib.' };
          var arr = p.tasks || []; if (!arr.length) return { success: false, message: 'Tidak ada tugas untuk ditambahkan.' };
          var t0 = new Date().getTime(), rows = [];
          for (var i = 0; i < arr.length; i++) {
            var it = arr[i] || {}; var nama = (it.namaTugas || '').toString().trim(); if (!nama) continue;
            var mulai = _schIso(it.mulai), selesai = _schIso(it.selesai);
            if (!mulai || !selesai) return { success: false, message: 'Tanggal mulai & selesai wajib untuk "' + nama + '".' };
            if (selesai < mulai) return { success: false, message: 'Tanggal selesai sebelum mulai untuk "' + nama + '".' };
            rows.push(_schTaskRow({ noWO: p.noWO, namaTugas: nama, fase: it.fase, mulai: it.mulai, selesai: it.selesai, progress: it.progress, warna: it.warna, urutan: it.urutan, catatan: it.catatan, oleh: p.oleh }, 'TSK-' + t0 + '-' + i));
          }
          if (!rows.length) return { success: false, message: 'Tidak ada tugas valid (nama kosong).' };
          var ins = await supa.from('schedule_task').insert(rows);
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: rows.length + ' tugas ditambahkan.', count: rows.length };
        }
      });
      window.gsRoute('hapusScheduleTask', {
        mode: 'fn',
        handler: async function (args) {
          var id = (args[0] || '').toString().trim();
          if (!id) return { success: false, message: 'ID tugas wajib.' };
          var del = await supa.from('schedule_task').delete().eq('id', id).select();
          if (del.error) return { success: false, message: del.error.message };
          if (!del.data || !del.data.length) return { success: false, message: 'Tugas tidak ditemukan.' };
          return { success: true, message: 'Tugas dihapus.' };
        }
      });
      window.gsRoute('updateScheduleSiteEngineer', {
        mode: 'fn',
        handler: async function (args) {
          var noWO = (args[0] || '').toString().trim(), se = (args[1] || '').toString();
          if (!noWO) return { success: false, message: 'No WO wajib.' };
          var up = await supa.from('schedule_project').update({ site_engineer: se }).eq('no_wo', noWO).select();
          if (up.error) return { success: false, message: up.error.message };
          if (!up.data || !up.data.length) return { success: false, message: 'WO tidak ditemukan.' };
          return { success: true, message: 'Site Engineer diperbarui.' };
        }
      });
