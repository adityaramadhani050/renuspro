      // ══════════════════════════════════════════════════════════════════════
      //  MAINTENANCE — pengajuan & monitoring maintenance site terpasang
      //  Sales/Lead Sales ajukan → Project Coordinator jadwalkan+tugaskan →
      //  Site Engineer kerjakan → Selesai (laporan hasil). Notif WA ke PC.
      // ══════════════════════════════════════════════════════════════════════

      // Daftar WO yang instalasinya sudah selesai (Hand Over = Selesai), sama
      // seperti gating BOM/QC/DED — TANPA mengecualikan yang sudah pernah
      // maintenance (satu site bisa maintenance berkali-kali). Sertakan detail
      // klien (alamat/kontak) untuk auto-isi form.
      window.gsRoute('getMaintenanceWOList', {
        mode: 'fn',
        handler: async function () {
          var _safe = function (p) { return p.then(function (r) { return r; }).catch(function (e) { return { data: [], error: e }; }); };
          var res = await Promise.all([
            _safe(_all('work_order', 'no_wo,nama_project,nama_klien,klien_id,status')),
            _safe(supa.from('hand_over').select('no_wo,status')),
            _safe(_all('klien', 'id,nama_klien,alamat,kontak'))
          ]);
          var hoMap = {}; (res[1].data || []).forEach(function (h) { if (h.no_wo) hoMap[h.no_wo] = h.status || ''; });
          // Cocokkan klien by id (utama) & by nama (fallback) agar kontak/alamat
          // tetap terisi walau nama klien di WO tak sama persis.
          var klienById = {}, klienByNama = {};
          (res[2].data || []).forEach(function (k) { if (k.id != null) klienById[(k.id).toString()] = k; if (k.nama_klien) klienByNama[k.nama_klien] = k; });
          var list = (res[0].data || []).filter(function (wo) {
            var w = (wo.no_wo || '').toString(); return (hoMap[w] || '') === 'Selesai';
          }).map(function (wo) {
            var kd = klienById[(wo.klien_id || '').toString()] || klienByNama[wo.nama_klien] || {};
            return { noWO: wo.no_wo || '', namaProject: wo.nama_project || '', namaKlien: wo.nama_klien || '', alamat: kd.alamat || '', kontak: kd.kontak || '' };
          });
          return { success: true, list: list };
        }
      });

      window.gsRoute('buatMaintenance', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {};
          var project = (p.namaProject || '').toString().trim();
          var deskripsi = (p.deskripsi || '').toString().trim();
          if (!project) return { success: false, message: 'Nama project/site wajib diisi.' };
          if (!deskripsi) return { success: false, message: 'Deskripsi keluhan/pekerjaan wajib diisi.' };
          var id = await _nextSeqId('maintenance', 'id', 'MTN-' + _ym() + '-');
          var ins = await supa.from('maintenance').insert({
            id: id, tanggal_pengajuan: _isoDate(p.tanggal) || _todayIso(),
            no_wo: (p.noWO || '').toString().trim() || null, nama_project: project,
            customer: (p.customer || '').toString().trim() || null, lokasi: (p.lokasi || '').toString().trim() || null,
            kontak: (p.kontak || '').toString().trim() || null, jenis: (p.jenis || '').toString().trim() || null,
            prioritas: (p.prioritas || 'Normal').toString().trim(), deskripsi: deskripsi, status: 'Diajukan',
            diajukan_oleh: (p.namaUser || '').toString().trim() || null, dibuat_pada: new Date().toISOString()
          });
          if (ins.error) return { success: false, message: ins.error.message };
          if (typeof _notifMaintenanceBaru === 'function') _notifMaintenanceBaru(id, project, (p.lokasi || p.customer || ''), (p.namaUser || ''), (p.jenis || ''), (p.prioritas || 'Normal'), (p.noWO || '').toString().trim(), deskripsi);
          return { success: true, message: 'Pengajuan maintenance "' + project + '" berhasil dikirim ke Project Coordinator.', id: id };
        }
      });

      window.gsRoute('getMaintenanceList', {
        mode: 'fn',
        handler: async function (a) {
          var status = ((a && a[0]) || '').toString().trim();
          var q = supa.from('maintenance').select('*').order('dibuat_pada', { ascending: false });
          if (status) q = q.eq('status', status);
          var r = await q;
          if (r.error) return [];
          return (r.data || []).map(function (o) {
            return {
              id: o.id, tanggalPengajuan: o.tanggal_pengajuan, noWO: o.no_wo || '', namaProject: o.nama_project || '',
              customer: o.customer || '', lokasi: o.lokasi || '', kontak: o.kontak || '', jenis: o.jenis || '',
              prioritas: o.prioritas || 'Normal', deskripsi: o.deskripsi || '', status: o.status || 'Diajukan',
              tanggalJadwal: o.tanggal_jadwal, teknisiId: o.teknisi_id || '', teknisiNama: o.teknisi_nama || '',
              tanggalMulai: o.tanggal_mulai, tanggalSelesai: o.tanggal_selesai, laporanHasil: o.laporan_hasil || '',
              catatanPC: o.catatan_pc || '', foto: _arr(o.foto), diajukanOleh: o.diajukan_oleh || '',
              diprosesOleh: o.diproses_oleh || '', dibuatPada: o.dibuat_pada, diubahPada: o.diubah_pada
            };
          });
        }
      });

      // Ambil status maintenance saat ini (guard transisi).
      async function _mtnStatus(id) {
        var q = await supa.from('maintenance').select('status').eq('id', id).maybeSingle();
        return q.data ? (q.data.status || '') : null;
      }
      function _mtnFinal(s) { return s === 'Selesai' || s === 'Ditolak' || s === 'Dibatalkan'; }

      window.gsRoute('jadwalkanMaintenance', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {};
          var id = (p.id || '').toString().trim();
          var tglJadwal = _isoDate(p.tanggalJadwal);
          var teknisiId = (p.teknisiId || '').toString().trim();
          var teknisiNama = (p.teknisiNama || '').toString().trim();
          if (!id) return { success: false, message: 'ID maintenance wajib.' };
          if (!tglJadwal) return { success: false, message: 'Tanggal rencana pengerjaan wajib diisi.' };
          if (!teknisiNama) return { success: false, message: 'Teknisi pelaksana wajib dipilih.' };
          var mrow = await supa.from('maintenance').select('status,nama_project,lokasi,jenis,prioritas,diproses_pada').eq('id', id).maybeSingle();
          if (!mrow.data) return { success: false, message: 'Maintenance tidak ditemukan.' };
          var st = (mrow.data.status || '');
          if (_mtnFinal(st)) return { success: false, message: 'Maintenance berstatus "' + st + '" sudah final.' };
          var up = await supa.from('maintenance').update({
            status: 'Dijadwalkan', tanggal_jadwal: tglJadwal, teknisi_id: teknisiId || null, teknisi_nama: teknisiNama,
            catatan_pc: (p.catatanPC || '').toString().trim() || null, diproses_oleh: (p.namaUser || '').toString().trim() || null,
            diproses_pada: mrow.data.diproses_pada || new Date().toISOString(),  // waktu respon pertama (untuk hitung response time)
            diubah_pada: new Date().toISOString()
          }).eq('id', id);
          if (up.error) return { success: false, message: up.error.message };
          if (typeof _notifMaintenanceDitugaskan === 'function') _notifMaintenanceDitugaskan(teknisiId, id, (mrow.data.nama_project || p.namaProject || ''), tglJadwal, (mrow.data.lokasi || ''), (mrow.data.jenis || ''), (mrow.data.prioritas || ''));
          return { success: true, message: 'Maintenance ' + id + ' dijadwalkan & ditugaskan ke ' + teknisiNama + '.' };
        }
      });

      window.gsRoute('mulaiMaintenance', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {};
          var id = (p.id || '').toString().trim();
          if (!id) return { success: false, message: 'ID maintenance wajib.' };
          var st = await _mtnStatus(id);
          if (st == null) return { success: false, message: 'Maintenance tidak ditemukan.' };
          if (st !== 'Dijadwalkan') return { success: false, message: 'Hanya maintenance "Dijadwalkan" yang bisa dimulai (saat ini: "' + st + '").' };
          var up = await supa.from('maintenance').update({
            status: 'Dikerjakan', tanggal_mulai: _isoDate(p.tanggalMulai) || _todayIso(),
            diproses_oleh: (p.namaUser || '').toString().trim() || null, diubah_pada: new Date().toISOString()
          }).eq('id', id);
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Maintenance ' + id + ' ditandai sedang dikerjakan.' };
        }
      });

      window.gsRoute('selesaikanMaintenance', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {};
          var id = (p.id || '').toString().trim();
          var laporan = (p.laporanHasil || '').toString().trim();
          if (!id) return { success: false, message: 'ID maintenance wajib.' };
          if (!laporan) return { success: false, message: 'Laporan hasil wajib diisi.' };
          var st = await _mtnStatus(id);
          if (st == null) return { success: false, message: 'Maintenance tidak ditemukan.' };
          if (st !== 'Dijadwalkan' && st !== 'Dikerjakan') return { success: false, message: 'Maintenance "' + st + '" tidak bisa diselesaikan.' };
          var up = await supa.from('maintenance').update({
            status: 'Selesai', laporan_hasil: laporan, tanggal_selesai: _isoDate(p.tanggalSelesai) || _todayIso(),
            diproses_oleh: (p.namaUser || '').toString().trim() || null, diubah_pada: new Date().toISOString()
          }).eq('id', id);
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Maintenance ' + id + ' selesai.' };
        }
      });

      window.gsRoute('tolakMaintenance', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {};
          var id = (p.id || '').toString().trim();
          var alasan = (p.catatanPC || '').toString().trim();
          if (!id) return { success: false, message: 'ID maintenance wajib.' };
          if (!alasan) return { success: false, message: 'Alasan penolakan wajib diisi.' };
          var frow = await supa.from('maintenance').select('status,diproses_pada').eq('id', id).maybeSingle();
          if (!frow.data) return { success: false, message: 'Maintenance tidak ditemukan.' };
          var st = (frow.data.status || '');
          if (_mtnFinal(st)) return { success: false, message: 'Maintenance berstatus "' + st + '" sudah final.' };
          var up = await supa.from('maintenance').update({
            status: 'Ditolak', catatan_pc: alasan, diproses_oleh: (p.namaUser || '').toString().trim() || null,
            diproses_pada: frow.data.diproses_pada || new Date().toISOString(),  // waktu respon pertama
            diubah_pada: new Date().toISOString()
          }).eq('id', id);
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Maintenance ' + id + ' ditolak.' };
        }
      });

      window.gsRoute('uploadFotoMaintenance', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {};
          var id = (p.id || '').toString().trim();
          if (!id) return { success: false, message: 'ID maintenance wajib.' };
          if (!(p.base64Data || '').toString()) return { success: false, message: 'File tidak boleh kosong.' };
          var f = await supa.from('maintenance').select('foto').eq('id', id).maybeSingle();
          if (!f.data) return { success: false, message: 'Maintenance tidak ditemukan.' };
          var arr = _arr(f.data.foto);
          var r = await _putStorage('maintenance/' + id.replace(/[^\w.\-]/g, '_'), p.base64Data.toString(), (p.mimeType || 'image/jpeg').toString(), id + '-foto-' + (arr.length + 1) + '.jpg');
          if (!r.ok) return { success: false, message: r.message };
          arr.push({ fileId: r.fileId, fileUrl: r.fileUrl, fileName: r.fileName });
          var up = await supa.from('maintenance').update({ foto: arr, diubah_pada: new Date().toISOString() }).eq('id', id);
          if (up.error) return { success: false, message: up.error.message };
          return { success: true, message: 'Foto tersimpan.', foto: arr };
        }
      });

      window.gsRoute('hapusFotoMaintenance', {
        mode: 'fn',
        handler: async function (a) {
          var id = (a[0] || '').toString().trim(), fileId = (a[1] || '').toString().trim();
          if (!id) return { success: false, message: 'ID maintenance wajib.' };
          var f = await supa.from('maintenance').select('foto').eq('id', id).maybeSingle();
          if (!f.data) return { success: false, message: 'Maintenance tidak ditemukan.' };
          var arr = _arr(f.data.foto).filter(function (x) { return x.fileId !== fileId; });
          var up = await supa.from('maintenance').update({ foto: arr, diubah_pada: new Date().toISOString() }).eq('id', id);
          if (up.error) return { success: false, message: up.error.message };
          try { await supa.storage.from('uploads').remove([fileId]); } catch (e) {}
          return { success: true, message: 'Foto dihapus.', foto: arr };
        }
      });
