/**
 * Rekonsiliasi Sheets vs Postgres.
 *
 * Ini satu-satunya bukti bahwa impor benar. Jumlah baris saja tidak cukup —
 * baris bisa lengkap tapi nilainya salah baca (angka berformat Indonesia,
 * tanggal tertukar hari/bulan). Karena itu yang dibandingkan juga TOTAL NILAI:
 * kalau ada satu angka yang salah parse, jumlahnya tidak akan cocok.
 */
import { parseNumber, parseText, parseWoNumber } from './parse.js';

const IDR_TOLERANCE = 1; // toleransi pembulatan 1 rupiah

export async function reconcile(client, sheets, report) {
  // ── Klien ──
  // Dibandingkan hanya terhadap klien yang MEMANG berasal dari sheet. Importer
  // juga membuat baris pengganti untuk klien yang dirujuk penawaran tapi sudah
  // dihapus dari master; menghitungnya di sini akan memunculkan selisih yang
  // sebenarnya adalah perilaku yang diinginkan.
  const sheetCustomerCodes = (sheets.customer.rows || [])
    .map((r) => parseText(r[0]))
    .filter(Boolean);

  const { rows: [cust] } = await client.query(
    'select count(*)::int as n from customers where legacy_code = any($1)',
    [sheetCustomerCodes]
  );
  const { rows: [extra] } = await client.query(
    'select count(*)::int as n from customers where legacy_code <> all($1)',
    [sheetCustomerCodes]
  );

  report.addReconciliation({
    label: 'Jumlah klien (dari Master_Klien)',
    sheet: sheetCustomerCodes.length,
    db: cust.n,
    ok: cust.n === sheetCustomerCodes.length,
    note: extra.n
      ? `di luar ini ada ${extra.n} klien pengganti, dibuat untuk penawaran ` +
        'yang merujuk klien yang sudah dihapus dari master'
      : undefined,
  });

  await compareCount(client, report, 'Jumlah produk', 'products', countRows(sheets.product, 0));

  // ── Penawaran: jumlah unik + jumlah revisi ──
  const sheetQuotes = new Set(
    sheets.quotation.rows.map((r) => parseText(r[0])).filter(Boolean)
  );
  await compareCount(
    client, report, 'Jumlah penawaran (unik)', 'quotations', sheetQuotes.size,
    undefined,
    () => diffQuotations(client, sheets, sheetQuotes)
  );

  // Yang dibandingkan pasangan (No Penawaran, Rev) yang UNIK, bukan jumlah
  // baris. Dua baris dengan pasangan yang sama memang menyatu menjadi satu
  // revisi — itu benar, dan tidak boleh dilaporkan sebagai data hilang.
  // Kejadiannya sendiri tetap dilaporkan lewat peringatan revisi_ganda.
  const sheetRevisions = new Set(
    (sheets.quotation.rows || [])
      .filter((r) => parseText(r[0]))
      .map((r) => `${parseText(r[0])}#${Math.trunc(parseNumber(r[1]))}`)
  );
  const duplicateRevRows = countRows(sheets.quotation, 0) - sheetRevisions.size;

  await compareCount(
    client,
    report,
    'Jumlah revisi penawaran (pasangan No+Rev unik)',
    'quotation_revisions',
    sheetRevisions.size,
    undefined,
    () => diffRevisions(client, sheetRevisions)
  );

  if (duplicateRevRows > 0) {
    report.warn(
      'revisi_ganda_ringkasan',
      `${duplicateRevRows} baris Penawaran_Main punya pasangan (No Penawaran, Rev) ` +
        'yang sama dengan baris lain, sehingga menyatu menjadi satu revisi'
    );
  }

  // ── Nilai penawaran: hanya revisi TERTINGGI tiap nomor, karena itulah yang
  //    dipakai seluruh laporan. Menjumlahkan semua revisi akan menggandakan.
  const sheetGrandTotal = sumLatestRevision(sheets.quotation, 10);
  const { rows: [q] } = await client.query(
    `select coalesce(sum(r.grand_total), 0) as total
       from quotations q
       join quotation_revisions r on r.id = q.current_revision_id`
  );
  compareAmount(report, 'Total grand total penawaran (revisi terkini)', sheetGrandTotal, q.total);

  // ── Work Order ──
  const sheetWoCount = new Set(
    sheets.quotation.rows.map((r) => parseWoNumber(r[17])).filter(Boolean)
  ).size;
  await compareCount(client, report, 'Jumlah Work Order', 'work_orders', sheetWoCount);

  // ── Invoice ──
  // Invoice yang rujukannya tidak ditemukan kini tetap diimpor sebagai
  // warisan, jadi jumlahnya harus cocok. Kalau ternyata TIDAK cocok, itu
  // masalah baru — bukan lagi hal yang sudah diketahui sebabnya.
  const legacyInvoices = report.counts.get('invoices_warisan') ?? 0;
  const skippedValue = report.skippedTotal('invoices');
  const invoiceNote =
    'Seluruh invoice seharusnya terimpor, termasuk yang berstatus warisan. ' +
    'Selisih di sini berarti ada penyebab lain.';

  await compareCount(
    client, report, 'Jumlah invoice', 'invoices',
    countRows(sheets.invoice, 0), invoiceNote
  );

  const sheetInvoiceTotal = sumColumn(sheets.invoice, 14);
  const { rows: [i] } = await client.query('select coalesce(sum(total), 0) as total from invoices');
  compareAmount(
    report, 'Total nilai invoice', sheetInvoiceTotal, i.total,
    skippedValue
      ? `Rp ${skippedValue.toLocaleString('id-ID')} berasal dari invoice yang dilewati`
      : undefined
  );

  // Informasi, bukan kegagalan: invoice warisan memang terimpor utuh, tapi
  // keberadaannya perlu diketahui karena tautannya ke penawaran hilang.
  if (legacyInvoices) {
    report.addReconciliation({
      label: 'Invoice warisan (rujukan penawaran tidak ditemukan)',
      sheet: legacyInvoices,
      db: legacyInvoices,
      ok: true,
      note: 'terimpor utuh; tautan ke penawaran hilang, rujukan aslinya ' +
            'tersimpan di kolom legacy_reference',
    });
  }

  const sheetInvoiceDpp = sumColumn(sheets.invoice, 11);
  const { rows: [d] } = await client.query('select coalesce(sum(dpp), 0) as total from invoices');
  compareAmount(report, 'Total DPP invoice', sheetInvoiceDpp, d.total);

  // ── Piutang: angka yang paling langsung terasa kalau salah ──
  const sheetOutstanding = sheets.invoice.rows
    .filter((r) => parseText(r[0]) && (parseText(r[16]) || 'Belum Lunas') !== 'Lunas')
    .reduce((s, r) => s + parseNumber(r[14]), 0);
  const { rows: [o] } = await client.query(
    `select coalesce(sum(total), 0) as total from invoices where payment_status <> 'Lunas'`
  );
  compareAmount(report, 'Total piutang (invoice belum lunas)', sheetOutstanding, o.total);

  // ── Kwitansi ──
  await compareCount(client, report, 'Jumlah kwitansi', 'receipts', countRows(sheets.receipt, 0));
  const sheetReceiptTotal = sumColumn(sheets.receipt, 5);
  const { rows: [rc] } = await client.query('select coalesce(sum(amount), 0) as total from receipts');
  compareAmount(report, 'Total nilai kwitansi', sheetReceiptTotal, rc.total);
}

