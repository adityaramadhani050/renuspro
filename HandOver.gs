/**
 * Hand Over — serah terima Work Order dari Sales ke tim Project/Engineering
 * sebelum project dieksekusi.
 *
 * Alur: Sales "Request Hand Over" → Project Coordinator "Jadwalkan HO"
 * (online/offline; online bisa generate link Google Meet) → PC "Selesai HO"
 * (wajib isi MoM/catatan hasil). WO baru bisa masuk BoM/DED/QC/PO setelah Selesai HO.
 *
 * Sheet HandOver (per WO):
 *  0 No WO | 1 Status (Diminta|Dijadwalkan|Selesai|Batal) | 2 Diminta Oleh
 *  3 Diminta Pada | 4 Tgl Jadwal | 5 Waktu | 6 Mode (Online|Offline)
 *  7 Link Meet | 8 Lokasi | 9 Peserta | 10 Catatan Undangan
 *  11 Dijadwalkan Oleh | 12 Dijadwalkan Pada | 13 MoM | 14 Selesai Oleh
 *  15 Selesai Pada | 16 Meet Event ID
 */

function _ensureHandOverSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('HandOver');
  if (sheet) return sheet;
  sheet = ss.insertSheet('HandOver');
  sheet.appendRow(['No WO', 'Status', 'Diminta Oleh', 'Diminta Pada', 'Tgl Jadwal', 'Waktu',
    'Mode', 'Link Meet', 'Lokasi', 'Peserta', 'Catatan Undangan', 'Dijadwalkan Oleh',
    'Dijadwalkan Pada', 'MoM', 'Selesai Oleh', 'Selesai Pada', 'Meet Event ID']);
  sheet.getRange(1, 1, 1, 17).setFontWeight('bold');
  return sheet;
}

function _hoNow() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'); }

// Normalkan tanggal → ISO yyyy-MM-dd (Date / GMT string / ISO / dd-mm).
function _hoIso(v) {
  try {
    if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var s = (v || '').toString().trim();
    if (!s) return '';
    var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
    var dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (dmy) return dmy[3] + '-' + dmy[2] + '-' + dmy[1];
    if (s.indexOf('GMT') !== -1) { var d = new Date(s); if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
    return s;
  } catch (e) { return (v || '').toString(); }
}

// Normalkan timestamp → 'dd/MM/yyyy HH:mm' (sheet bisa auto-ubah string → Date).
function _hoTs(v) {
  try {
    if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    var s = (v || '').toString().trim();
    if (!s) return '';
    if (s.indexOf('GMT') !== -1 || /^[A-Za-z]{3}\s/.test(s)) {
      var d = new Date(s);
      if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    }
    return s;
  } catch (e) { return (v || '').toString(); }
}

// Normalkan waktu → 'HH:mm' (sheet bisa auto-ubah '12:00' → Date/GMT).
function _hoJam(v) {
  try {
    if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
    var s = (v || '').toString().trim();
    if (!s) return '';
    var m = s.match(/(\d{1,2}):(\d{2})/);
    if (m) return ('0' + m[1]).slice(-2) + ':' + m[2];
    var d = new Date(s);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'HH:mm');
    return s;
  } catch (e) { return (v || '').toString(); }
}

function _hoFindRow(sheet, noWO) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().trim() === noWO) return { rowIdx: i, row: data[i] };
  }
  return null;
}

// Status HO sebuah WO ('' bila belum ada / dibatalkan).
function _hoStatus(noWO) {
  try {
    var f = _hoFindRow(_ensureHandOverSheet(getSpreadsheet()), (noWO || '').toString().trim());
    return f ? (f.row[1] || '').toString() : '';
  } catch (e) { return ''; }
}

// Peta noWO → status HO.
function _hoStatusMap() {
  var map = {};
  try {
    var data = _ensureHandOverSheet(getSpreadsheet()).getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var w = (data[i][0] || '').toString().trim();
      if (w) map[w] = (data[i][1] || '').toString();
    }
  } catch (e) {}
  return map;
}

// Guard gating: WO hanya boleh masuk modul eksekusi (BoM/DED/QC/PO) bila HO Selesai.
function _hoRequireSelesai(noWO) {
  var st = _hoStatus(noWO);
  if (st === 'Selesai') return { ok: true };
  var msg = st === 'Dijadwalkan' ? 'Hand Over WO ini masih Dijadwalkan — selesaikan HO dulu.'
          : st === 'Diminta'     ? 'Hand Over WO ini baru Diminta — jadwalkan & selesaikan HO dulu.'
          : 'WO ini belum melewati Hand Over. Selesaikan Hand Over dulu sebelum lanjut.';
  return { ok: false, message: msg };
}

