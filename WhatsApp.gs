/**
 * WhatsApp.gs — RenusPro
 * Notifikasi otomatis via Baileys self-hosted server.
 *
 * Konfigurasi disimpan di Script Properties:
 *   WA_ENABLED  : "true" / "false"
 *   WA_ENDPOINT : URL server Baileys (contoh: https://your-server.com)
 *   WA_TARGET   : Group JID tujuan (contoh: 1234567890-1234567890@g.us)
 *   WA_JWT_TOKEN: Token JWT statis untuk header Authorization: Bearer <token>
 */

// ── Ambil konfigurasi ────────────────────────────────────────────────────────
function _getWAConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    enabled:  props.getProperty('WA_ENABLED') === 'true',
    endpoint: props.getProperty('WA_ENDPOINT') || '',
    target:   props.getProperty('WA_TARGET')   || '',
    token:    props.getProperty('WA_JWT_TOKEN') || ''
  };
}

// ── Header request ke server Baileys ────────────────────────────────────────
function _waHeaders(token) {
  var headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return headers;
}

// ── Simpan konfigurasi (dipanggil dari frontend) ─────────────────────────────
function saveWAConfig(payload) {
  try {
    var props = PropertiesService.getScriptProperties();
    props.setProperty('WA_ENABLED',  payload.enabled ? 'true' : 'false');
    props.setProperty('WA_ENDPOINT', (payload.endpoint || '').trim().replace(/\/$/, ''));
    props.setProperty('WA_TARGET',   (payload.target   || '').trim());
    props.setProperty('WA_JWT_TOKEN', (payload.token    || '').trim());
    if (payload.qcNotif !== undefined) props.setProperty('WA_QC_ENABLED', payload.qcNotif ? 'true' : 'false');
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
    target:   c.target,
    token:    c.token,
    qcNotif:  PropertiesService.getScriptProperties().getProperty('WA_QC_ENABLED') !== 'false'
  };
}

