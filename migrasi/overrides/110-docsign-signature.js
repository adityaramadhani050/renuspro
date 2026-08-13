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
