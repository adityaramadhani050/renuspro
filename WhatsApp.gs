/**
 * WhatsApp.gs — RenusPro
 * Notifikasi otomatis via Meta Cloud API (WhatsApp Business).
 *
 * Konfigurasi disimpan di Script Properties:
 *   WA_ENABLED         : "true" / "false"
 *   WA_TOKEN           : Access Token (dari Meta Developer → System User)
 *   WA_PHONE_NUMBER_ID : Phone Number ID (bukan nomor HP, tapi ID di Meta)
 *   WA_TARGET          : Nomor tujuan dalam format internasional tanpa + (mis. 628123456789)
 */

var _WA_API_VERSION = 'v20.0';

// ── Ambil konfigurasi ────────────────────────────────────────────────────────
function _getWAConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    enabled:       props.getProperty('WA_ENABLED') === 'true',
    token:         props.getProperty('WA_TOKEN')           || '',
    phoneNumberId: props.getProperty('WA_PHONE_NUMBER_ID') || '',
    target:        props.getProperty('WA_TARGET')          || ''
  };
}

// ── Simpan konfigurasi (dipanggil dari frontend) ─────────────────────────────
function saveWAConfig(payload) {
  try {
    var props = PropertiesService.getScriptProperties();
    props.setProperty('WA_ENABLED',         payload.enabled ? 'true' : 'false');
    props.setProperty('WA_TOKEN',           (payload.token         || '').trim());
    props.setProperty('WA_PHONE_NUMBER_ID', (payload.phoneNumberId || '').trim());
    props.setProperty('WA_TARGET',          (payload.target        || '').trim());
    return { success: true, message: 'Konfigurasi WA Bot berhasil disimpan.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

// ── Baca konfigurasi (dipanggil dari frontend) ───────────────────────────────
function getWAConfig() {
  var c = _getWAConfig();
  return {
    success:       true,
    enabled:       c.enabled,
    token:         c.token,
    phoneNumberId: c.phoneNumberId,
    target:        c.target
  };
}

// ── Kirim pesan via Meta Cloud API ───────────────────────────────────────────
function sendWANotif(message) {
  var config = _getWAConfig();
  if (!config.enabled || !config.token || !config.phoneNumberId || !config.target || !message) return;
  try {
    var url = 'https://graph.facebook.com/' + _WA_API_VERSION + '/' + config.phoneNumberId + '/messages';
    UrlFetchApp.fetch(url, {
      method:             'post',
      headers: {
        'Authorization': 'Bearer ' + config.token,
        'Content-Type':  'application/json'
      },
      payload: JSON.stringify({
        messaging_product: 'whatsapp',
        to:   config.target,
        type: 'text',
        text: { body: message }
      }),
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log('WA notif error: ' + e);
  }
}

// ── Test kirim pesan ─────────────────────────────────────────────────────────
function testWANotif(payload) {
  var props         = PropertiesService.getScriptProperties();
  var token         = (payload.token         || '').trim() || props.getProperty('WA_TOKEN')           || '';
  var phoneNumberId = (payload.phoneNumberId || '').trim() || props.getProperty('WA_PHONE_NUMBER_ID') || '';
  var target        = (payload.target        || '').trim() || props.getProperty('WA_TARGET')          || '';

  if (!token || !phoneNumberId || !target) {
    return { success: false, message: 'Access Token, Phone Number ID, dan Nomor Tujuan wajib diisi.' };
  }

  try {
    var url  = 'https://graph.facebook.com/' + _WA_API_VERSION + '/' + phoneNumberId + '/messages';
    var resp = UrlFetchApp.fetch(url, {
      method:  'post',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type':  'application/json'
      },
      payload: JSON.stringify({
        messaging_product: 'whatsapp',
        to:   target,
        type: 'text',
        text: { body: '✅ *Test Notifikasi RenusPro*\nKonfigurasi WA Bot berhasil terhubung!' }
      }),
      muteHttpExceptions: true
    });

    var httpCode = resp.getResponseCode();
    var body     = resp.getContentText();
    var result;
    try { result = JSON.parse(body); } catch(e) { result = {}; }

    if (httpCode === 200 && result.messages && result.messages.length > 0) {
      return { success: true, message: 'Pesan test berhasil dikirim!' };
    }

    // Beri detail error yang jelas
    var errObj  = result.error || {};
    var errCode = errObj.code || httpCode;
    var errMsg  = errObj.message || body;
    var hint    = _waErrorHint(errCode, errObj.error_subcode);
    return {
      success: false,
      message: '[' + errCode + '] ' + errMsg + (hint ? '\n\nSolusi: ' + hint : '')
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

// ── Petunjuk error umum Meta ─────────────────────────────────────────────────
function _waErrorHint(code, subcode) {
  var hints = {
    100:  'Phone Number ID salah atau tidak ditemukan. Periksa kembali di Meta Developer → WhatsApp → API Setup.',
    190:  'Access Token tidak valid atau sudah expired. Gunakan Permanent Token dari System User di Meta Business Manager.',
    200:  'Aplikasi belum mendapat izin kirim pesan. Pastikan permission "whatsapp_business_messaging" sudah disetujui.',
    131030: 'Nomor tujuan bukan test recipient. Tambahkan nomor di Meta Developer → WhatsApp → API Setup → To (add number). ATAU publikasikan app ke Live Mode.',
    131047: 'Nomor tujuan belum pernah mengirim pesan ke nomor bisnis Anda dalam 24 jam terakhir (24-hour window). Minta penerima kirim pesan dulu ke nomor WA bisnis, atau gunakan approved template.',
    131051: 'Tipe pesan tidak didukung untuk nomor ini.',
    132000: 'Template tidak ditemukan atau belum disetujui.'
  };
  return hints[subcode] || hints[code] || '';
}

// ── Template pesan ───────────────────────────────────────────────────────────

function _waFmtRp(n) {
  return 'Rp ' + Math.round(n || 0).toLocaleString('id');
}

function notifInvoiceDibuat(inv) {
  sendWANotif(
    '📋 *Invoice Baru Diterbitkan*\n' +
    inv.noInvoice + ' • ' + inv.jenis + (inv.persen > 0 ? ' ' + inv.persen + '%' : '') + '\n' +
    'Klien  : ' + inv.namaKlien + '\n' +
    'Project: ' + inv.namaProject + '\n' +
    'Total  : ' + _waFmtRp(inv.total) + '\n' +
    'Oleh   : ' + (inv.dibuatOleh || '-')
  );
}

function notifInvoiceLunas(inv) {
  sendWANotif(
    '✅ *Invoice Lunas*\n' +
    inv.noInvoice + '\n' +
    'Klien  : ' + inv.namaKlien + '\n' +
    'Project: ' + inv.namaProject + '\n' +
    'Total  : ' + _waFmtRp(inv.total)
  );
}

function notifRequestInvoice(data) {
  sendWANotif(
    '🔔 *Request Buat Invoice*\n' +
    'WO-' + data.noWO + '\n' +
    'Klien  : ' + data.namaKlien + '\n' +
    'Project: ' + data.namaProject + '\n' +
    'Sales  : ' + data.sales + '\n' +
    (data.pesan ? 'Pesan  : ' + data.pesan + '\n' : '') +
    'Waktu  : ' + data.tanggal
  );
}

function notifWODibuat(wo) {
  sendWANotif(
    '🔨 *Work Order Dibuat*\n' +
    'WO-' + wo.noWO + ' (dari ' + wo.noPenawaran + ')\n' +
    'Klien  : ' + wo.namaKlien + '\n' +
    'Project: ' + wo.namaProject + '\n' +
    'Nilai  : ' + _waFmtRp(wo.nilaiKontrak)
  );
}
