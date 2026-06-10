/**
 * RenusPro - PT. RENUS GLOBAL INDONESIA
 * Sistem Login & Manajemen User (sheet Master_User).
 */

// ============================================================
// SISTEM LOGIN & MANAJEMEN USER
// ============================================================

// ── Helper: buat / ambil sheet Master_User ────────────────────────────────
function _getOrCreateMasterUser(ss) {
  ss = ss || getSpreadsheet();
  let sheet = ss.getSheetByName('Master_User');
  if (!sheet) {
    sheet = ss.insertSheet('Master_User');
    // Header
    sheet.appendRow(['ID', 'Nama Lengkap', 'Username', 'Password', 'Role', 'Aktif', 'Target Bulanan', 'Lead_ID']);
    // Format header
    sheet.getRange(1, 1, 1, 8)
      .setBackground('#1e3a8a')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, 8, [60, 160, 120, 120, 80, 60, 100, 80]);

    // Seed: 1 admin default
    sheet.appendRow(['U001', 'Administrator', 'admin', 'admin123', 'admin', 'TRUE']);
    // Seed: contoh sales
    sheet.appendRow(['U002', 'Sales Executive', 'sales1', 'sales123', 'sales', 'TRUE']);
    // Seed: contoh finance
    sheet.appendRow(['U003', 'Finance Officer', 'finance1', 'finance123', 'finance', 'TRUE']);
  }
  return sheet;
}

// ── Login: verifikasi username + password ─────────────────────────────────
function loginUser(username, password) {
  try {
    if (!username || !password) {
      return { success: false, message: 'Username dan password wajib diisi.' };
    }
    
    // Gunakan getSpreadsheet() yang sudah ada — akan berjalan sebagai PEMILIK script
    // karena deploy "Execute as: Me"
    const sheet = _getOrCreateMasterUser();
    SpreadsheetApp.flush();
    const data = sheet.getDataRange().getValues();

    const uname = username.toString().trim().toLowerCase();
    const pass  = password.toString().trim();

    for (let i = 1; i < data.length; i++) {
      const rowId    = data[i][0] ? data[i][0].toString().trim() : '';
      const rowNama  = data[i][1] ? data[i][1].toString().trim() : '';
      const rowUser  = data[i][2] ? data[i][2].toString().trim().toLowerCase() : '';
      const rowPass  = data[i][3] ? data[i][3].toString().trim() : '';
      const rowRole  = data[i][4] ? data[i][4].toString().trim().toLowerCase() : 'sales';
      const rowAktif = data[i][5] ? data[i][5].toString().trim().toUpperCase() : 'TRUE';
      const rowLeadId = data[i][7] ? data[i][7].toString().trim() : '';

      if (rowUser === uname && rowPass === pass) {
        if (rowAktif === 'FALSE') {
          return { success: false, message: 'Akun ini tidak aktif. Hubungi administrator.' };
        }
        return {
          success: true,
          user: { id: rowId, nama: rowNama, username: rowUser, role: rowRole, leadId: rowLeadId },
          message: 'Selamat datang, ' + rowNama + '!'
        };
      }
    }
    return { success: false, message: 'Username atau password salah.' };

  } catch(e) {
    Logger.log('loginUser error: ' + e.toString());
    // Jangan expose detail error teknis ke client
    return { success: false, message: 'Terjadi kesalahan server. Coba beberapa saat lagi.' };
  }
}

// ── Get daftar user (admin only) ──────────────────────────────────────────
function getUserList() {
  try {
    const sheet = _getOrCreateMasterUser();
    const data  = sheet.getDataRange().getValues();
    const list  = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      list.push({
        id:            data[i][0].toString(),
        nama:          data[i][1].toString(),
        username:      data[i][2].toString(),
        // Password sengaja tidak dikirim ke client
        role:          data[i][4].toString(),
        aktif:         data[i][5].toString().toUpperCase() !== 'FALSE',
        targetBulanan: parseFloat(data[i][6]) || 0,
        leadId:        data[i][7] ? data[i][7].toString().trim() : ''
      });
    }
    return list;
  } catch(e) { return []; }
}

