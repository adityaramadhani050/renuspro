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

// ── Reminder Penawaran Expired ───────────────────────────────────────────────
// Kolom Penawaran_Main, 0-indexed: 3=Valid Hingga, 16=Status, 21=Reminder Expired Terkirim
function cekReminderPenawaranExpired() {
  try {
    var ss    = getSpreadsheet();
    var sheet = ss.getSheetByName('Penawaran_Main');
    if (!sheet) return { success: false, message: 'Sheet Penawaran_Main tidak ditemukan.', count: 0 };
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { success: true, message: 'Tidak ada penawaran expired yang perlu direminder.', count: 0 };

    var tz    = Session.getScriptTimeZone();
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    function parseTgl(raw) {
      if (raw instanceof Date) return isNaN(raw) ? null : raw;
      if (!raw) return null;
      var s = raw.toString();
      if (s.indexOf('T') > 0) {
        var d = new Date(s);
        return isNaN(d) ? null : d;
      }
      var parts = s.split('/');
      if (parts.length === 3) {
        var d = new Date(+parts[2], +parts[1] - 1, +parts[0]);
        return isNaN(d) ? null : d;
      }
      var d2 = new Date(s);
      return isNaN(d2) ? null : d2;
    }

    // Dedupe: simpan baris dengan rev TERTINGGI per No Penawaran
    var latestRowByNo = {};
    for (var i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      var no  = data[i][0].toString();
      var rev = parseInt(data[i][1]) || 0;
      if (!(no in latestRowByNo) || rev > latestRowByNo[no].rev) {
        latestRowByNo[no] = { rowIndex: i, rev: rev };
      }
    }

    var klienMap = {};
    var sheetKlien = ss.getSheetByName('Master_Klien');
    if (sheetKlien) {
      var kd = sheetKlien.getDataRange().getValues();
      for (var k = 1; k < kd.length; k++) {
        if (kd[k][0]) klienMap[kd[k][0].toString()] = kd[k][1].toString();
      }
    }

    var expiredList = [];
    for (var no2 in latestRowByNo) {
      var rIdx   = latestRowByNo[no2].rowIndex;
      var row    = data[rIdx];
      var status = row[16] ? row[16].toString() : 'On-Progress';
      if (status !== 'On-Progress') continue;

      var sudahKirim = row[21] ? row[21].toString().trim().toUpperCase() : '';
      if (sudahKirim === '1' || sudahKirim === 'TRUE') continue;

      var validDate = parseTgl(row[3]);
      if (!validDate || validDate >= today) continue;

      var klienId = row[5] ? row[5].toString() : '';
      expiredList.push({
        rowIndex:    rIdx,
        noPenawaran: no2,
        namaProject: row[4] ? row[4].toString() : '',
        namaKlien:   klienMap[klienId] || klienId,
        dibuatOleh:  row[6] ? row[6].toString() : '',
        validHingga: Utilities.formatDate(validDate, tz, 'dd/MM/yyyy')
      });
    }

    if (!expiredList.length) {
      return { success: true, message: 'Tidak ada penawaran expired yang perlu direminder.', count: 0 };
    }

    var config = _getWAConfig();
    if (!config.enabled || !config.endpoint || !config.target) {
      return { success: false, message: 'WA Bot belum aktif/dikonfigurasi. Aktifkan & simpan konfigurasi terlebih dahulu.', count: 0 };
    }

    sendWANotif(_waMsgReminderExpired(expiredList));

    expiredList.forEach(function(it) {
      sheet.getRange(it.rowIndex + 1, 22).setValue('1');
    });
    SpreadsheetApp.flush();

    return { success: true, message: 'Reminder terkirim untuk ' + expiredList.length + ' penawaran expired.', count: expiredList.length };
  } catch (e) {
    Logger.log('cekReminderPenawaranExpired error: ' + e);
    return { success: false, message: e.toString(), count: 0 };
  }
}

// ── Trigger manual dari Settings (tombol "Kirim Reminder Manual") ───────────
function kirimReminderExpiredManual() {
  return cekReminderPenawaranExpired();
}

function _waMsgReminderExpired(list) {
  var lines = [
    '⏰ *Reminder Follow-up Penawaran Expired*',
    'Penawaran berikut sudah lewat tanggal berlaku, mohon follow-up kembali ke customer:',
    ''
  ];
  list.forEach(function(it, idx) {
    lines.push(
      (idx + 1) + '. ' + it.noPenawaran + ' — ' + it.namaProject + '\n' +
      '   Klien : ' + it.namaKlien + '\n' +
      '   Sales : ' + it.dibuatOleh + '\n' +
      '   Valid s.d. : ' + it.validHingga
    );
  });
  return lines.join('\n');
}

// ── Trigger harian (self-installing, dipanggil dari doGet) ──────────────────
function _ensureTriggerReminderExpired() {
  try {
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty('TRIGGER_REMINDER_EXPIRED_INSTALLED') === '1') return;

    var triggers  = ScriptApp.getProjectTriggers();
    var sudahAda = triggers.some(function(t) {
      return t.getHandlerFunction() === 'cekReminderPenawaranExpired';
    });
    if (!sudahAda) {
      ScriptApp.newTrigger('cekReminderPenawaranExpired')
        .timeBased().everyDays(1).atHour(8).create();
    }
    props.setProperty('TRIGGER_REMINDER_EXPIRED_INSTALLED', '1');
  } catch (e) {
    Logger.log('_ensureTriggerReminderExpired error: ' + e);
  }
}
