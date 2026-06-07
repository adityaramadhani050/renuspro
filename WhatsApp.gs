/**
 * WhatsApp.gs — RenusPro
 * Notifikasi otomatis via Baileys self-hosted server.
 *
 * Konfigurasi disimpan di Script Properties:
 *   WA_ENABLED  : "true" / "false"
 *   WA_ENDPOINT : URL server Baileys (contoh: https://your-server.com)
 *   WA_TARGET   : Group JID tujuan (contoh: 1234567890-1234567890@g.us)
 */

// ── Ambil konfigurasi ────────────────────────────────────────────────────────
function _getWAConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    enabled:  props.getProperty('WA_ENABLED') === 'true',
    endpoint: props.getProperty('WA_ENDPOINT') || '',
    target:   props.getProperty('WA_TARGET')   || ''
  };
}

// ── Simpan konfigurasi (dipanggil dari frontend) ─────────────────────────────
function saveWAConfig(payload) {
  try {
    var props = PropertiesService.getScriptProperties();
    props.setProperty('WA_ENABLED',  payload.enabled ? 'true' : 'false');
    props.setProperty('WA_ENDPOINT', (payload.endpoint || '').trim().replace(/\/$/, ''));
    props.setProperty('WA_TARGET',   (payload.target   || '').trim());
    return { success: true, message: 'Konfigurasi WA Bot berhasil disimpan.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

// ── Baca konfigurasi (dipanggil dari frontend) ───────────────────────────────
function getWAConfig() {
  var c = _getWAConfig();
  return {
    success:  true,
    enabled:  c.enabled,
    endpoint: c.endpoint,
    target:   c.target
  };
}

// ── Kirim pesan via Baileys ──────────────────────────────────────────────────
function sendWANotif(message) {
  var config = _getWAConfig();
  if (!config.enabled || !config.endpoint || !config.target || !message) return;
  try {
    UrlFetchApp.fetch(config.endpoint + '/api/messages/send', {
      method:  'post',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify({ phone: config.target, message: message }),
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log('WA notif error: ' + e);
  }
}

// ── Test kirim pesan ─────────────────────────────────────────────────────────
function testWANotif(payload) {
  var props    = PropertiesService.getScriptProperties();
  var endpoint = (payload.endpoint || '').trim().replace(/\/$/, '') || props.getProperty('WA_ENDPOINT') || '';
  var target   = (payload.target   || '').trim()                    || props.getProperty('WA_TARGET')   || '';

  if (!endpoint || !target) {
    return { success: false, message: 'Server URL dan Group JID wajib diisi.' };
  }

  try {
    var resp = UrlFetchApp.fetch(endpoint + '/api/messages/send', {
      method:  'post',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify({
        phone:   target,
        message: '✅ *Test Notifikasi RenusPro*\nKonfigurasi WA Bot berhasil terhubung!'
      }),
      muteHttpExceptions: true
    });

    var httpCode = resp.getResponseCode();
    var body     = resp.getContentText();
    var result;
    try { result = JSON.parse(body); } catch(e) { result = {}; }

    if (httpCode === 200 && result.success) {
      return { success: true, message: 'Pesan test berhasil dikirim ke grup!' };
    }

    var errMsg = result.error || body || 'Unknown error';
    return { success: false, message: '[HTTP ' + httpCode + '] ' + errMsg };
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