// Daftar user aktif untuk pilihan peserta hand over.
function getHOUserOptions() {
  try {
    var users = (getUserList() || []).filter(function (u) { return u.aktif; })
      .map(function (u) { return { id: u.id, nama: u.nama, role: u.role, email: u.email || '' }; });
    return { success: true, list: users };
  } catch (e) { return { success: false, list: [], message: e.toString() }; }
}

// Peta nama user → objek user (untuk resolve peserta → email/noWa).
function _hoUserMapByNama() {
  var map = {};
  try { (getUserList() || []).forEach(function (u) { map[(u.nama || '').toString().trim()] = u; }); } catch (e) {}
  return map;
}
function _hoWOProject(noWO) {
  try {
    var wo = (getWorkOrderList() || []).filter(function (w) { return w.noWO === noWO; })[0];
    return wo ? { namaProject: wo.namaProject || '', namaKlien: wo.namaKlien || '' } : { namaProject: '', namaKlien: '' };
  } catch (e) { return { namaProject: '', namaKlien: '' }; }
}

// Undang peserta ke event Calendar (Meet) → Google kirim undangan otomatis.
function _hoInviteCalendar(eventId, emails) {
  try {
    if (!eventId || typeof Calendar === 'undefined' || !Calendar.Events) return;
    var att = (emails || []).filter(function (e) { return e && e.indexOf('@') !== -1; }).map(function (e) { return { email: e }; });
    if (!att.length) return;
    Calendar.Events.patch({ attendees: att }, 'primary', eventId, { conferenceDataVersion: 1, sendUpdates: 'all' });
  } catch (e) { Logger.log('HO calendar invite error: ' + e); }
}

// WA ke Project Coordinator saat sales request HO.
function _hoNotifRequest(noWO, oleh) {
  try {
    if (typeof _waSendTo !== 'function' || typeof _qcPhonesByRole !== 'function') return;
    var proj = _hoWOProject(noWO);
    var msg = '🤝 *Request Hand Over*\nWO: ' + noWO + (proj.namaProject ? ' — ' + proj.namaProject : '') +
      '\nDiminta oleh: ' + (oleh || '-') + '\nMohon dijadwalkan oleh Project Coordinator.';
    (_qcPhonesByRole('projectcoordinator') || []).forEach(function (pc) { _waSendTo(pc.phone, msg); });
  } catch (e) {}
}

// WA ke seluruh peserta saat HO dijadwalkan.
function _hoNotifSchedule(noWO, payload, names, umap) {
  try {
    if (typeof _waSendTo !== 'function') return;
    var proj = _hoWOProject(noWO);
    var tgl = _hoIso(payload.tanggal);
    var tglTxt = tgl ? tgl.split('-').reverse().join('/') : '-';
    var lokasiLink = payload.mode === 'Online' ? ('Link: ' + (payload.link || '-')) : ('Lokasi: ' + (payload.lokasi || '-'));
    var msg = '📅 *Hand Over Dijadwalkan*\nWO: ' + noWO + (proj.namaProject ? ' — ' + proj.namaProject : '') +
      '\nTanggal: ' + tglTxt + (payload.waktu ? ' ' + payload.waktu : '') +
      '\nMode: ' + payload.mode + '\n' + lokasiLink;
    (names || []).forEach(function (n) {
      var u = umap[n];
      if (u && u.aktif && u.noWa) _waSendTo(_normalizePhone(u.noWa), msg);
    });
  } catch (e) {}
}

// Record HO lengkap sebuah WO (untuk panel di detail Work Order).
function getHandOverByWO(noWO) {
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: false, message: 'No WO wajib.' };
    var f = _hoFindRow(_ensureHandOverSheet(getSpreadsheet()), noWO);
    if (!f) return { success: true, record: null };
    var r = f.row;
    return {
      success: true,
      record: {
        noWO: noWO,
        status: (r[1] || '').toString(),
        dimintaOleh: (r[2] || '').toString(),
        dimintaPada: _hoTs(r[3]),
        tglJadwal: _hoIso(r[4]),
        waktu: _hoJam(r[5]),
        mode: (r[6] || '').toString(),
        linkMeet: (r[7] || '').toString(),
        lokasi: (r[8] || '').toString(),
        peserta: (r[9] || '').toString(),
        catatanUndangan: (r[10] || '').toString(),
        dijadwalkanOleh: (r[11] || '').toString(),
        dijadwalkanPada: _hoTs(r[12]),
        mom: (r[13] || '').toString(),
        selesaiOleh: (r[14] || '').toString(),
        selesaiPada: _hoTs(r[15]),
        meetEventId: (r[16] || '').toString()
      }
    };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// ── Sales: Request Hand Over ─────────────────────────────────────
