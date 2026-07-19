/**
 * RenusPro - Dokumen Project per Work Order.
 *
 * Dua sumber dokumen di detail WO:
 *  1) MANUAL: Kontrak yang sudah ditandatangani → diupload & disimpan di sheet
 *     WO_Dokumen + Drive folder "RenusPro - Dokumen WO/<No WO>".
 *  2) DARI QC: BAST / Surat Garansi / Hasil Commissioning diambil dari item
 *     checklist QC dgn kode tetap H1 / H2 / H3 (item tipe dokumen/PDF). File &
 *     status (Approved/Pending/dst) ditarik langsung dari QC_Item.
 *
 * Generate dokumen dari template menyusul (perlu contoh dokumen).
 */

// Pemetaan dokumen QC → kode item checklist. Ubah di sini bila kode berubah.
var _WO_QC_DOC_MAP = [
  { key: 'bast',          kode: 'H1', label: 'BAST' },
  { key: 'garansi',       kode: 'H2', label: 'Surat Garansi' },
  { key: 'commissioning', kode: 'H3', label: 'Hasil Commissioning' }
];

var _WO_DOK_HEADERS = ['No WO', 'Jenis', 'File ID', 'File URL', 'Nama File', 'Diupload Oleh', 'Diupload Pada'];

function _ensureWODokumenSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('WO_Dokumen');
  if (sheet) return sheet;
  sheet = ss.insertSheet('WO_Dokumen');
  sheet.appendRow(_WO_DOK_HEADERS);
  sheet.getRange(1, 1, 1, _WO_DOK_HEADERS.length).setFontWeight('bold');
  return sheet;
}

function _getWODokumenFolder(noWO) {
  var ssFile = DriveApp.getFileById(getSpreadsheet().getId());
  var parents = ssFile.getParents();
  var root = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  var baseName = 'RenusPro - Dokumen WO';
  var baseIt = root.getFoldersByName(baseName);
  var base = baseIt.hasNext() ? baseIt.next() : root.createFolder(baseName);
  noWO = (noWO || 'TANPA-WO').toString().trim() || 'TANPA-WO';
  var subIt = base.getFoldersByName(noWO);
  return subIt.hasNext() ? subIt.next() : base.createFolder(noWO);
}