// ── Tambah user baru (admin only) ─────────────────────────────────────────
function simpanUser(nama, username, password, role, leadId) {
  try {
    if (!nama || !username || !password || !role) {
      return { success: false, message: 'Semua field wajib diisi.' };
    }
    const sheet = _getOrCreateMasterUser();
    SpreadsheetApp.flush();
    const data = sheet.getDataRange().getValues();

    // Cek duplikat username
    for (let i = 1; i < data.length; i++) {
      if (data[i][2] && data[i][2].toString().trim().toLowerCase() === username.trim().toLowerCase()) {
        return { success: false, message: 'Username "' + username + '" sudah digunakan.' };
      }
    }

    // Generate ID
    let maxNum = 0;
    for (let i = 1; i < data.length; i++) {
      const m = data[i][0] ? data[i][0].toString().match(/^U(\d+)/i) : null;
      if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
    }
    const nextId = 'U' + String(maxNum + 1).padStart(3, '0');

    sheet.appendRow([nextId, nama, username.trim().toLowerCase(), password, role.toLowerCase(), 'TRUE', 0, (leadId || '')]);
    return { success: true, message: 'User ' + nextId + ' (' + nama + ') berhasil ditambahkan!' };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

// ── Edit user (admin only) ────────────────────────────────────────────────
function editUser(id, nama, username, password, role, aktif, targetBulanan, leadId) {
  try {
    if (!id || !nama || !username || !role) {
      return { success: false, message: 'Data tidak lengkap.' };
    }
    const sheet = _getOrCreateMasterUser();
    const data  = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().trim() === id.toString().trim()) {
        // Cek duplikat username (exclude baris sendiri)
        for (let j = 1; j < data.length; j++) {
          if (j !== i && data[j][2] &&
              data[j][2].toString().trim().toLowerCase() === username.trim().toLowerCase()) {
            return { success: false, message: 'Username "' + username + '" sudah digunakan user lain.' };
          }
        }
        const newPass = (password && password.trim()) ? password.trim() : data[i][3].toString();
        sheet.getRange(i + 1, 2, 1, 7).setValues([[
          nama, username.trim().toLowerCase(), newPass,
          role.toLowerCase(), aktif ? 'TRUE' : 'FALSE',
          parseFloat(targetBulanan) || 0, (leadId || '')
        ]]);
        return { success: true, message: 'User ' + id + ' berhasil diperbarui!' };
      }
    }
    return { success: false, message: 'User tidak ditemukan.' };
  } catch(e) { return { success: false, message: e.toString() }; }
}

// ── Hapus user (admin only) ───────────────────────────────────────────────
function hapusUser(id) {
  try {
    const sheet = _getOrCreateMasterUser();
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().trim() === id.toString().trim()) {
        sheet.deleteRow(i + 1);
        return { success: true, message: 'User ' + id + ' berhasil dihapus.' };
      }
    }
    return { success: false, message: 'User tidak ditemukan.' };
  } catch(e) { return { success: false, message: e.toString() }; }
}

// ── Get team members for a Lead Sales ─────────────────────────────────────
function getLeadSalesTeam(leadId) {
  try {
    var sheet = _getOrCreateMasterUser();
    var data = sheet.getDataRange().getValues();
    var names = [];
    for (var i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      var rowLeadId = data[i][7] ? data[i][7].toString().trim() : '';
      var rowAktif  = data[i][5] ? data[i][5].toString().toUpperCase() : 'TRUE';
      if (rowLeadId === leadId && rowAktif !== 'FALSE') {
        names.push(data[i][1].toString().trim()); // Nama Lengkap
      }
    }
    return { success: true, names: names };
  } catch(e) { return { success: false, names: [] }; }
}

// ── Ganti password (self-service) ─────────────────────────────────────────
function gantiPassword(userId, passwordLama, passwordBaru) {
  try {
    if (!passwordLama || !passwordBaru) {
      return { success: false, message: 'Password lama dan baru wajib diisi.' };
    }
    if (passwordBaru.length < 6) {
      return { success: false, message: 'Password baru minimal 6 karakter.' };
    }
    const sheet = _getOrCreateMasterUser();
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().trim() === userId.toString().trim()) {
        if (data[i][3].toString().trim() !== passwordLama.trim()) {
          return { success: false, message: 'Password lama tidak sesuai.' };
        }
        sheet.getRange(i + 1, 4).setValue(passwordBaru.trim());
        return { success: true, message: 'Password berhasil diubah!' };
      }
    }
    return { success: false, message: 'User tidak ditemukan.' };
  } catch(e) { return { success: false, message: e.toString() }; }
}
