/**
 * Konversi nilai mentah dari Google Sheets menjadi tipe Postgres.
 *
 * Bagian ini paling rawan salah diam-diam, karena satu sel yang sama bisa
 * datang dalam tiga bentuk berbeda tergantung bagaimana GAS menulisnya:
 *
 *   • Angka serial   — sel bertipe tanggal asli (Sheets menyimpan hari sejak
 *                      1899-12-30), muncul saat dibaca UNFORMATTED_VALUE
 *   • "dd/MM/yyyy"   — GAS menulis string lewat Utilities.formatDate(),
 *                      mis. Penawaran.gs:67, Invoice.gs:449, WorkOrder.gs:305
 *   • ""             — sel kosong
 *
 * Karena itu semua parser di sini bersifat toleran dan mengembalikan null
 * (bukan melempar) untuk nilai yang tidak dikenali — kegagalan dilaporkan
 * lewat laporan rekonsiliasi, bukan dengan menghentikan impor di tengah.
 */

// Sheets menghitung hari sejak 1899-12-30 (bukan 1900-01-01 — ada bug tahun
// kabisat 1900 yang diwarisi dari Lotus 1-2-3 dan dipertahankan Excel).
const SHEETS_EPOCH_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86400000;

/** Tanggal → 'YYYY-MM-DD' (tipe date Postgres), atau null. */
export function parseDate(raw) {
  if (raw === null || raw === undefined || raw === '') return null;

  // Bentuk 1: angka serial Sheets
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw <= 0) return null;
    const ms = SHEETS_EPOCH_MS + Math.floor(raw) * MS_PER_DAY;
    return new Date(ms).toISOString().slice(0, 10);
  }

  const s = String(raw).trim();
  if (!s) return null;

  // Bentuk 2: dd/MM/yyyy — format yang dipakai seluruh kode GAS.
  // PENTING: harus dibaca sebagai hari/bulan/tahun, bukan bulan/hari.
  // Salah urutan di sini menghasilkan data yang terlihat wajar tapi salah,
  // dan baru ketahuan berbulan-bulan kemudian.
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{2})?$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const day = Number(d);
    const month = Number(m);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Bentuk 3: ISO atau apa pun yang dimengerti Date
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  return null;
}

/** Tanggal + jam → ISO timestamp, atau null. Dipakai untuk 'Diupdate Pada'. */
export function parseTimestamp(raw) {
  if (raw === null || raw === undefined || raw === '') return null;

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw <= 0) return null;
    return new Date(SHEETS_EPOCH_MS + raw * MS_PER_DAY).toISOString();
  }

  const s = String(raw).trim();
  // 'dd/MM/yyyy HH:mm' — format WorkOrder.gs:305 & requestInvoice
  const dmyhm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (dmyhm) {
    const [, d, m, y, hh, mm] = dmyhm;
    return new Date(Date.UTC(+y, +m - 1, +d, +hh, +mm)).toISOString();
  }

  const dateOnly = parseDate(raw);
  return dateOnly ? `${dateOnly}T00:00:00.000Z` : null;
}

/**
 * Angka. Menangani angka asli maupun string berformat Indonesia
 * ("2.500.000" atau "2.500.000,50") yang bisa muncul kalau sel pernah
 * disunting manual sebagai teks.
 */
