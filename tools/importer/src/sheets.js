/**
 * Pembaca Google Sheets.
 *
 * Dibaca dengan UNFORMATTED_VALUE + SERIAL_NUMBER supaya angka datang sebagai
 * angka asli (bukan "2.500.000" hasil format lokal Indonesia) dan tanggal
 * sebagai serial. Kombinasi lain akan memaksa parser menebak-nebak.
 */
import { google } from 'googleapis';
import { config } from './config.js';

export async function createSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: config.googleCredentialsPath(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth: await auth.getClient() });
}

/**
 * Baca satu sheet secara utuh.
 * Mengembalikan { header: string[], rows: any[][] } — baris kosong dibuang.
 */
export async function readSheet(client, sheetName) {
  let res;
  try {
    res = await client.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId(),
      range: sheetName,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'SERIAL_NUMBER',
    });
  } catch (err) {
    // Sheet opsional (mis. WorkOrder_Catatan) mungkin memang belum pernah
    // dibuat — itu bukan kesalahan.
    if (err?.code === 400 || err?.status === 400) {
      return { header: [], rows: [], missing: true };
    }
    throw err;
  }

  const values = res.data.values || [];
  if (values.length === 0) return { header: [], rows: [], missing: false };

  const [header, ...rest] = values;
  const rows = rest.filter((r) => r.some((c) => c !== '' && c !== null && c !== undefined));

  return { header: header.map((h) => String(h).trim()), rows, missing: false };
}

/** Baca semua sheet yang dibutuhkan importer sekaligus. */
export async function readAllSheets(client) {
  const names = config.sheets;
  const entries = await Promise.all(
    Object.entries(names).map(async ([key, sheetName]) => [
      key,
      { ...(await readSheet(client, sheetName)), sheetName },
    ])
  );
  return Object.fromEntries(entries);
}