// ── Helper ──────────────────────────────────────────────────────────────────

function countRows(sheet, keyColumn) {
  return (sheet.rows || []).filter((r) => parseText(r[keyColumn])).length;
}

function sumColumn(sheet, columnIndex) {
  return (sheet.rows || [])
    .filter((r) => parseText(r[0]))
    .reduce((sum, r) => sum + parseNumber(r[columnIndex]), 0);
}

/** Jumlahkan sebuah kolom, hanya dari baris dengan Rev tertinggi per nomor. */
function sumLatestRevision(sheet, columnIndex) {
  const latest = new Map();
  for (const row of sheet.rows || []) {
    const no = parseText(row[0]);
    if (!no) continue;
    const rev = parseNumber(row[1]);
    const prev = latest.get(no);
    if (!prev || rev > prev.rev) latest.set(no, { rev, value: parseNumber(row[columnIndex]) });
  }
  return [...latest.values()].reduce((s, x) => s + x.value, 0);
}

async function compareCount(client, report, label, table, sheetCount, note, rincian) {
  const { rows: [r] } = await client.query(`select count(*)::int as n from ${table}`);
  const ok = r.n === sheetCount;

  report.addReconciliation({
    label,
    sheet: sheetCount,
    db: r.n,
    ok,
    note: ok ? undefined : note,
    // Rincian hanya dihitung saat memang ada selisih: menjalankan kueri diff
    // pada setiap impor yang sehat cuma memperlambat tanpa memberi apa pun.
    items: ok || !rincian ? undefined : await rincian(),
  });
}

