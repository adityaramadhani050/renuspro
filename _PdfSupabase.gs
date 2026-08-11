/**
 * _PdfSupabase.gs — Sumber data PDF diambil dari SUPABASE (bukan Sheets).
 *
 * Sejak migrasi, data record (invoice/kwitansi/PO/klien/supplier) hidup di
 * Supabase; sheet lama BEKU. Generator PDF (template Google Sheets) tetap
 * dipakai, tapi DATANYA dibaca dari Supabase via REST (PostgREST) supaya sama
 * dengan yang tampil di aplikasi.
 *
 * SET SEKALI di Apps Script → Project Settings → Script Properties:
 *   SUPABASE_URL          = https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY  = <service_role key>   (server-side; jangan di frontend)
 */
function _supaCfg_() {
  var p = PropertiesService.getScriptProperties();
  return {
    url: (p.getProperty('SUPABASE_URL') || '').toString().trim().replace(/\/$/, ''),
    key: (p.getProperty('SUPABASE_SERVICE_KEY') || '').toString().trim()
  };
}

// GET {url}/rest/v1/{pathQuery} → array baris (JSON). Melempar error bila gagal.
function _supaRows_(pathQuery) {
  var c = _supaCfg_();
  if (!c.url || !c.key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY belum diisi di Script Properties Apps Script.');
  }
  var resp = UrlFetchApp.fetch(c.url + '/rest/v1/' + pathQuery, {
    method: 'get',
    muteHttpExceptions: true,
    headers: { 'apikey': c.key, 'Authorization': 'Bearer ' + c.key, 'Accept': 'application/json' }
  });
  var code = resp.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Supabase HTTP ' + code + ': ' + resp.getContentText().slice(0, 200));
  }
  try { return JSON.parse(resp.getContentText()) || []; } catch (e) { return []; }
}

function _supaOne_(pathQuery) { var r = _supaRows_(pathQuery); return (r && r.length) ? r[0] : null; }

// 'YYYY-MM-DD' → 'dd/MM/yyyy' (untuk tampilan template). Lainnya diteruskan apa adanya.
function _supaFmtTgl_(v) {
  if (!v) return '';
  var s = v.toString();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[3] + '/' + m[2] + '/' + m[1];
  return s;
}

// Encode nilai untuk filter PostgREST (mis. nomor invoice ber-"/").
function _supaEnc_(v) { return encodeURIComponent((v == null ? '' : v).toString()); }
