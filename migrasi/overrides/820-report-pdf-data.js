      // ── Data untuk PDF: Laporan QC + Laporan Site Survey ──────────────────
      //  Foto dikonversi ke data URL base64 (unduh dari Storage) agar bisa
      //  di-embed ke PDF (URL publik lintas-domain tak dapat dipakai jsPDF).
      // Foto lama Google Drive: fileId = ID Drive (bukan path Storage). Ambil via
      // lh3.googleusercontent.com/d/<id> yg mengirim header CORS → bisa digambar
      // ke canvas & di-toDataURL untuk di-embed ke PDF.
      function _driveImgDataUrl(fileId) {
        return new Promise(function (resolve) {
          try {
            var img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function () {
              try {
                var w = img.naturalWidth || 1000, h = img.naturalHeight || 1000;
                var c = document.createElement('canvas'); c.width = w; c.height = h;
                c.getContext('2d').drawImage(img, 0, 0);
                resolve(c.toDataURL('image/jpeg', 0.85));
              } catch (e) { resolve(''); }
            };
            img.onerror = function () { resolve(''); };
            img.src = 'https://lh3.googleusercontent.com/d/' + encodeURIComponent(fileId) + '=w1600';
          } catch (e) { resolve(''); }
        });
      }
      // Progress embed foto (shared window) → indikator "Memuat foto X / Y".
      function _pdfEmbedStart(total) { try { window.__pdfEmbed = { done: 0, total: total || 0, active: true }; } catch (e) {} }
      function _pdfEmbedEnd() { try { if (window.__pdfEmbed) window.__pdfEmbed.active = false; } catch (e) {} }
      async function _photoDataUrl(fileId) {
        var _r = await _photoDataUrlRaw(fileId);
        try { if (window.__pdfEmbed && window.__pdfEmbed.active) window.__pdfEmbed.done++; } catch (e) {}
        return _r;
      }
      async function _photoDataUrlRaw(fileId) {
        fileId = (fileId || '').toString();
        if (!fileId) return '';
        // Supabase Storage bila fileId berupa path (mengandung '/'); selain itu
        // dianggap ID Google Drive (foto lama) → ambil via googleusercontent.
        if (fileId.indexOf('/') !== -1) {
          try {
            var dl = await supa.storage.from('uploads').download(fileId);
            if (!dl.error && dl.data) {
              return await new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = function () { res(''); }; fr.readAsDataURL(dl.data); });
            }
          } catch (e) {}
          return '';
        }
        return await _driveImgDataUrl(fileId);
      }
      function _qcStatusLabelText(st) { var m = { 'Approved': 'APPROVED', 'Pending': 'PENDING', 'Rejected': 'REJECTED', 'NA': 'N/A', 'Belum Upload': 'BELUM UPLOAD' }; return m[st] || (st || 'BELUM UPLOAD'); }
      async function _ssAttachDataUrls(fotoArr) {
        var arr = Array.isArray(fotoArr) ? fotoArr : (fotoArr ? [fotoArr] : []), out = [];
        for (var i = 0; i < arr.length; i++) { var f = arr[i]; if (!f || !f.fileId) continue; var durl = await _photoDataUrl(f.fileId); if (durl) out.push({ fileId: f.fileId, fileUrl: f.fileUrl || '', caption: f.caption || '', dataUrl: durl }); }
        return out;
      }
      window.gsRoute('getQCReportData', {
        mode: 'fn',
        handler: async function (a) {
          var noWO = (a[0] || '').toString().trim();
          if (!noWO) return { success: false, message: 'No WO wajib diisi.' };
          try {
            var master = (await _qcMaster()).list;
            var iq = await supa.from('qc_item').select('*').eq('no_wo', noWO);
            var rowMap = {}; (iq.data || []).forEach(function (r) { rowMap[(r.kode || '').toString().trim()] = r; });
            var list = master.map(function (m) {
              var it = rowMap[m.kode] || null, foto = it ? _arr(it.foto) : [];
              var status = it && it.status ? it.status.toString() : (foto.length ? 'Pending' : 'Belum Upload');
              return { kode: m.kode, section: m.section, sectionLabel: m.sectionLabel, label: m.label, wajib: m.wajib, status: status, catatanSPV: it && it.catatan_spv ? it.catatan_spv.toString() : '', foto: foto };
            });
            var summary = _engCountSummary(list);
            var namaProject = '', namaKlien = '';
            try { var wo = ((await _woListData()) || []).filter(function (w) { return w.noWO === noWO; })[0]; if (wo) { namaProject = wo.namaProject || ''; namaKlien = wo.namaKlien || ''; } } catch (e) {}
            if (!namaProject) { try { var pr = await supa.from('qc_project').select('nama_project,nama_klien').eq('no_wo', noWO).maybeSingle(); if (pr.data) { namaProject = pr.data.nama_project || ''; namaKlien = pr.data.nama_klien || ''; } } catch (e) {} }
            var assigned = []; try { var aq = await supa.from('qc_assignment').select('nama_user').eq('no_wo', noWO); assigned = (aq.data || []).map(function (x) { return x.nama_user || ''; }).filter(Boolean); } catch (e) {}
            _pdfEmbedStart(list.reduce(function (t, it2) { return t + ((it2.foto || []).length); }, 0));
            var sections = [], idx = {};
            for (var i = 0; i < list.length; i++) {
              var it = list[i];
              if (idx[it.section] == null) { idx[it.section] = sections.length; sections.push({ kode: it.section, label: it.sectionLabel, items: [] }); }
              var fotoOut = [], fa = it.foto || [];
              for (var j = 0; j < fa.length; j++) {
                var durl = await _photoDataUrl(fa[j].fileId);
                if (!durl) continue;
                // PDF → tandai isPdf + fileName agar client meng-merge seluruh
                // halamannya (bukan thumbnail). Selain itu (gambar) → dataUrl biasa.
                var _nm = (fa[j].fileName || '').toString();
                var _isPdf = /\.pdf$/i.test(_nm) || durl.indexOf('data:application/pdf') === 0;
                fotoOut.push(_isPdf ? { dataUrl: durl, isPdf: true, fileName: _nm || 'Lampiran.pdf' } : { dataUrl: durl });
              }
              sections[idx[it.section]].items.push({ kode: it.kode, label: it.label, wajib: it.wajib, status: it.status, statusLabel: _qcStatusLabelText(it.status), catatanSPV: it.catatanSPV || '', foto: fotoOut });
            }
            _pdfEmbedEnd();
            return { success: true, noWO: noWO, namaProject: namaProject, namaKlien: namaKlien, tglExport: _fmtTs(new Date()), assigned: assigned, summary: summary, sections: sections };
          } catch (e) { _pdfEmbedEnd(); return { success: false, message: (e && e.message) || String(e) }; }
        }
      });
      window.gsRoute('getSiteSurveyReportData', {
        mode: 'fn',
        handler: async function (a) {
          var id = (a[0] || '').toString().trim();
          if (!id) return { success: false, message: 'ID wajib.' };
          try {
            var q = await supa.from('site_survey').select('*').eq('id', id).maybeSingle();
            if (q.error) return { success: false, message: q.error.message };
            if (!q.data) return { success: false, message: 'Survey tidak ditemukan.' };
            var r = q.data, dd = _jsonObj(r.data) || {};
            var kel = dd.kelistrikan || {}, bos = dd.bos || {}, atap = dd.atap || {}, jk = dd.jalurKabel || {};
            var d = {
              id: r.id || '', tanggalSurvey: _fmtTgl(r.tanggal_survey), dibuatOleh: r.dibuat_oleh || '', dibuatOlehId: dd.dibuatOlehId || '',
              noWO: r.no_wo || dd.noWO || '', namaSite: r.nama_site || '', namaPIC: r.nama_pic || '', telepon: r.no_telepon || '', alamat: r.alamat || '',
              latitude: (r.latitude !== null && r.latitude !== undefined) ? Number(r.latitude) : null, longitude: (r.longitude !== null && r.longitude !== undefined) ? Number(r.longitude) : null,
              dibuatPada: r.dibuat_pada ? r.dibuat_pada.toString() : '', arahBangunan: dd.arahBangunan || '', tinggiBangunan: dd.tinggiBangunan || 0
            };
            var _cnt = function (a) { return Array.isArray(a) ? a.filter(function (f) { return f && f.fileId; }).length : ((a && a.fileId) ? 1 : 0); };
            _pdfEmbedStart(_cnt(dd.fotoBangunan) + _cnt(kel.fotoKwh) + _cnt(kel.fotoPHB) + _cnt(bos.foto) + _cnt(atap.fotoAtap) + _cnt(atap.fotoRangka) + _cnt(atap.fotoAkses) + _cnt(jk.fotoPV) + _cnt(jk.fotoAC));
            d.fotoBangunan = await _ssAttachDataUrls(dd.fotoBangunan);
            kel.fotoKwh = await _ssAttachDataUrls(kel.fotoKwh); kel.fotoPHB = await _ssAttachDataUrls(kel.fotoPHB);
            bos.foto = await _ssAttachDataUrls(bos.foto);
            atap.fotoAtap = await _ssAttachDataUrls(atap.fotoAtap); atap.fotoRangka = await _ssAttachDataUrls(atap.fotoRangka); atap.fotoAkses = await _ssAttachDataUrls(atap.fotoAkses);
            jk.fotoPV = await _ssAttachDataUrls(jk.fotoPV); jk.fotoAC = await _ssAttachDataUrls(jk.fotoAC);
            _pdfEmbedEnd();
            d.kelistrikan = kel; d.bos = bos; d.atap = atap; d.jalurKabel = jk;
            d.tglExport = _fmtTs(new Date());
            return { success: true, survey: d };
          } catch (e) { _pdfEmbedEnd(); return { success: false, message: (e && e.message) || String(e) }; }
        }
      });