// ── Kirim pesan via Baileys ──────────────────────────────────────────────────
function sendWANotif(message) {
  var config = _getWAConfig();
  if (!config.enabled || !config.endpoint || !config.target || !message) return;
  try {
    UrlFetchApp.fetch(config.endpoint + '/api/messages/send', {
      method:  'post',
      headers: _waHeaders(config.token),
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
  var token    = (payload.token    || '').trim()                    || props.getProperty('WA_JWT_TOKEN') || '';

  if (!endpoint || !target) {
    return { success: false, message: 'Server URL dan Group JID wajib diisi.' };
  }

  try {
    var resp = UrlFetchApp.fetch(endpoint + '/api/messages/send', {
      method:  'post',
      headers: _waHeaders(token),
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
// Kolom Penawaran_Main, 0-indexed: 3=Valid Hingga, 16=Status, 21=Reminder Expired Terakhir Dikirim (timestamp)
function _cekReminderPenawaranExpiredCore(forceAll) {
  try {
    var ss    = getSpreadsheet();
    var sheet = ss.getSheetByName('Penawaran_Main');
    if (!sheet) return { success: false, message: 'Sheet Penawaran_Main tidak ditemukan.', count: 0 };
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { success: true, message: 'Tidak ada penawaran expired yang perlu direminder.', count: 0 };

    var props        = PropertiesService.getScriptProperties();
    var intervalHari = parseInt(props.getProperty('WA_REMINDER_INTERVAL_HARI')) || 3;

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

    function parseLastSent(raw) {
      var d;
      if (raw instanceof Date) {
        d = isNaN(raw) ? null : new Date(raw.getTime());
      } else if (!raw) {
        d = null;
      } else {
        d = new Date(raw.toString().trim());
        if (isNaN(d)) d = null;
      }
      // Normalisasi ke tengah malam agar selisih hari dihitung per kalender,
      // bukan terpengaruh jam saat reminder dikirim (mis. 08:12).
      if (d) d.setHours(0, 0, 0, 0);
      return d;
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

      var validDate = parseTgl(row[3]);
      if (!validDate) continue;
      validDate.setHours(0, 0, 0, 0);
      // Reminder mulai H-1 (satu hari sebelum tanggal berlaku habis) dan seterusnya.
      var reminderMulai = new Date(validDate.getTime());
      reminderMulai.setDate(reminderMulai.getDate() - 1);
      if (reminderMulai > today) continue;

      if (!forceAll) {
        var lastSent = parseLastSent(row[21]);
        if (lastSent) {
          var diffHari = Math.floor((today - lastSent) / 86400000);
          if (diffHari < intervalHari) continue;
        }
      }

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

    var now = new Date();
    expiredList.forEach(function(it) {
      sheet.getRange(it.rowIndex + 1, 22).setValue(now);
    });
    SpreadsheetApp.flush();

    return { success: true, message: 'Reminder terkirim untuk ' + expiredList.length + ' penawaran expired.', count: expiredList.length };
  } catch (e) {
    Logger.log('cekReminderPenawaranExpired error: ' + e);
    return { success: false, message: e.toString(), count: 0 };
  }
}

// ── Dipanggil oleh trigger harian: menghormati selang hari reminder ulang ───
function cekReminderPenawaranExpired() {
  return _cekReminderPenawaranExpiredCore(false);
}

// ── Dipanggil tombol "Kirim Reminder Manual": tanpa batasan sudah/belum direminder ──
function kirimReminderExpiredManual() {
  return _cekReminderPenawaranExpiredCore(true);
}

function _waMsgReminderExpired(list) {
  var lines = [
    '⏰ *Reminder Follow-up Penawaran*',
    'Penawaran berikut akan/sudah lewat tanggal berlaku, mohon segera follow-up ke customer:',
    '',
    '📊 Total: *' + list.length + '* penawaran perlu di-follow-up',
    ''
  ];

  // Kelompokkan per sales (dibuatOleh)
  var groups    = {};
  var salesUrut = [];
  list.forEach(function(it) {
    var sales = it.dibuatOleh || 'Tanpa Sales';
    if (!groups[sales]) { groups[sales] = []; salesUrut.push(sales); }
    groups[sales].push(it);
  });

  salesUrut.forEach(function(sales, gIdx) {
    lines.push('👤 *' + sales + '* (' + groups[sales].length + ' penawaran)');
    groups[sales].forEach(function(it, idx) {
      lines.push(
        (idx + 1) + '. ' + it.noPenawaran + ' - ' + it.namaProject +
        ' (' + it.namaKlien + ') #Exp. ' + it.validHingga
      );
    });
    if (gIdx < salesUrut.length - 1) lines.push('');
  });

  return lines.join('\n');
}

// ── Jadwal reminder (jam & selang hari) — dipanggil dari Settings ───────────
function getWAReminderScheduleConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    success:      true,
    jam:          parseInt(props.getProperty('WA_REMINDER_HOUR')) || 8,
    intervalHari: parseInt(props.getProperty('WA_REMINDER_INTERVAL_HARI')) || 3
  };
}

function saveWAReminderScheduleConfig(payload) {
  try {
    var jam = parseInt(payload.jam);
    if (isNaN(jam) || jam < 0 || jam > 23) jam = 8;
    var intervalHari = parseInt(payload.intervalHari);
    if (isNaN(intervalHari) || intervalHari < 1) intervalHari = 1;

    var props = PropertiesService.getScriptProperties();
    props.setProperty('WA_REMINDER_HOUR', jam.toString());
    props.setProperty('WA_REMINDER_INTERVAL_HARI', intervalHari.toString());

    _reinstallTriggerReminderExpired(jam);

    return { success: true, message: 'Jadwal reminder disimpan: jam ' + jam + ':00, diulang tiap ' + intervalHari + ' hari.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function _reinstallTriggerReminderExpired(jam) {
  jam = parseInt(jam, 10);
  if (isNaN(jam) || jam < 0 || jam > 23) jam = 8;
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'cekReminderPenawaranExpired') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('cekReminderPenawaranExpired')
    .timeBased().everyDays(1).atHour(jam).create();
  PropertiesService.getScriptProperties().setProperty('TRIGGER_REMINDER_EXPIRED_INSTALLED', '1');
}

// ═══════════════════════════════════════════════════════════════════════════
//  NOTIFIKASI QC (Lead Engineer & Site Engineer) — DM personal ke nomor user
// ═══════════════════════════════════════════════════════════════════════════

// Kirim WA ke satu nomor/JID tertentu (bukan grup WA_TARGET).
function _waSendTo(phone, message) {
  var config = _getWAConfig();
  if (!config.enabled || !config.endpoint || !phone || !message) return false;
  try {
    UrlFetchApp.fetch(config.endpoint + '/api/messages/send', {
      method: 'post', headers: _waHeaders(config.token),
      payload: JSON.stringify({ phone: phone, message: message }),
      muteHttpExceptions: true
    });
    return true;
  } catch (e) { Logger.log('WA send error: ' + e); return false; }
}

// Notifikasi QC aktif bila WA aktif DAN toggle WA_QC_ENABLED bukan 'false'.
function _waQCEnabled() {
  var props = PropertiesService.getScriptProperties();
  return props.getProperty('WA_ENABLED') === 'true' && props.getProperty('WA_QC_ENABLED') !== 'false';
}

// Map kode item → label (untuk isi pesan). Best-effort.
function _qcLabelMap() {
  var map = {};
  try {
    var sh = getSpreadsheet().getSheetByName('QC_Checklist');
    if (sh) {
      var d = sh.getDataRange().getValues();
      for (var i = 1; i < d.length; i++) { if (d[i][0]) map[d[i][0].toString()] = (d[i][2] || '').toString(); }
    }
  } catch (e) {}
  return map;
}

// Nama project WO (untuk konteks pesan).
function _qcWOProject(noWO) {
  try {
    var list = getWorkOrderList() || [];
    for (var i = 0; i < list.length; i++) { if (list[i].noWO === noWO) return (list[i].namaProject || '').toString(); }
  } catch (e) {}
  return '';
}

// Nomor WA user aktif berdasar peran.
function _qcPhonesByRole(role) {
  var out = [];
  try {
    (getUserList() || []).forEach(function (u) {
      if (u.role === role && u.aktif && u.noWa) out.push({ nama: u.nama, phone: _normalizePhone(u.noWa) });
    });
  } catch (e) {}
  return out;
}

// Nomor WA site engineer yang ditugaskan ke WO.
function _qcPhonesForWO(noWO) {
  var out = [];
  try {
    var assigned = _qcAssignedMap()[noWO] || [];
    if (!assigned.length) return out;
    var byId = {};
    (getUserList() || []).forEach(function (u) { byId[u.id] = u; });
    assigned.forEach(function (a) {
      var u = byId[a.id];
      if (u && u.aktif && u.noWa) out.push({ nama: u.nama, phone: _normalizePhone(u.noWa) });
    });
  } catch (e) {}
  return out;
}

// Item baru masuk antrean review → DM semua Lead Engineer.
// wasStatus dipakai agar tak dobel notif saat menambah foto ke item yg sudah Pending.
function _qcNotifLeadReview(noWO, kode, oleh, count, wasStatus) {
  try {
    if (!_waQCEnabled()) return;
    if ((wasStatus || '') === 'Pending') return;
    var leads = _qcPhonesByRole('leadengineer');
    if (!leads.length) return;
    var label = _qcLabelMap()[kode] || '';
    var proj = _qcWOProject(noWO);
    var msg = [
      '🔔 *QC Baru Perlu Direview*',
      'WO: *' + noWO + '*' + (proj ? ' — ' + proj : ''),
      'Item: ' + kode + (label ? ' · ' + label : ''),
      (count ? count + ' file' : 'Foto') + ' diunggah oleh ' + (oleh || '-') + '.',
      '',
      'Mohon segera direview di RenusPro.'
    ].join('\n');
    leads.forEach(function (l) { _waSendTo(l.phone, msg); });
  } catch (e) { Logger.log('_qcNotifLeadReview error: ' + e); }
}

// Hasil review → DM site engineer WO tsb (approve/reject).
function _qcNotifSiteReview(noWO, kode, keputusan, catatan) {
  try {
    if (!_waQCEnabled()) return;
    var sites = _qcPhonesForWO(noWO);
    if (!sites.length) return;
    var label = _qcLabelMap()[kode] || '';
    var proj = _qcWOProject(noWO);
    var head = 'WO: *' + noWO + '*' + (proj ? ' — ' + proj : '') + '\nItem: ' + kode + (label ? ' · ' + label : '');
    var msg;
    if (keputusan === 'Approved') {
      msg = ['✅ *QC Disetujui*', head, '', 'Kerja bagus! Item ini sudah di-approve.'].join('\n');
    } else {
      var lines = ['❌ *QC Ditolak — Perlu Revisi*', head];
      if (catatan) lines.push('📝 Catatan: ' + catatan);
      lines.push('', 'Mohon segera perbaiki & upload ulang.');
      msg = lines.join('\n');
    }
    sites.forEach(function (s) { _waSendTo(s.phone, msg); });
  } catch (e) { Logger.log('_qcNotifSiteReview error: ' + e); }
}

// ── Trigger harian (self-installing, dipanggil dari doGet) ──────────────────
function _ensureTriggerReminderExpired() {
  try {
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty('TRIGGER_REMINDER_EXPIRED_INSTALLED') === '1') return;

    var jam = parseInt(props.getProperty('WA_REMINDER_HOUR')) || 8;
    _reinstallTriggerReminderExpired(jam);
  } catch (e) {
    Logger.log('_ensureTriggerReminderExpired error: ' + e);
  }
}