export function parseNumber(raw, fallback = 0) {
  if (raw === null || raw === undefined || raw === '') return fallback;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : fallback;

  let s = String(raw).trim();
  if (!s) return fallback;

  s = s.replace(/[Rp\s]/gi, '');

  // Format Indonesia: titik = pemisah ribuan, koma = desimal.
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    // Hanya perlakukan titik sebagai pemisah ribuan kalau polanya memang
    // berkelompok tiga digit. "1.5" tetap dibaca satu koma lima.
    s = s.replace(/\./g, '');
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

/** Teks yang sudah di-trim, atau null kalau kosong. */
export function parseText(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s === '' ? null : s;
}

/** Boolean dari 'TRUE'/'FALSE' (Auth.gs:58 menyimpannya sebagai teks). */
export function parseBool(raw, fallback = true) {
  if (raw === null || raw === undefined || raw === '') return fallback;
  if (typeof raw === 'boolean') return raw;
  const s = String(raw).trim().toUpperCase();
  if (s === 'TRUE' || s === 'YA' || s === '1') return true;
  if (s === 'FALSE' || s === 'TIDAK' || s === '0') return false;
  return fallback;
}

/** JSON yang mungkin rusak → nilai default, tanpa melempar. */
export function parseJson(raw, fallback) {
  const s = parseText(raw);
  if (!s) return fallback;
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

/**
 * Rincian Item penawaran (Penawaran_Main kolom 16).
 *
 * Struktur aslinya BUKAN array datar melainkan daftar kelompok —
 * lihat JS_Form_Penawaran.html:350-352:
 *
 *   [{ kelompok: "A", namaKelompok: "...", subtotal: n,
 *      subItems: [{ noItem, produkId, deskripsi, qty, unit, harga, hpp, total }] }]
 *
 * Beberapa penawaran lama mungkin masih menyimpan array datar (sebelum fitur
 * sub-paket ada). Keduanya ditangani: array datar dibungkus menjadi satu
 * kelompok tanpa nama, sehingga tidak ada data yang hilang.
 */
export function parseQuotationItems(raw) {
  const parsed = parseJson(raw, []);
  if (!Array.isArray(parsed) || parsed.length === 0) return [];

  const isGrouped = parsed.some(
    (el) => el && typeof el === 'object' && Array.isArray(el.subItems)
  );

  if (!isGrouped) {
    return [
      {
        code: null,
        name: '',
        subtotal: parsed.reduce((sum, it) => sum + parseNumber(it?.total), 0),
        sortOrder: 0,
        items: parsed.map(normalizeItem),
      },
    ];
  }

  return parsed.map((group, gi) => ({
    code: parseText(group?.kelompok),
    name: parseText(group?.namaKelompok) ?? '',
    subtotal: parseNumber(group?.subtotal),
    sortOrder: gi,
    items: (Array.isArray(group?.subItems) ? group.subItems : []).map(normalizeItem),
  }));
}

function normalizeItem(item, index) {
  const qty = parseNumber(item?.qty);
  const price = parseNumber(item?.harga);
  return {
    productLegacyCode: parseText(item?.produkId),
    description: parseText(item?.deskripsi) ?? '',
    qty,
    unit: parseText(item?.unit) ?? 'unit',
    price,
    cost: parseNumber(item?.hpp),
    // Sebagian baris lama tidak menyimpan 'total'; dihitung ulang agar
    // laporan tidak menganggapnya nol.
    lineTotal: item?.total === undefined ? qty * price : parseNumber(item.total),
    sortOrder: parseNumber(item?.noItem, index + 1),
  };
}

/** Item template paket — di sini JSON-nya memang array datar. */
export function parseTemplateItems(raw) {
  const parsed = parseJson(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeItem);
}

/**
 * Nomor urut dari nomor dokumen, untuk menyemai document_counters.
 * Regex-nya sengaja dibuat sama persis dengan yang dipakai GAS, termasuk
 * varian lama '/RGI-INV' dan '/RGI-KW' (Invoice.gs:61, Kwitansi.gs:41).
 */
export const DOC_NUMBER_PATTERNS = {
  quotation: /^(\d+)\/QUOT/,
  invoice: /^(\d+)\/RGI(?:-INV|\/INV)/,
  receipt: /^(\d+)\/RGI(?:-KW|\/KWT)/,
};

export function extractDocSeq(kind, value) {
  const s = parseText(value);
  if (!s) return null;
  const m = s.match(DOC_NUMBER_PATTERNS[kind]);
  return m ? Number.parseInt(m[1], 10) : null;
}

/**
 * No WO berformat [YY][NNN] (WorkOrder.gs:17).
 * WorkOrder.gs:333 menuliskannya dengan setValue(Number(noWO)) sehingga di
 * sheet ia tersimpan sebagai ANGKA — karena itu perlu di-cast hati-hati.
 */
export function parseWoNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw).trim();
  if (!/^\d{5,}$/.test(s)) return null;
  return s;
}

export function splitWoNumber(woNumber) {
  if (!woNumber) return null;
  const yy = woNumber.slice(0, 2);
  const seq = Number.parseInt(woNumber.slice(2), 10);
  if (Number.isNaN(seq)) return null;
  // '26' → 2026. Sistem ini baru, tidak ada dokumen abad ke-20.
  return { year: 2000 + Number.parseInt(yy, 10), seq };
}
