/**
 * Settings.gs — Master data untuk Syarat & Ketentuan dan Bank Account
 * Disimpan di Script Properties:
 *   TC_OPTIONS    : JSON { material_status:[], dp_status:[], term_pay:[], final_pay:[],
 *                          delivery_time:[], delivery_cond:[], warranty:[], bonus:[] }
 *   BANK_ACCOUNTS : JSON [ { id, label, detail }, ... ]
 */

var _TC_FIELDS = [
  { key: 'material_status', label: 'Status Material' },
  { key: 'dp_status',       label: 'Down Payment' },
  { key: 'term_pay',        label: 'Term 2 Payment' },
  { key: 'final_pay',       label: 'Final Payment' },
  { key: 'delivery_time',   label: 'Pengiriman' },
  { key: 'delivery_cond',   label: 'Kondisi Pengiriman' },
  { key: 'warranty',        label: 'Garansi Material' },
  { key: 'bonus',           label: 'Paket Bonus' }
];

var _TC_DEFAULTS = {
  material_status: ['Ready Stock', 'Indent', '-'],
  dp_status:       ['30% From PO', '50% From PO', 'Cover GIRO 30 days', '-'],
  term_pay:        ['50% Material On Site', '50% Before Shipping', '-'],
  final_pay:       ['After BAST', '100% Before Shipping', '70% Before Shipping', '-'],
  delivery_time:   ['10-14 Days After PO', '4-6 Weeks After PO', '-'],
  delivery_cond:   ['Franco SBY/JKT', 'DDP Site', '-'],
  warranty:        ['Back to Back from Manufacture', 'Exclude', '-'],
  bonus:           ['-', 'Free Packing', 'Free Shipping Cost']
};

// ── TC Options ───────────────────────────────────────────────────────────────

function getTCOptions() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('TC_OPTIONS');
    var opts = raw ? JSON.parse(raw) : _TC_DEFAULTS;
    // Pastikan semua field ada
    _TC_FIELDS.forEach(function(f) {
      if (!opts[f.key]) opts[f.key] = _TC_DEFAULTS[f.key] || ['-'];
    });
    return { success: true, fields: _TC_FIELDS, options: opts };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

function saveTCOptions(payload) {
  try {
    PropertiesService.getScriptProperties().setProperty('TC_OPTIONS', JSON.stringify(payload));
    return { success: true, message: 'Syarat & Ketentuan berhasil disimpan.' };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

// ── Bank Accounts ─────────────────────────────────────────────────────────────

function getBankAccounts() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('BANK_ACCOUNTS');
    var list = raw ? JSON.parse(raw) : [
      { id: '1', label: 'Bank BSI', detail: 'Bank BSI 7336418717\nA/N. PT. Renus Global Indonesia' }
    ];
    return { success: true, accounts: list };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

function saveBankAccounts(payload) {
  try {
    PropertiesService.getScriptProperties().setProperty('BANK_ACCOUNTS', JSON.stringify(payload));
    return { success: true, message: 'Bank Account berhasil disimpan.' };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

// ── Akun Pembayaran (untuk Purchase Order) ───────────────────────────────────

function _ensureAkunPembayaranSheet(ss) {
  ss = ss || getSpreadsheet();
  var sheet = ss.getSheetByName('Akun_Pembayaran');
  if (!sheet) {
    sheet = ss.insertSheet('Akun_Pembayaran');
    sheet.appendRow(['ID', 'Nama Akun', 'Tipe', 'Keterangan', 'Status', 'Dibuat Oleh', 'Dibuat Pada']);
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
    // Seed akun Stok terkunci
    var when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    sheet.appendRow(['AP001', 'Stok', 'Stok', 'Akun stok default (terkunci)', 'Aktif', 'System', when]);
  }
  return sheet;
}

function getAkunPembayaranList() {
  try {
    var ss    = getSpreadsheet();
    var sheet = _ensureAkunPembayaranSheet(ss);
    var data  = sheet.getDataRange().getValues();
    var list  = [];
    for (var i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      list.push({
        id:         data[i][0].toString(),
        namaAkun:   data[i][1].toString(),
        tipe:       data[i][2].toString(),
        keterangan: data[i][3].toString(),
        status:     data[i][4].toString(),
        dibuatOleh: data[i][5].toString(),
        dibuatPada: _fmtTgl(data[i][6]),
        locked:     data[i][0].toString() === 'AP001'
      });
    }
    return { success: true, list: list };
  } catch(e) {
    return { success: false, message: e.toString(), list: [] };
  }
}

function simpanAkunPembayaran(payload) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    if (!payload.namaAkun) return { success: false, message: 'Nama akun wajib diisi.' };
    var ss    = getSpreadsheet();
    var sheet = _ensureAkunPembayaranSheet(ss);
    SpreadsheetApp.flush();

    var lastRow = sheet.getLastRow();
    var maxNum  = 0;
    if (lastRow > 1) {
      var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        var m = (ids[i][0] || '').toString().match(/^AP(\d+)/i);
        if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
      }
    }
    var newId = 'AP' + ('000' + (maxNum + 1)).slice(-3);
    var when  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    sheet.appendRow([newId, payload.namaAkun, payload.tipe || 'Bank', payload.keterangan || '', 'Aktif', payload.dibuatOleh || '', when]);
    SpreadsheetApp.flush();
    return { success: true, message: 'Akun ' + newId + ' berhasil ditambahkan.', newId: newId };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

function editAkunPembayaran(payload) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    if (payload.id === 'AP001') return { success: false, message: 'Akun Stok default tidak bisa diubah.' };
    var sheet = getSpreadsheet().getSheetByName('Akun_Pembayaran');
    if (!sheet) return { success: false, message: 'Sheet tidak ditemukan.' };
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0].toString() === payload.id.toString()) {
        sheet.getRange(i + 1, 2, 1, 4).setValues([[payload.namaAkun, payload.tipe || 'Bank', payload.keterangan || '', payload.status || 'Aktif']]);
        SpreadsheetApp.flush();
        return { success: true, message: 'Akun berhasil diperbarui.' };
      }
    }
    return { success: false, message: 'ID akun tidak ditemukan.' };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

function hapusAkunPembayaran(id) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    if (id === 'AP001') return { success: false, message: 'Akun Stok default tidak bisa dihapus.' };
    // Cek referensi di Pembayaran_PO
    var poSheet = getSpreadsheet().getSheetByName('Pembayaran_PO');
    if (poSheet && poSheet.getLastRow() > 1) {
      var poData = poSheet.getRange(2, 4, poSheet.getLastRow() - 1, 1).getValues();
      for (var j = 0; j < poData.length; j++) {
        if (poData[j][0].toString() === id.toString())
          return { success: false, message: 'Akun sudah digunakan di riwayat pembayaran PO.' };
      }
    }
    var sheet = getSpreadsheet().getSheetByName('Akun_Pembayaran');
    if (!sheet) return { success: false, message: 'Sheet tidak ditemukan.' };
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0].toString() === id.toString()) {
        sheet.deleteRow(i + 1);
        SpreadsheetApp.flush();
        return { success: true, message: 'Akun berhasil dihapus.' };
      }
    }
    return { success: false, message: 'ID akun tidak ditemukan.' };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}