function requestHandOver(noWO, oleh) {
  var lock = LockService.getScriptLock();
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: false, message: 'No WO wajib.' };
    lock.waitLock(15000);
    var sheet = _ensureHandOverSheet(getSpreadsheet());
    var f = _hoFindRow(sheet, noWO);
    if (f) {
      var st = (f.row[1] || '').toString();
      if (st && st !== 'Batal') return { success: false, message: 'Hand Over WO ini sudah ada (status ' + st + ').' };
      // Batal → boleh minta ulang: reset baris.
      sheet.getRange(f.rowIdx + 1, 1, 1, 17).setValues([[noWO, 'Diminta', (oleh || '').toString(), _hoNow(), '', '', '', '', '', '', '', '', '', '', '', '', '']]);
    } else {
      sheet.appendRow([noWO, 'Diminta', (oleh || '').toString(), _hoNow(), '', '', '', '', '', '', '', '', '', '', '', '', '']);
    }
    try { _hoNotifRequest(noWO, oleh); } catch (eN) {}
    return { success: true, message: 'Request Hand Over WO ' + noWO + ' dikirim ke Project Coordinator.' };
  } catch (e) { return { success: false, message: e.toString() }; }
  finally { try { lock.releaseLock(); } catch (e) {} }
}

// ── Generate link Google Meet (hybrid; butuh Advanced Calendar Service) ──
// payload: { noWO, tanggal(yyyy-MM-dd), waktu(HH:mm), durasiMenit?, emails? }
function hoGenerateMeet(payload) {
  try {
    payload = payload || {};
    if (typeof Calendar === 'undefined' || !Calendar.Events) {
      return { success: false, message: 'Layanan Google Calendar (Advanced) belum aktif. Isi link manual, atau aktifkan Advanced Calendar Service lalu deploy ulang.' };
    }
    var tanggal = _hoIso(payload.tanggal);
    var waktu = (payload.waktu || '').toString();
    if (!tanggal) return { success: false, message: 'Isi Tanggal jadwal dulu sebelum generate Meet.' };
    if (!/^\d{2}:\d{2}$/.test(waktu)) waktu = '09:00';
    var tz = Session.getScriptTimeZone();
    var start = new Date(tanggal + 'T' + waktu + ':00');
    if (isNaN(start.getTime())) return { success: false, message: 'Tanggal/waktu tidak valid.' };
    var dur = Number(payload.durasiMenit) || 60;
    var end = new Date(start.getTime() + dur * 60000);
    var attendees = [];
    var emails = payload.emails;
    if (typeof emails === 'string') emails = emails.split(/[,;\s]+/);
    (emails || []).forEach(function (e) { e = (e || '').toString().trim(); if (e && e.indexOf('@') !== -1) attendees.push({ email: e }); });
    var ev = {
      summary: 'Hand Over ' + (payload.noWO || ''),
      description: 'Meeting Hand Over Work Order ' + (payload.noWO || ''),
      start: { dateTime: Utilities.formatDate(start, tz, "yyyy-MM-dd'T'HH:mm:ss"), timeZone: tz },
      end:   { dateTime: Utilities.formatDate(end, tz, "yyyy-MM-dd'T'HH:mm:ss"), timeZone: tz },
      conferenceData: { createRequest: { requestId: Utilities.getUuid(), conferenceSolutionKey: { type: 'hangoutsMeet' } } }
    };
    if (attendees.length) ev.attendees = attendees;
    var created = Calendar.Events.insert(ev, 'primary', { conferenceDataVersion: 1, sendUpdates: attendees.length ? 'all' : 'none' });
    var link = created.hangoutLink || '';
    if (!link && created.conferenceData && created.conferenceData.entryPoints) {
      created.conferenceData.entryPoints.forEach(function (ep) { if (ep.entryPointType === 'video' && ep.uri) link = ep.uri; });
    }
    if (!link) return { success: false, message: 'Meet belum siap, coba lagi atau isi manual.', eventId: created.id || '' };
    return { success: true, link: link, eventId: (created.id || ''), message: 'Link Google Meet dibuat.' };
  } catch (e) {
    return { success: false, message: 'Gagal generate Meet: ' + e.toString() + '. Isi link manual.' };
  }
}

