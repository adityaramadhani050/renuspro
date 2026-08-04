/** Konfigurasi importer — semuanya dari environment, tidak ada yang di-hardcode. */

function required(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Environment variable ${name} belum di-set. Salin .env.example menjadi .env lalu isi.`
    );
  }
  return v;
}

export const config = {
  // Koneksi langsung ke Postgres Supabase (bukan PostgREST): importer harus
  // bisa menonaktifkan trigger dan melewati RLS, jadi pakai connection string
  // milik service role / user postgres.
  databaseUrl: () => required('DATABASE_URL'),

  // ID spreadsheet sumber (ada di URL Google Sheets).
  spreadsheetId: () => required('SHEET_ID'),

  // Service account JSON untuk Google Sheets API, akses read-only sudah cukup.
  googleCredentialsPath: () => required('GOOGLE_APPLICATION_CREDENTIALS'),

  // Domain default untuk menurunkan email dari username Master_User, yang
  // tidak punya kolom email. Bisa ditimpa per user lewat users.csv.
  authEmailDomain: process.env.AUTH_EMAIL_DOMAIN || null,

  // Endpoint & kunci Supabase, hanya dipakai kalau --create-auth-users aktif.
  supabaseUrl: process.env.SUPABASE_URL || null,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || null,

  // Nama sheet — diambil dari kode GAS, ubah di sini kalau berbeda.
  sheets: {
    user: 'Master_User',
    customer: 'Master_Klien',
    product: 'Master_Produk',
    template: 'Template_Paket',
    quotation: 'Penawaran_Main',
    woNotes: 'WorkOrder_Catatan',
    invoiceRequest: 'WO_RequestInvoice',
    invoice: 'Invoice_Main',
    receipt: 'Kwitansi_Main',
  },
};