// Upload dokumen manual (mis. Kontrak bertandatangan). Hanya PDF. Satu jenis per
// WO → upload baru menggantikan (file lama di-trash).
function uploadWODokumen(payload) {
  var lock = LockService.getScriptLock();
  try {
    payload = payload || {};
    var noWO = (payload.noWO || '').toString().trim();
    var jenis = (payload.jenis || '').toString().trim() || 'kontrak';
    var base64Data = payload.base64Data ? payload.base64Data.toString() : '';
    if (!noWO) return { success: false, message: 'No WO wajib.' };
    if (!base64Data) return { success: false, message: 'File kosong.' };

    var bytes = Utilities.base64Decode(base64Data);
    // Validasi PDF dari ISI file (magic number "%PDF"), bukan mimeType dari klien
    // yg bisa dikosongkan/dipalsukan.
    if (!(bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
      return { success: false, message: 'Hanya file PDF yang diperbolehkan.' };
    }

    lock.waitLock(20000);
    var ss = getSpreadsheet();
    var sheet = _ensureWODokumenSheet(ss);
    var when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    var origName = payload.fileName ? payload.fileName.toString() : '';
    var baseName = (origName.replace(/\.[a-zA-Z0-9]+$/, '') || jenis);
    var fileName = jenis + '-' + noWO + '-' + baseName + '.pdf';

    var blob = Utilities.newBlob(bytes, 'application/pdf', fileName);
    var file = _getWODokumenFolder(noWO).createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // Ganti baris lama (noWO, jenis) → trash file lama.
    var data = sheet.getDataRange().getValues();
    var rowIdx = -1;
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === noWO && (data[i][1] || '').toString().trim() === jenis) {
        rowIdx = i + 1;
        try { if (data[i][2]) DriveApp.getFileById((data[i][2] || '').toString()).setTrashed(true); } catch (e) {}
        break;
      }
    }
    var record = [noWO, jenis, file.getId(), file.getUrl(), fileName, (payload.oleh || '').toString(), when];
    if (rowIdx > 0) sheet.getRange(rowIdx, 1, 1, _WO_DOK_HEADERS.length).setValues([record]);
    else sheet.appendRow(record);

    return { success: true, message: 'Dokumen tersimpan.', file: { fileId: file.getId(), fileUrl: file.getUrl(), fileName: fileName } };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function hapusWODokumen(noWO, jenis) {
  var lock = LockService.getScriptLock();
  try {
    noWO = (noWO || '').toString().trim();
    jenis = (jenis || '').toString().trim() || 'kontrak';
    if (!noWO) return { success: false, message: 'No WO wajib.' };
    lock.waitLock(15000);
    var sheet = _ensureWODokumenSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if ((data[i][0] || '').toString().trim() === noWO && (data[i][1] || '').toString().trim() === jenis) {
        try { if (data[i][2]) DriveApp.getFileById((data[i][2] || '').toString()).setTrashed(true); } catch (e) {}
        sheet.deleteRow(i + 1);
      }
    }
    return { success: true, message: 'Dokumen dihapus.' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// Dokumen QC (BAST/Garansi/Commissioning) utk 1 WO — file & status dari QC_Item
// kode H1/H2/H3 (item tipe dokumen). File = foto/dokumen terakhir yg diupload.
function _getWOQCDocs(noWO) {
  var out = {};
  _WO_QC_DOC_MAP.forEach(function (m) { out[m.key] = { kode: m.kode, label: m.label, status: 'Belum Upload', file: null, by: '', at: '' }; });
  try {
    var sheet = _ensureQCItemSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    var byKode = {};
    for (var i = 1; i < data.length; i++) {
      if ((data[i][1] || '').toString().trim() !== noWO) continue;
      byKode[(data[i][2] || '').toString().trim()] = data[i];
    }
    _WO_QC_DOC_MAP.forEach(function (m) {
      var row = byKode[m.kode];
      if (!row) return;
      var doc = out[m.key];
      doc.status = (row[4] || '').toString() || 'Belum Upload';
      var foto = _qcParseFoto(row[3]);
      if (foto.length) {
        var f = foto[foto.length - 1];
        doc.file = { fileId: f.fileId, fileUrl: f.fileUrl };
        doc.by = f.by || (row[6] || '').toString();
        doc.at = f.at || (row[7] || '').toString();
      }
    });
  } catch (e) {}
  return out;
}

// Gabungan dokumen 1 WO utk panel di detail WO.
function getWODokumen(noWO) {
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: false, message: 'No WO wajib.' };
    var sheet = _ensureWODokumenSheet(getSpreadsheet());
    var data = sheet.getDataRange().getValues();
    var kontrak = null;
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === noWO && (data[i][1] || '').toString().trim() === 'kontrak') {
        kontrak = { fileId: (data[i][2] || '').toString(), fileUrl: (data[i][3] || '').toString(), fileName: (data[i][4] || '').toString(), by: (data[i][5] || '').toString(), at: (data[i][6] || '').toString() };
        break;
      }
    }
    return { success: true, kontrak: kontrak, qc: _getWOQCDocs(noWO) };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

// ── Data untuk generate Surat Perjanjian Kontrak (dirender jsPDF di frontend) ──
var _WO_HARI   = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
var _WO_BULAN  = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
var _WO_ROMAWI = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

function _woParseTgl(s) {
  var m = (s || '').toString().match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1]);
}

function _woRowByNo(noWO) {
  var sh = getSpreadsheet().getSheetByName('Work_Order');
  if (!sh) return null;
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) { if ((data[i][0] || '').toString().trim() === noWO) return data[i]; }
  return null;
}

// Rekening tujuan dari invoice WO ini — utamakan invoice DP, fallback invoice
// lain. Sumber teks bebas multi-baris (kol 20 Bank Account).
function _woInvoiceBankText(noWO) {
  try {
    var sh = getSpreadsheet().getSheetByName('Invoice_Main');
    if (!sh) return '';
    var data = sh.getDataRange().getValues();
    var dpBank = '', anyBank = '';
    for (var i = 1; i < data.length; i++) {
      if ((data[i][1] || '').toString().trim() !== noWO) continue;
      var bank = (data[i][19] || '').toString().trim();
      if (!bank) continue;
      if ((data[i][4] || '').toString() === 'DP' && !dpBank) dpBank = bank;
      if (!anyBank) anyBank = bank;
    }
    return dpBank || anyBank;
  } catch (e) { return ''; }
}

