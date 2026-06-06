/**
 * WhatsApp.gs — RenusPro
 * Notifikasi otomatis ke grup WhatsApp via Fonnte API.
 *
 * Konfigurasi disimpan di Script Properties:
 *   WA_ENABLED       : "true" / "false"
 *   WA_TOKEN         : Token Fonnte (dari dashboard.fonnte.com)
 *   WA_GROUP_TARGET  : Nomor grup WA atau ID grup (contoh: 6281234567890-1234567890@g.us)
 */

// ── Ambil konfigurasi ────────────────────────────────────────────────────────
function _getWAConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    enabled: props.getProperty('WA_ENABLED') === 'true',
    token:   props.getProperty('WA_TOKEN')   || '',
    target:  props.getProperty('WA_GROUP_TARGET') || ''
  };
}

// ── Simpan konfigurasi (dipanggil dari frontend) ─────────────────────────────
function saveWAConfig(payload) {
  try {
    var props = PropertiesService.getScriptProperties();
    props.setProperty('WA_ENABLED',        payload.enabled ? 'true' : 'false');
    props.setProperty('WA_TOKEN',          (payload.token  || '').trim());
    props.setProperty('WA_GROUP_TARGET',   (payload.target || '').trim());
    return { success: true, message: 'Konfigurasi WA Bot berhasil disimpan.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

// ── Baca konfigurasi (dipanggil dari frontend) ───────────────────────────────
function getWAConfig() {
  var c = _getWAConfig();
  return { success: true, enabled: c.enabled, token: c.token, target: c.target };
}

// ── Kirim notifikasi ─────────────────────────────────────────────────────────
function sendWANotif(message) {
  var config = _getWAConfig();
  if (!config.enabled || !config.token || !config.target || !message) return;
  try {
    UrlFetchApp.fetch('https://api.fonnte.com/send', {
      method:            'post',
      headers:           { 'Authorization': config.token },
      payload:           { target: config.target, message: message },
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log('WA notif error: ' + e);
  }
}

// ── Test kirim pesan ─────────────────────────────────────────────────────────
function testWANotif(payload) {
  var props = PropertiesService.getScriptProperties();
  var token  = (payload.token  || '').trim() || props.getProperty('WA_TOKEN')  || '';
  var target = (payload.target || '').trim() || props.getProperty('WA_GROUP_TARGET') || '';
  if (!token || !target) return { success: false, message: 'Token dan Target wajib diisi.' };
  try {
    var resp = UrlFetchApp.fetch('https://api.fonnte.com/send', {
      method:            'post',
      headers:           { 'Authorization': token },
      payload:           { target: target, message: '✅ *Test Notifikasi RenusPro*\nKonfigurasi WA Bot berhasil terhubung!' },
      muteHttpExceptions: true
    });
    var result = JSON.parse(resp.getContentText());
    if (result.status === true || result.status === 'true') {
      return { success: true, message: 'Pesan test berhasil dikirim ke grup!' };
    }
    return { success: false, message: 'Gagal: ' + (result.reason || resp.getContentText()) };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

// ── Template pesan ───────────────────────────────────────────────────────────

function _waFmtRp(n) {
  return 'Rp ' + Math.round(n || 0).toLocaleString('id');
}

function notifInvoiceDibuat(inv) {
  sendWANotif(
    '*📋 Invoice Baru Diterbitkan*\n' +
    inv.noInvoice + ' • ' + inv.jenis + (inv.persen > 0 ? ' ' + inv.persen + '%' : '') + '\n' +
    'Klien  : ' + inv.namaKlien + '\n' +
    'Project: ' + inv.namaProject + '\n' +
    'Total  : ' + _waFmtRp(inv.total) + '\n' +
    'Oleh   : ' + (inv.dibuatOleh || '-')
  );
}

function notifInvoiceLunas(inv) {
  sendWANotif(
    '*✅ Invoice Lunas*\n' +
    inv.noInvoice + '\n' +
    'Klien  : ' + inv.namaKlien + '\n' +
    'Project: ' + inv.namaProject + '\n' +
    'Total  : ' + _waFmtRp(inv.total)
  );
}

function notifRequestInvoice(data) {
  sendWANotif(
    '*🔔 Request Buat Invoice*\n' +
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
    '*🔨 Work Order Dibuat*\n' +
    'WO-' + wo.noWO + ' (dari ' + wo.noPenawaran + ')\n' +
    'Klien  : ' + wo.namaKlien + '\n' +
    'Project: ' + wo.namaProject + '\n' +
    'Nilai  : ' + _waFmtRp(wo.nilaiKontrak)
  );
}