// ── PC: Jadwalkan / Reschedule HO ────────────────────────────────
// payload: { noWO, tanggal, waktu, mode(Online|Offline), link, lokasi, peserta, catatan, meetEventId, oleh }
function scheduleHandOver(payload) {
  var lock = LockService.getScriptLock();
  try {
    payload = payload || {};
    var noWO = (payload.noWO || '').toString().trim();
    if (!noWO) return { success: false, message: 'No WO wajib.' };
    var tanggal = _hoIso(payload.tanggal);
    if (!tanggal) return { success: false, message: 'Tanggal jadwal wajib.' };
    if (!(payload.waktu || '').toString().trim()) return { success: false, message: 'Waktu jadwal wajib diisi.' };
    var mode = (payload.mode || '').toString();
    if (mode !== 'Online' && mode !== 'Offline') return { success: false, message: 'Pilih mode Online/Offline.' };
    var link = (payload.link || '').toString().trim();
    var lokasi = (payload.lokasi || '').toString().trim();
    if (mode === 'Online' && !link) return { success: false, message: 'Isi link meeting (generate Meet atau tempel manual).' };
    if (mode === 'Offline' && !lokasi) return { success: false, message: 'Isi lokasi hand over.' };
    lock.waitLock(15000);
    var sheet = _ensureHandOverSheet(getSpreadsheet());
    var f = _hoFindRow(sheet, noWO);
    if (!f) return { success: false, message: 'Request Hand Over belum ada untuk WO ini.' };
    var st = (f.row[1] || '').toString();
    if (st !== 'Diminta' && st !== 'Dijadwalkan') return { success: false, message: 'Hand Over tidak bisa dijadwalkan (status ' + (st || '-') + ').' };
    var rIdx = f.rowIdx + 1;
    sheet.getRange(rIdx, 2).setValue('Dijadwalkan');
    sheet.getRange(rIdx, 5, 1, 7).setValues([[tanggal, (payload.waktu || '').toString(), mode, (mode === 'Online' ? link : ''), (mode === 'Offline' ? lokasi : ''), (payload.peserta || '').toString(), (payload.catatan || '').toString()]]);
    sheet.getRange(rIdx, 12, 1, 2).setValues([[(payload.oleh || '').toString(), _hoNow()]]);
    if (payload.meetEventId) sheet.getRange(rIdx, 17).setValue((payload.meetEventId || '').toString());
    // Undangan Calendar (peserta) + notifikasi WA ke peserta.
    try {
      var umap = _hoUserMapByNama();
      var names = (payload.peserta || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      if (mode === 'Online' && payload.meetEventId) {
        var emails = names.map(function (n) { return umap[n] ? (umap[n].email || '') : ''; }).filter(function (e) { return e; });
        _hoInviteCalendar((payload.meetEventId || '').toString(), emails);
      }
      _hoNotifSchedule(noWO, payload, names, umap);
    } catch (eN) {}
    return { success: true, message: 'Hand Over WO ' + noWO + ' dijadwalkan.' };
  } catch (e) { return { success: false, message: e.toString() }; }
  finally { try { lock.releaseLock(); } catch (e) {} }
}

// ── PC: Selesai HO (wajib MoM) ───────────────────────────────────
function completeHandOver(noWO, mom, oleh) {
  var lock = LockService.getScriptLock();
  try {
    noWO = (noWO || '').toString().trim();
    mom = (mom || '').toString().trim();
    if (!noWO) return { success: false, message: 'No WO wajib.' };
    if (!mom) return { success: false, message: 'Catatan hasil meeting (MoM) wajib diisi.' };
    lock.waitLock(15000);
    var sheet = _ensureHandOverSheet(getSpreadsheet());
    var f = _hoFindRow(sheet, noWO);
    if (!f) return { success: false, message: 'Hand Over belum ada untuk WO ini.' };
    if ((f.row[1] || '').toString() !== 'Dijadwalkan') return { success: false, message: 'Hand Over harus berstatus Dijadwalkan dulu.' };
    var rIdx = f.rowIdx + 1;
    sheet.getRange(rIdx, 2).setValue('Selesai');
    sheet.getRange(rIdx, 14).setValue(mom);
    sheet.getRange(rIdx, 15, 1, 2).setValues([[(oleh || '').toString(), _hoNow()]]);
    return { success: true, message: 'Hand Over WO ' + noWO + ' selesai. WO siap dieksekusi.' };
  } catch (e) { return { success: false, message: e.toString() }; }
  finally { try { lock.releaseLock(); } catch (e) {} }
}

// ── Batalkan HO (dari Diminta/Dijadwalkan) ───────────────────────
function batalHandOver(noWO, oleh) {
  var lock = LockService.getScriptLock();
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: false, message: 'No WO wajib.' };
    lock.waitLock(15000);
    var sheet = _ensureHandOverSheet(getSpreadsheet());
    var f = _hoFindRow(sheet, noWO);
    if (!f) return { success: false, message: 'Hand Over tidak ditemukan.' };
    var st = (f.row[1] || '').toString();
    if (st === 'Selesai') return { success: false, message: 'Hand Over sudah Selesai, tidak bisa dibatalkan.' };
    sheet.getRange(f.rowIdx + 1, 2).setValue('Batal');
    return { success: true, message: 'Hand Over WO ' + noWO + ' dibatalkan.' };
  } catch (e) { return { success: false, message: e.toString() }; }
  finally { try { lock.releaseLock(); } catch (e) {} }
}
