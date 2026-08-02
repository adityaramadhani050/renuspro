/**
 * Project Schedule — Gantt chart timeline proyek (per Work Order).
 * Disusun manual oleh Project Coordinator / Lead Engineer / Admin.
 * Registrasi WO manual (pola BOM/QC/DED).
 *
 * Sheet Schedule_Project: No WO | Nama Project | Nama Klien | Ditambahkan Oleh | Ditambahkan Pada | Site Engineer
 * Sheet Schedule_Task:    ID | No WO | Nama Tugas | Fase | Tanggal Mulai | Tanggal Selesai |
 *                         Progress | Warna | Urutan | Catatan | Dibuat Oleh | Dibuat Pada
 */

function _ensureScheduleProjectSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('Schedule_Project');
  if (sheet) {
    // Migrasi: pastikan kolom Site Engineer (kolom 6) ada pada sheet lama.
    if (sheet.getLastColumn() < 6) sheet.getRange(1, 6).setValue('Site Engineer').setFontWeight('bold');
    return sheet;
  }
  sheet = ss.insertSheet('Schedule_Project');
  sheet.appendRow(['No WO', 'Nama Project', 'Nama Klien', 'Ditambahkan Oleh', 'Ditambahkan Pada', 'Site Engineer']);
  sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
  return sheet;
}

function _ensureScheduleTaskSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('Schedule_Task');
  if (sheet) return sheet;
  sheet = ss.insertSheet('Schedule_Task');
  sheet.appendRow(['ID', 'No WO', 'Nama Tugas', 'Fase', 'Tanggal Mulai', 'Tanggal Selesai',
    'Progress', 'Warna', 'Urutan', 'Catatan', 'Dibuat Oleh', 'Dibuat Pada']);
  sheet.getRange(1, 1, 1, 12).setFontWeight('bold');
  return sheet;
}