const BATAS_RINCIAN = 15;

/**
 * Sebutkan penawaran mana yang berbeda antara sheet dan database.
 *
 * Arahnya sengaja dibedakan, karena artinya sangat berbeda:
 *
 * • Ada di sheet, tidak di database — hampir selalu dokumen yang dibuat
 *   SETELAH impor terakhir. Tanggalnya yang membuktikan; karena itu tanggal
 *   ikut dicetak. Ini bukan data hilang, hanya data yang belum ikut.
 *
 * • Ada di database, tidak di sheet — dokumen yang dihapus dari sheet setelah
 *   diimpor, atau dibuat langsung di sistem baru. Yang pertama perlu
 *   diputuskan manusia; yang kedua justru tanda cutover sudah berjalan.
 */
async function diffQuotations(client, sheets, sheetQuotes) {
  const { rows } = await client.query('select quote_number from quotations');
  const dbQuotes = new Set(rows.map((r) => r.quote_number));

  // Tanggal & nilai diambil dari revisi tertinggi, sama seperti yang dipakai
  // seluruh laporan.
  const infoSheet = new Map();
  for (const row of sheets.quotation.rows || []) {
    const no = parseText(row[0]);
    if (!no) continue;
    const rev = parseNumber(row[1]);
    const prev = infoSheet.get(no);
    if (!prev || rev > prev.rev) {
      infoSheet.set(no, { rev, tanggal: parseText(row[2]), total: parseNumber(row[10]) });
    }
  }

  const out = [];

  const belumMasuk = [...sheetQuotes].filter((no) => !dbQuotes.has(no));
  for (const no of belumMasuk.slice(0, BATAS_RINCIAN)) {
    const i = infoSheet.get(no) || {};
    out.push(
      `ada di sheet, belum di database: ${no}  ` +
        `(tanggal ${i.tanggal || '?'}, Rp ${(i.total ?? 0).toLocaleString('id-ID')})`
    );
  }
  if (belumMasuk.length > BATAS_RINCIAN) {
    out.push(`… dan ${belumMasuk.length - BATAS_RINCIAN} lagi`);
  }

  const sudahHilang = [...dbQuotes].filter((no) => !sheetQuotes.has(no));
  for (const no of sudahHilang.slice(0, BATAS_RINCIAN)) {
    out.push(`ada di database, tidak lagi di sheet: ${no}`);
  }
  if (sudahHilang.length > BATAS_RINCIAN) {
    out.push(`… dan ${sudahHilang.length - BATAS_RINCIAN} lagi`);
  }

  if (belumMasuk.length && !sudahHilang.length) {
    out.push(
      'Semuanya searah — sheet lebih baru daripada database. Kalau tanggalnya ' +
        'setelah impor terakhir, jalankan impor ulang lalu rekonsiliasi lagi.'
    );
  }

  return out;
}

/** Sama seperti di atas, tapi pada tingkat revisi (pasangan No + Rev). */
async function diffRevisions(client, sheetRevisions) {
  const { rows } = await client.query(
    `select q.quote_number, r.rev
       from quotation_revisions r
       join quotations q on q.id = r.quotation_id`
  );
  const dbRevisions = new Set(rows.map((r) => `${r.quote_number}#${r.rev}`));

  const out = [];

  const belumMasuk = [...sheetRevisions].filter((k) => !dbRevisions.has(k));
  for (const k of belumMasuk.slice(0, BATAS_RINCIAN)) {
    const [no, rev] = k.split('#');
    out.push(`ada di sheet, belum di database: ${no} Rev ${rev}`);
  }
  if (belumMasuk.length > BATAS_RINCIAN) {
    out.push(`… dan ${belumMasuk.length - BATAS_RINCIAN} lagi`);
  }

  const sudahHilang = [...dbRevisions].filter((k) => !sheetRevisions.has(k));
  for (const k of sudahHilang.slice(0, BATAS_RINCIAN)) {
    const [no, rev] = k.split('#');
    out.push(`ada di database, tidak lagi di sheet: ${no} Rev ${rev}`);
  }
  if (sudahHilang.length > BATAS_RINCIAN) {
    out.push(`… dan ${sudahHilang.length - BATAS_RINCIAN} lagi`);
  }

  return out;
}

function compareAmount(report, label, sheetTotal, dbTotal, note) {
  const ok = Math.abs(dbTotal - sheetTotal) <= IDR_TOLERANCE;
  report.addReconciliation({
    label,
    sheet: sheetTotal,
    db: dbTotal,
    ok,
    note: ok ? undefined : note,
  });
}
