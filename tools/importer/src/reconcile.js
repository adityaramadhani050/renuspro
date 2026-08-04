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
  // ── Jumlah baris master ──
  await compareCount(client, report, 'Jumlah klien', 'customers', countRows(sheets.customer, 0));
  await compareCount(client, report, 'Jumlah produk', 'products', countRows(sheets.product, 0));

  // ── Penawaran: jumlah unik + jumlah revisi ──
  const uniqueQuotes = new Set(
    sheets.quotation.rows.map((r) => parseText(r[0])).filter(Boolean)
  ).size;
  await compareCount(client, report, 'Jumlah penawaran (unik)', 'quotations', uniqueQuotes);
  await compareCount(
    client,
    report,
    'Jumlah revisi penawaran',
    'quotation_revisions',
    countRows(sheets.quotation, 0)
  );

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
  await compareCount(client, report, 'Jumlah invoice', 'invoices', countRows(sheets.invoice, 0));

  const sheetInvoiceTotal = sumColumn(sheets.invoice, 14);
  const { rows: [i] } = await client.query('select coalesce(sum(total), 0) as total from invoices');
  compareAmount(report, 'Total nilai invoice', sheetInvoiceTotal, i.total);

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

async function compareCount(client, report, label, table, sheetCount) {
  const { rows: [r] } = await client.query(`select count(*)::int as n from ${table}`);
  report.addReconciliation({
    label,
    sheet: sheetCount,
    db: r.n,
    ok: r.n === sheetCount,
  });
}

function compareAmount(report, label, sheetTotal, dbTotal) {
  report.addReconciliation({
    label,
    sheet: sheetTotal,
    db: dbTotal,
    ok: Math.abs(dbTotal - sheetTotal) <= IDR_TOLERANCE,
  });
}
