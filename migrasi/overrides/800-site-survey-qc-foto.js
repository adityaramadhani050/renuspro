      // ── Batch (b): Site Survey submit/link + QC foto besar ────────────────
      //  submitSiteSurvey (buat baris final), link/unlink ke WO (set kolom no_wo
      //  + data.noWO), getQCFotoBesar (unduh dari Storage → data URL base64 agar
      //  canvas anotasi tidak ter-taint cross-origin).
      window.gsRoute('submitSiteSurvey', {
        mode: 'fn',
        handler: async function (a) {
          var p = a[0] || {};
          var id = (p.id || '').toString().trim(), namaSite = (p.namaSite || '').toString().trim();
          if (!id) return { success: false, message: 'ID survey wajib (buka ulang form).' };
          if (!namaSite) return { success: false, message: 'Nama Site wajib diisi.' };
          var dup = await supa.from('site_survey').select('id').eq('id', id).maybeSingle();
          if (dup.data) return { success: false, message: 'Survey ini sudah pernah disubmit.' };
          var data = {
            arahBangunan: p.arahBangunan || '', tinggiBangunan: Number(p.tinggiBangunan) || 0, fotoBangunan: p.fotoBangunan || null,
            kelistrikan: p.kelistrikan || {}, bos: p.bos || {}, atap: p.atap || {}, jalurKabel: p.jalurKabel || {},
            dibuatOlehId: (p.dibuatOlehId || '').toString()
          };
          var ins = await supa.from('site_survey').insert({
            id: id, no_wo: null, tanggal_survey: (_isoDate(p.tanggalSurvey) || _todayIso()), dibuat_oleh: (p.dibuatOleh || '').toString(),
            nama_site: namaSite, nama_pic: (p.namaPIC || '').toString(), no_telepon: (p.telepon || '').toString(), alamat: (p.alamat || '').toString(),
            latitude: (p.latitude != null ? Number(p.latitude) : null), longitude: (p.longitude != null ? Number(p.longitude) : null),
            data: data, dibuat_pada: new Date().toISOString()
          });
          if (ins.error) return { success: false, message: ins.error.message };
          return { success: true, message: 'Site Survey ' + id + ' berhasil disimpan.', id: id };
        }
      });
      async function _ssSetNoWO(surveyId, noWO) {
        surveyId = (surveyId || '').toString().trim();
        if (!surveyId) return { success: false, message: 'ID survey wajib.' };
        var cur = await supa.from('site_survey').select('data').eq('id', surveyId).maybeSingle();
        if (!cur.data) return { success: false, message: 'Survey tidak ditemukan.' };
        var parsed = cur.data.data; if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch (e) { parsed = {}; } }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) parsed = {};
        parsed.noWO = noWO;
        var up = await supa.from('site_survey').update({ data: parsed, no_wo: (noWO || null) }).eq('id', surveyId);
        if (up.error) return { success: false, message: up.error.message };
        return { success: true, noWO: noWO, message: noWO ? ('Survey ' + surveyId + ' ditautkan ke ' + noWO + '.') : ('Tautan survey ' + surveyId + ' dilepas.') };
      }
      window.gsRoute('linkSiteSurveyToWO', {
        mode: 'fn',
        handler: async function (a) { var noWO = (a[1] || '').toString().trim(); if (!noWO) return { success: false, message: 'No WO wajib.' }; return await _ssSetNoWO(a[0], noWO); }
      });
      window.gsRoute('unlinkSiteSurveyFromWO', {
        mode: 'fn',
        handler: async function (a) { return await _ssSetNoWO(a[0], ''); }
      });
      window.gsRoute('getQCFotoBesar', {
        mode: 'fn',
        handler: async function (a) {
          var fileId = (a[0] || '').toString().trim();
          if (!fileId) return { success: false, message: 'fileId wajib.' };
          try {
            var dl = await supa.storage.from('uploads').download(fileId);
            if (dl.error || !dl.data) return { success: false, message: 'Foto tidak ditemukan.' };
            var dataUrl = await new Promise(function (resolve, reject) {
              var fr = new FileReader(); fr.onload = function () { resolve(fr.result); }; fr.onerror = function () { reject(fr.error); }; fr.readAsDataURL(dl.data);
            });
            return { success: true, dataUrl: dataUrl };
          } catch (e) { return { success: false, message: (e && e.message) || 'Gagal memuat foto.' }; }
        }
      });