// Pisahkan teks rekening → {bank, noRek, atasNama}. Coba label dulu (Bank:/
// No Rek:/a.n), lalu posisi (baris1=bank, baris paling banyak digit=no rek,
// sisanya=atas nama). Selalu sertakan raw utk fallback tampilan.
function _woParseBank(t) {
  var raw = (t || '').toString();
  var lines = raw.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(function (x) { return x; });
  var bank = '', noRek = '', atasNama = '';
  lines.forEach(function (l) {
    var low = l.toLowerCase();
    if (/(a\.?n\.?|atas\s*nama)/.test(low)) atasNama = atasNama || l.replace(/.*(a\.?n\.?|atas\s*nama)\s*:?\s*/i, '').trim();
    else if (/(no\.?\s*rek|rekening)/.test(low)) noRek = noRek || l.replace(/.*(no\.?\s*rek(ening)?)\s*:?\s*/i, '').trim();
    else if (/bank/.test(low)) bank = bank || l.replace(/.*bank\s*:?\s*/i, '').trim();
  });
  if (!bank && !noRek && !atasNama && lines.length) {
    bank = lines[0] || '';
    var maxi = -1, maxd = -1;
    lines.forEach(function (l, idx) { var dc = (l.match(/\d/g) || []).length; if (dc > maxd) { maxd = dc; maxi = idx; } });
    if (maxi >= 0 && maxi !== 0) noRek = lines[maxi];
    atasNama = lines.filter(function (l, idx) { return idx !== 0 && idx !== maxi; }).join(' ');
  }
  return { bank: bank, noRek: noRek, atasNama: atasNama, raw: raw };
}

function getKontrakData(noWO) {
  try {
    noWO = (noWO || '').toString().trim();
    if (!noWO) return { success: false, message: 'No WO wajib.' };
    var row = _woRowByNo(noWO);
    if (!row) return { success: false, message: 'Work Order tidak ditemukan.' };

    var namaProject = (row[5] || '').toString();
    var klienId = (row[6] || '').toString();
    var namaKlien = (row[7] || '').toString();
    var nilaiKontrak = parseFloat(row[9]) || 0;   // Subtotal = DPP (exclude PPN)
    var tc = {}; try { tc = JSON.parse(row[16] || '{}'); } catch (e) {}
    var k = tc.kontrak || {};
    var d = _woParseTgl((row[19] || '').toString()) || new Date();  // Tanggal Deal

    var alamat = '';
    try { (getCustomerList() || []).forEach(function (c) { if (c.id === klienId) alamat = c.alamat || ''; }); } catch (e) {}

    var digits = (noWO.match(/\d/g) || []).join('');
    var seq = digits.length >= 3 ? digits.slice(-3) : (digits || noWO);
    var spk = seq + '/RGI/SPK/' + (_WO_ROMAWI[d.getMonth() + 1] || '') + '/' + d.getFullYear();

    return {
      success: true,
      noWO: noWO, namaProject: namaProject, spkNomor: spk,
      klien: { nama: namaKlien, alamat: alamat },
      nilaiKontrak: nilaiKontrak,
      tanggal: { hari: _WO_HARI[d.getDay()], tgl: d.getDate(), bulan: _WO_BULAN[d.getMonth()], tahun: d.getFullYear() },
      termin: { dp: Number(k.terminDP) || 0, termin: Number(k.terminTermin) || 0, pelunasan: Number(k.terminPelunasan) || 0 },
      leadTimeHari: Number(k.leadTimeHari) || 0,
      garansi: {
        instalasi: Number(k.garansiInstalasi) || 0, panel: Number(k.garansiPanel) || 0,
        inverter: Number(k.garansiInverter) || 0, baterai: Number(k.garansiBaterai) || 0
      },
      rekening: _woParseBank(_woInvoiceBankText(noWO))
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}