// Normalkan nilai tanggal → ISO 'yyyy-MM-dd' (Date object / string GMT / ISO / dd/MM/yyyy).
function _schIso(v) {
  try {
    if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var s = (v || '').toString().trim();
    if (!s) return '';
    var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      // ISO ber-waktu/Z (mis. dari cache Date.toISOString UTC) → konversi ke zona lokal
      // agar tanggal tidak mundur 1 hari untuk zona di timur UTC (GMT+7).
      if (/[T ]\d{2}:\d{2}/.test(s) || s.indexOf('Z') !== -1) {
        var dz = new Date(s);
        if (!isNaN(dz.getTime())) return Utilities.formatDate(dz, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
      return iso[1] + '-' + iso[2] + '-' + iso[3];
    }
    var dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (dmy) return dmy[3] + '-' + dmy[2] + '-' + dmy[1];
    if (s.indexOf('GMT') !== -1) {
      var d = new Date(s);
      if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    return s;
  } catch (e) { return (v || '').toString(); }
}

function _schNow() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'); }

// Selisih hari inklusif antar dua ISO date (untuk bobot progres).
function _schDurasi(mulaiIso, selesaiIso) {
  try {
    var a = new Date(mulaiIso + 'T00:00:00');
    var b = new Date(selesaiIso + 'T00:00:00');
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return 1;
    return Math.max(1, Math.round((b - a) / 86400000) + 1);
  } catch (e) { return 1; }
}

// Baca semua tugas → peta noWO → [task]. Task = objek siap render.
function _schTasksMap(ss) {
  _ensureScheduleTaskSheet(ss);
  var data = _cachedScheduleTask();
  var map = {};
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    var noWO = (data[i][1] || '').toString().trim();
    if (!map[noWO]) map[noWO] = [];
    map[noWO].push({
      id:       (data[i][0] || '').toString(),
      noWO:     noWO,
      namaTugas:(data[i][2] || '').toString(),
      fase:     (data[i][3] || '').toString(),
      mulai:    _schIso(data[i][4]),
      selesai:  _schIso(data[i][5]),
      progress: Math.max(0, Math.min(100, Number(data[i][6]) || 0)),
      warna:    (data[i][7] || '').toString(),
      urutan:   Number(data[i][8]) || 0,
      catatan:  (data[i][9] || '').toString()
    });
  }
  // Urutkan tiap WO: urutan lalu tanggal mulai.
  Object.keys(map).forEach(function (k) {
    map[k].sort(function (a, b) { return (a.urutan - b.urutan) || (a.mulai < b.mulai ? -1 : a.mulai > b.mulai ? 1 : 0); });
  });
  return map;
}

// Ringkasan proyek dari daftar tugas: rentang tanggal + progres berbobot durasi.
function _schSummary(tasks) {
  var minStart = '', maxEnd = '', totDur = 0, wProg = 0;
  (tasks || []).forEach(function (t) {
    if (t.mulai && (!minStart || t.mulai < minStart)) minStart = t.mulai;
    if (t.selesai && (!maxEnd || t.selesai > maxEnd)) maxEnd = t.selesai;
    var d = _schDurasi(t.mulai, t.selesai);
    totDur += d; wProg += (t.progress || 0) * d;
  });
  return {
    jumlahTugas: (tasks || []).length,
    tanggalMulai: minStart,
    tanggalSelesai: maxEnd,
    progress: totDur ? Math.round(wProg / totDur) : 0
  };
}

// ── Registrasi WO ke Schedule (pola BOM) ──────────────────────────
function addScheduleProject(noWO, addedBy, siteEngineer) {
  var lock = LockService.getScriptLock();
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: false, message: 'Pilih Work Order dulu.' };
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var sheet = _ensureScheduleProjectSheet(ss);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === noWO) return { success: false, message: 'Work Order sudah ada di Schedule.' };
    }
    var proj = '', klien = '';
    try {
      var wo = (getWorkOrderList() || []).filter(function (w) { return w.noWO === noWO; })[0];
      if (wo) { proj = wo.namaProject || ''; klien = wo.namaKlien || ''; }
    } catch (e) {}
    sheet.appendRow([noWO, proj, klien, (addedBy || '').toString(), _schNow(), (siteEngineer || '').toString()]);
    try { invalidateScheduleCache(); } catch (e) {}
    return { success: true, message: 'Work Order ditambahkan ke Schedule.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

function removeScheduleProject(noWO) {
  var lock = LockService.getScriptLock();
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: false, message: 'No WO wajib.' };
    lock.waitLock(15000);
    var sheet = _ensureScheduleProjectSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    var removed = false;
    for (var i = data.length - 1; i >= 1; i--) {
      if ((data[i][0] || '').toString().trim() === noWO) { sheet.deleteRow(i + 1); removed = true; }
    }
    if (removed) { try { invalidateScheduleCache(); } catch (e) {} }
    return { success: removed, message: removed ? 'Dikeluarkan dari Schedule (tugas tidak dihapus).' : 'WO tidak ditemukan.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

// Ubah Site Engineer yang ditugaskan pada sebuah WO.
function updateScheduleSiteEngineer(noWO, siteEngineer) {
  var lock = LockService.getScriptLock();
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: false, message: 'No WO wajib.' };
    lock.waitLock(15000);
    var sheet = _ensureScheduleProjectSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === noWO) {
        sheet.getRange(i + 1, 6).setValue((siteEngineer || '').toString());
        try { invalidateScheduleCache(); } catch (e) {}
        return { success: true, message: 'Site Engineer diperbarui.' };
      }
    }
    return { success: false, message: 'WO tidak ditemukan.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

// Home: daftar WO terdaftar + tugas + ringkasan (untuk mini-Gantt).
function getScheduleWOList() {
  try {
    var ss = getSpreadsheet();
    _ensureScheduleProjectSheet(ss);
    var pData = _cachedScheduleProject();
    var taskMap = _schTasksMap(ss);
    var list = [];
    for (var i = 1; i < pData.length; i++) {
      var noWO = (pData[i][0] || '').toString().trim();
      if (!noWO) continue;
      var tasks = taskMap[noWO] || [];
      list.push({
        noWO: noWO,
        namaProject: (pData[i][1] || '').toString(),
        namaKlien: (pData[i][2] || '').toString(),
        tambahOleh: (pData[i][3] || '').toString(),
        siteEngineer: (pData[i][5] || '').toString(),
        tasks: tasks,
        summary: _schSummary(tasks)
      });
    }
    return { success: true, list: list };
  } catch (e) { return { success: false, list: [], message: e.toString() }; }
}

// Detail: info proyek + tugas lengkap + ringkasan.
function getScheduleByWO(noWO) {
  try {
    noWO = (noWO || '').toString().trim();
    var ss = getSpreadsheet();
    _ensureScheduleProjectSheet(ss);
    var pData = _cachedScheduleProject();
    var proj = null;
    for (var i = 1; i < pData.length; i++) {
      if ((pData[i][0] || '').toString().trim() === noWO) { proj = { noWO: noWO, namaProject: (pData[i][1] || '').toString(), namaKlien: (pData[i][2] || '').toString(), siteEngineer: (pData[i][5] || '').toString() }; break; }
    }
    if (!proj) return { success: false, message: 'Proyek belum terdaftar di Schedule.' };
    var tasks = (_schTasksMap(ss)[noWO]) || [];
    var woStatus = '';
    try { woStatus = _getStatusWO(noWO) || ''; } catch (e) {}
    return { success: true, project: proj, tasks: tasks, summary: _schSummary(tasks), woStatus: woStatus };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// Tambah banyak tugas sekaligus (template / bulk). 1 round-trip, 1 kali tulis.
// payload: { noWO, oleh, tasks: [{namaTugas, fase, mulai, selesai, progress, warna, urutan, catatan}] }
function saveScheduleTasksBatch(payload) {
  var lock = LockService.getScriptLock();
  try {
    payload = payload || {};
    var noWO = (payload.noWO || '').toString().trim();
    if (!noWO) return { success: false, message: 'No WO wajib.' };
    var arr = payload.tasks || [];
    if (!arr.length) return { success: false, message: 'Tidak ada tugas untuk ditambahkan.' };
    var rows = [];
    var t0 = new Date().getTime();
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i] || {};
      var nama = (it.namaTugas || '').toString().trim();
      if (!nama) continue;
      var mulai = _schIso(it.mulai), selesai = _schIso(it.selesai);
      if (!mulai || !selesai) return { success: false, message: 'Tanggal mulai & selesai wajib untuk "' + nama + '".' };
      if (selesai < mulai) return { success: false, message: 'Tanggal selesai sebelum mulai untuk "' + nama + '".' };
      rows.push([
        'TSK-' + t0 + '-' + i, noWO, nama, (it.fase || '').toString(), mulai, selesai,
        Math.max(0, Math.min(100, Number(it.progress) || 0)),
        (it.warna || '').toString(), Number(it.urutan) || 0,
        (it.catatan || '').toString(), (payload.oleh || '').toString(), _schNow()
      ]);
    }
    if (!rows.length) return { success: false, message: 'Tidak ada tugas valid (nama kosong).' };
    lock.waitLock(15000);
    var sheet = _ensureScheduleTaskSheet(getSpreadsheet());
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 12).setValues(rows);
    try { invalidateScheduleCache(); } catch (e) {}
    return { success: true, message: rows.length + ' tugas ditambahkan.', count: rows.length };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

// Tambah tugas. payload: { noWO, namaTugas, fase, mulai, selesai, progress, warna, urutan, catatan, oleh }
function saveScheduleTask(payload) {
  var lock = LockService.getScriptLock();
  try {
    payload = payload || {};
    var noWO = (payload.noWO || '').toString().trim();
    var nama = (payload.namaTugas || '').toString().trim();
    if (!noWO) return { success: false, message: 'No WO wajib.' };
    if (!nama) return { success: false, message: 'Nama tugas wajib.' };
    var mulai = _schIso(payload.mulai), selesai = _schIso(payload.selesai);
    if (!mulai || !selesai) return { success: false, message: 'Tanggal mulai & selesai wajib.' };
    if (selesai < mulai) return { success: false, message: 'Tanggal selesai tidak boleh sebelum mulai.' };
    lock.waitLock(15000);
    var sheet = _ensureScheduleTaskSheet(getSpreadsheet());
    var id = 'TSK-' + new Date().getTime();
    sheet.appendRow([
      id, noWO, nama, (payload.fase || '').toString(), mulai, selesai,
      Math.max(0, Math.min(100, Number(payload.progress) || 0)),
      (payload.warna || '').toString(), Number(payload.urutan) || 0,
      (payload.catatan || '').toString(), (payload.oleh || '').toString(), _schNow()
    ]);
    try { invalidateScheduleCache(); } catch (e) {}
    return { success: true, message: 'Tugas ditambahkan.', id: id };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

// Edit tugas. payload: { id, namaTugas, fase, mulai, selesai, progress, warna, urutan, catatan }
function updateScheduleTask(payload) {
  var lock = LockService.getScriptLock();
  try {
    payload = payload || {};
    var id = (payload.id || '').toString().trim();
    if (!id) return { success: false, message: 'ID tugas wajib.' };
    var mulai = _schIso(payload.mulai), selesai = _schIso(payload.selesai);
    if (!mulai || !selesai) return { success: false, message: 'Tanggal mulai & selesai wajib.' };
    if (selesai < mulai) return { success: false, message: 'Tanggal selesai tidak boleh sebelum mulai.' };
    lock.waitLock(15000);
    var sheet = _ensureScheduleTaskSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === id) {
        sheet.getRange(i + 1, 3, 1, 8).setValues([[
          (payload.namaTugas || data[i][2]).toString(), (payload.fase || '').toString(),
          mulai, selesai, Math.max(0, Math.min(100, Number(payload.progress) || 0)),
          (payload.warna || '').toString(), Number(payload.urutan) || 0, (payload.catatan || '').toString()
        ]]);
        try { invalidateScheduleCache(); } catch (e) {}
        return { success: true, message: 'Tugas diperbarui.' };
      }
    }
    return { success: false, message: 'Tugas tidak ditemukan.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

function hapusScheduleTask(id) {
  var lock = LockService.getScriptLock();
  try {
    id = (id || '').toString().trim();
    if (!id) return { success: false, message: 'ID tugas wajib.' };
    lock.waitLock(15000);
    var sheet = _ensureScheduleTaskSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if ((data[i][0] || '').toString().trim() === id) { sheet.deleteRow(i + 1); try { invalidateScheduleCache(); } catch (e) {} return { success: true, message: 'Tugas dihapus.' }; }
    }
    return { success: false, message: 'Tugas tidak ditemukan.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally { try { lock.releaseLock(); } catch (e) {} }
}
