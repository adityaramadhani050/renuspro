/** Utilitas form: pembacaan nilai, validasi, dan penerjemahan error database. */

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

export const EMPTY_FORM_STATE: FormState = {};

export function getText(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Angka dari input.
 *
 * Pengguna terbiasa mengetik "2.500.000" — sistem lama pun menerimanya lewat
 * pN() di JS_Form_Penawaran.html. Menolaknya di sini akan terasa seperti
 * kemunduran, jadi format Indonesia tetap diterima.
 */
export function getNumber(fd: FormData, name: string): number | null {
  let s = getText(fd, name).replace(/[Rp\s]/gi, '');
  if (!s) return 0;

  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Terjemahkan error PostgREST menjadi kalimat yang berguna.
 *
 * Yang paling penting adalah kode 42501 — RLS menolak. Menampilkan pesan mentah
 * ("new row violates row-level security policy") hanya membingungkan; yang perlu
 * diketahui pengguna adalah bahwa perannya tidak berwenang.
 */
export function describeDbError(error: { code?: string; message: string }): string {
  switch (error.code) {
    case '42501':
      return 'Anda tidak punya wewenang untuk melakukan tindakan ini.';
    case '23505':
      return 'Data dengan kode/nama tersebut sudah ada.';
    case '23503':
      return 'Data ini masih dipakai oleh dokumen lain, sehingga tidak bisa dihapus.';
    case '23514':
      return 'Nilai yang dimasukkan tidak memenuhi aturan validasi sistem.';
    default:
      return error.message;
  }
}
