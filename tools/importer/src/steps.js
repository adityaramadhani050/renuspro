/**
 * Langkah-langkah impor, dijalankan berurutan oleh index.js.
 *
 * Semua langkah IDEMPOTEN: menjalankan ulang skrip ini tidak menggandakan
 * data. Itu bukan kemewahan — selama migrasi bertahap, impor akan dijalankan
 * berkali-kali (tiap kali menguji, dan sekali lagi saat cutover tiap modul).
 *
 * Indeks kolom di bawah mengacu pada struktur sheet yang terbaca di kode GAS.
 * Kalau sheet berubah, di sinilah tempat memperbaikinya.
 */
import {
  parseDate,
  parseTimestamp,
  parseNumber,
  parseText,
  parseQuotationItems,
  parseTemplateItems,
  extractDocSeq,
  parseWoNumber,
  splitWoNumber,
} from './parse.js';
import { loadLegacyMap } from './db.js';

const norm = (v) => (parseText(v) || '').toLowerCase();

// ============================================================================
// Data master
// ============================================================================

export async function importCustomers(client, sheet, report) {
  // Master_Klien: 0 ID | 1 Nama Klien | 2 Perusahaan | 3 Alamat | 4 Kontak
  let count = 0;
  for (const row of sheet.rows) {
    const code = parseText(row[0]);
    if (!code) continue;

    await client.query(
      `insert into customers (legacy_code, name, company, address, phone)
       values ($1, $2, $3, $4, $5)
       on conflict (legacy_code) do update
         set name = excluded.name, company = excluded.company,
             address = excluded.address, phone = excluded.phone`,
      [code, parseText(row[1]) || code, parseText(row[2]), parseText(row[3]), parseText(row[4])]
    );
    count++;
  }
  report.add('customers', count);
}

export async function importProducts(client, sheet, report) {
  // Master_Produk: 0 ID | 1 Nama | 2 Unit | 3 Harga Satuan | 4 HPP
  let count = 0;
  for (const row of sheet.rows) {
    const code = parseText(row[0]);
    if (!code) continue;

    await client.query(
      `insert into products (legacy_code, name, unit, price, cost)
       values ($1, $2, $3, $4, $5)
       on conflict (legacy_code) do update
         set name = excluded.name, unit = excluded.unit,
             price = excluded.price, cost = excluded.cost`,
      [
        code,
        parseText(row[1]) || code,
        parseText(row[2]) || 'unit',
        parseNumber(row[3]),
        parseNumber(row[4]),
      ]
    );
    count++;
  }
  report.add('products', count);
}

export async function importTemplates(client, sheet, report) {
  // Template_Paket: 0 ID | 1 Nama Paket | 2 Daftar Item (JSON, array DATAR)
  const productMap = await loadLegacyMap(client, 'products');
  let count = 0;

  for (const row of sheet.rows) {
    const code = parseText(row[0]);
    if (!code) continue;

    const { rows: [tpl] } = await client.query(
      `insert into package_templates (legacy_code, name)
       values ($1, $2)
       on conflict (legacy_code) do update set name = excluded.name
       returning id`,
      [code, parseText(row[1]) || code]
    );

    // Item ditulis ulang seluruhnya agar impor tetap idempoten.
    await client.query('delete from package_template_items where template_id = $1', [tpl.id]);

    const items = parseTemplateItems(row[2]);
    for (const [i, item] of items.entries()) {
      await client.query(
        `insert into package_template_items
           (template_id, product_id, description, qty, unit, price, cost, sort_order)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          tpl.id,
          productMap.get(item.productLegacyCode) || null,
          item.description,
          item.qty,
          item.unit,
          item.price,
          item.cost,
          i,
        ]
      );
    }
    count++;
  }
  report.add('package_templates', count);
}

// ============================================================================
// Penawaran
// ============================================================================

/**
 * Penawaran_Main → quotations + quotation_revisions + kelompok + item.
 *
 * Di sheet, satu penawaran tersebar di beberapa baris (satu per revisi).
 * Field identitas — Status, No WO, Tanggal Deal — diambil dari baris dengan
 * REV TERTINGGI, karena itulah yang dibaca seluruh kode GAS
 * (Dashboard.gs:42, Penawaran.gs:60, WorkOrder.gs:63).
 */
export async function importQuotations(client, sheet, ctx, report) {
  const customerMap = await loadLegacyMap(client, 'customers');
  const productMap = await loadLegacyMap(client, 'products');

  // Kelompokkan baris sheet per nomor penawaran
  const byNumber = new Map();
  for (const row of sheet.rows) {
    const no = parseText(row[0]);
    if (!no) continue;
    if (!byNumber.has(no)) byNumber.set(no, []);
    byNumber.get(no).push(row);
  }

  let quotationCount = 0;
  let revisionCount = 0;
  let itemCount = 0;

  for (const [quoteNumber, rows] of byNumber) {
    rows.sort((a, b) => parseNumber(a[1]) - parseNumber(b[1]));
    const latest = rows[rows.length - 1];

    // ── Klien ──
    const customerCode = parseText(latest[5]);
    let customerId = customerMap.get(customerCode);
    if (!customerId) {
      // Klien sudah dihapus dari master tapi masih dirujuk penawaran.
      // GAS menampilkan ID mentahnya (Dashboard.gs:53); di sini dibuatkan
      // baris pengganti agar penawaran tidak ikut hilang.
      const { rows: [c] } = await client.query(
        `insert into customers (legacy_code, name)
         values ($1, $2)
         on conflict (legacy_code) do update set legacy_code = excluded.legacy_code
         returning id`,
        [customerCode || `TANPA-KLIEN-${quoteNumber}`, customerCode || '(klien tidak diketahui)']
      );
      customerId = c.id;
      customerMap.set(customerCode, customerId);
      report.warn('klien_hilang', `${quoteNumber} merujuk klien "${customerCode}" yang tidak ada di Master_Klien`);
    }

    // ── Pemilik: kolom "Dibuat Oleh" berisi NAMA, bukan ID ──
    const ownerName = parseText(latest[6]);
    const ownerId = ctx.ownerByName.get(norm(ownerName)) || null;
    if (ownerName && !ownerId) {
      report.unmatchedOwner(ownerName, quoteNumber);
    }

    const status = parseText(latest[16]) || 'On-Progress';
    const dealDate = status === 'Deal' ? parseTimestamp(latest[18]) : null;

    const { rows: [q] } = await client.query(
      `insert into quotations
         (quote_number, customer_id, project_name, owner_id, owner_name_legacy, status, deal_date)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (quote_number) do update
         set customer_id = excluded.customer_id,
             project_name = excluded.project_name,
             owner_id = excluded.owner_id,
             owner_name_legacy = excluded.owner_name_legacy,
             status = excluded.status,
             deal_date = excluded.deal_date
       returning id`,
      [
        quoteNumber,
        customerId,
        parseText(latest[4]) || '(tanpa nama project)',
        ownerId,
        ownerName,
        status,
        dealDate,
      ]
    );
    quotationCount++;

    // ── Revisi ──
    for (const row of rows) {
      const rev = Math.trunc(parseNumber(row[1]));
      const issueDate = parseDate(row[2]);
      if (!issueDate) {
        report.warn('tanggal_kosong', `${quoteNumber} rev ${rev} tidak punya tanggal yang bisa dibaca`);
      }

      const { rows: [r] } = await client.query(
        `insert into quotation_revisions
           (quotation_id, rev, issue_date, valid_until, subtotal, discount, tax_amount,
            grand_total, total_cost, est_profit, margin_pct, terms, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         on conflict (quotation_id, rev) do update
           set issue_date = excluded.issue_date, valid_until = excluded.valid_until,
               subtotal = excluded.subtotal, discount = excluded.discount,
               tax_amount = excluded.tax_amount, grand_total = excluded.grand_total,
               total_cost = excluded.total_cost, est_profit = excluded.est_profit,
               margin_pct = excluded.margin_pct, terms = excluded.terms
         returning id`,
        [
          q.id,
          rev,
          issueDate || '1970-01-01',
          parseDate(row[3]),
          parseNumber(row[7]),
          parseNumber(row[8]),
          parseNumber(row[9]),
          parseNumber(row[10]),
          parseNumber(row[11]),
          parseNumber(row[12]),
          parseNumber(row[13]),
          JSON.stringify(parseJsonSafe(row[14])),
          ownerId,
        ]
      );
      revisionCount++;

      // Item ditulis ulang seluruhnya (cascade menghapus item di dalamnya).
      await client.query('delete from quotation_item_groups where revision_id = $1', [r.id]);

      for (const group of parseQuotationItems(row[15])) {
        const { rows: [g] } = await client.query(
          `insert into quotation_item_groups (revision_id, code, name, subtotal, sort_order)
           values ($1, $2, $3, $4, $5) returning id`,
          [r.id, group.code, group.name, group.subtotal, group.sortOrder]
        );

        for (const [i, item] of group.items.entries()) {
          await client.query(
            `insert into quotation_items
               (group_id, product_id, description, qty, unit, price, cost, line_total, sort_order)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              g.id,
              productMap.get(item.productLegacyCode) || null,
              item.description,
              item.qty,
              item.unit,
              item.price,
              item.cost,
              item.lineTotal,
              item.sortOrder || i,
            ]
          );
          itemCount++;
        }
      }
    }
  }

  report.add('quotations', quotationCount);
  report.add('quotation_revisions', revisionCount);
  report.add('quotation_items', itemCount);
}

function parseJsonSafe(raw) {
  const s = parseText(raw);
  if (!s) return {};
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

// ============================================================================
// Work Order
// ============================================================================

/**
 * Work Order diambil dari kolom 18 Penawaran_Main (bukan sheet tersendiri),
 * lalu catatannya dari sheet WorkOrder_Catatan.
 *
 * Nomor WO historis dipertahankan apa adanya — inilah sebabnya trigger
 * penerbitan WO harus dinonaktifkan selama impor (lihat db.js).
 */
export async function importWorkOrders(client, quotationSheet, notesSheet, ctx, report) {
  const notesByWo = new Map();
  for (const row of notesSheet.rows || []) {
    const wo = parseWoNumber(row[0]);
    if (!wo) continue;
    notesByWo.set(wo, {
      notes: parseText(row[1]),
      updatedByName: parseText(row[2]),
      updatedAt: parseTimestamp(row[3]),
    });
  }

  // Ambil No WO dari baris revisi tertinggi tiap penawaran
  const latestByQuote = new Map();
  for (const row of quotationSheet.rows) {
    const no = parseText(row[0]);
    if (!no) continue;
    const rev = parseNumber(row[1]);
    const prev = latestByQuote.get(no);
    if (!prev || rev > prev.rev) latestByQuote.set(no, { rev, row });
  }

  let count = 0;
  const seqByYear = new Map();

  for (const [quoteNumber, { row }] of latestByQuote) {
    const woNumber = parseWoNumber(row[17]);
    if (!woNumber) continue;

    const { rows: [q] } = await client.query(
      'select id from quotations where quote_number = $1',
      [quoteNumber]
    );
    if (!q) continue;

    const note = notesByWo.get(woNumber) || {};
    const updatedById = note.updatedByName
      ? ctx.ownerByName.get(norm(note.updatedByName)) || null
      : null;

    await client.query(
      `insert into work_orders
         (wo_number, quotation_id, notes, notes_updated_by, notes_updated_at)
       values ($1, $2, $3, $4, $5)
       on conflict (quotation_id) do update
         set wo_number = excluded.wo_number,
             notes = excluded.notes,
             notes_updated_by = excluded.notes_updated_by,
             notes_updated_at = excluded.notes_updated_at`,
      [woNumber, q.id, note.notes || null, updatedById, note.updatedAt || null]
    );
    count++;

    // Catat urutan tertinggi per tahun untuk menyemai counter
    const split = splitWoNumber(woNumber);
    if (split) {
      const cur = seqByYear.get(split.year) || 0;
      if (split.seq > cur) seqByYear.set(split.year, split.seq);
    }
  }

  ctx.woSeqByYear = seqByYear;
  report.add('work_orders', count);
}

export async function importInvoiceRequests(client, sheet, ctx, report) {
  // WO_RequestInvoice: 0 No WO | 1 Klien | 2 Project | 3 Sales | 4 Pesan | 5 Status | 6 Tanggal
  let count = 0;
  for (const row of sheet.rows || []) {
    const woNumber = parseWoNumber(row[0]);
    if (!woNumber) continue;

    const { rows: [w] } = await client.query(
      'select id from work_orders where wo_number = $1',
      [woNumber]
    );
    if (!w) {
      report.warn('wo_hilang', `Permintaan invoice merujuk No WO ${woNumber} yang tidak ada`);
      continue;
    }

    const requestedBy = ctx.ownerByName.get(norm(row[3])) || null;
    const createdAt = parseTimestamp(row[6]);

    // Sheet tidak punya kunci unik untuk permintaan invoice, jadi idempotensi
    // ditegakkan lewat kombinasi (WO, pesan, waktu).
    const { rowCount } = await client.query(
      `insert into invoice_requests (work_order_id, requested_by, message, status, created_at)
       select $1, $2, $3, $4, coalesce($5::timestamptz, now())
        where not exists (
          select 1 from invoice_requests
           where work_order_id = $1
             and message is not distinct from $3
             and created_at = coalesce($5::timestamptz, created_at)
        )`,
      [w.id, requestedBy, parseText(row[4]), parseText(row[5]) || 'Pending', createdAt]
    );
    count += rowCount;
  }
  report.add('invoice_requests', count);
}

// ============================================================================
// Invoice & Kwitansi
// ============================================================================

export async function importInvoices(client, sheet, ctx, report) {
  // Invoice_Main: 0 No Invoice | 1 No WO | 2 No Penawaran | 3 Tanggal | 4 Jenis |
  // 5 Persen | 6 No PO | 7 Tgl PO | 8 Klien ID | 9 Nama Klien | 10 Nama Project |
  // 11 DPP | 12 PPN(%) | 13 PPN Nominal | 14 Total | 15 META(JSON) |
  // 16 Status Bayar | 17 Catatan | 18 Dibuat Oleh | 19 Bank Account | 20 Tanggal Bayar
  const customerMap = await loadLegacyMap(client, 'customers');
  let count = 0;

  for (const row of sheet.rows) {
    const invoiceNumber = parseText(row[0]);
    if (!invoiceNumber) continue;

    const woNumber = parseWoNumber(row[1]);
    const quoteNumber = parseText(row[2]);

    let workOrderId = null;
    if (woNumber) {
      const { rows } = await client.query('select id from work_orders where wo_number = $1', [woNumber]);
      workOrderId = rows[0]?.id || null;
      if (!workOrderId) report.warn('wo_hilang', `Invoice ${invoiceNumber} merujuk No WO ${woNumber} yang tidak ada`);
    }

    let quotationId = null;
    if (quoteNumber) {
      const { rows } = await client.query('select id from quotations where quote_number = $1', [quoteNumber]);
      quotationId = rows[0]?.id || null;
    }

    if (!workOrderId && !quotationId) {
      report.warn('invoice_yatim', `Invoice ${invoiceNumber} tidak bisa dikaitkan ke WO maupun penawaran — DILEWATI`);
      continue;
    }

    const meta = parseJsonSafe(row[15]);
    const status = parseText(row[16]) || 'Belum Lunas';
    const paidAt = status === 'Lunas' ? parseDate(row[20]) : null;

    // Jenis invoice pre-deal wajib DP (constraint database, Invoice.gs:275).
    let type = parseText(row[4]) || 'Penuh';
    if (!workOrderId && type !== 'DP') {
      report.warn(
        'jenis_predeal',
        `Invoice ${invoiceNumber} pre-deal berjenis "${type}"; diimpor sebagai DP agar lolos constraint`
      );
      type = 'DP';
    }

    await client.query(
      `insert into invoices
         (invoice_number, work_order_id, quotation_id, issue_date, type, percent,
          po_number, po_date, customer_id, customer_snapshot, dpp, vat_percent,
          vat_amount, total, payment_status, notes, created_by, paid_at,
          scope, contract_value, input_mode)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       on conflict (invoice_number) do update
         set work_order_id = excluded.work_order_id,
             quotation_id = excluded.quotation_id,
             issue_date = excluded.issue_date, type = excluded.type,
             percent = excluded.percent, po_number = excluded.po_number,
             po_date = excluded.po_date, customer_id = excluded.customer_id,
             customer_snapshot = excluded.customer_snapshot, dpp = excluded.dpp,
             vat_percent = excluded.vat_percent, vat_amount = excluded.vat_amount,
             total = excluded.total, payment_status = excluded.payment_status,
             notes = excluded.notes, created_by = excluded.created_by,
             paid_at = excluded.paid_at, scope = excluded.scope,
             contract_value = excluded.contract_value, input_mode = excluded.input_mode`,
      [
        invoiceNumber,
        workOrderId,
        quotationId,
        parseDate(row[3]) || '1970-01-01',
        type,
        parseNumber(row[5]),
        parseText(row[6]),
        parseDate(row[7]),
        customerMap.get(parseText(row[8])) || null,
        JSON.stringify({ name: parseText(row[9]), project: parseText(row[10]) }),
        parseNumber(row[11]),
        parseNumber(row[12]),
        parseNumber(row[13]),
        parseNumber(row[14]),
        status,
        parseText(row[17]),
        ctx.ownerByName.get(norm(row[18])) || null,
        paidAt,
        parseText(meta.scope),
        parseNumber(meta.nilaiKontrak),
        meta.inputMode === 'nominal' ? 'nominal' : 'persen',
      ]
    );
    count++;
  }
  report.add('invoices', count);
}

export async function importReceipts(client, sheet, ctx, report) {
  // Kwitansi_Main: 0 No Kwitansi | 1 No Invoice | 2 No WO | 3 Tanggal |
  // 4 Terima Dari | 5 Jumlah | 6 Untuk Pembayaran | 7 Metode | 8 Catatan | 9 Dibuat Oleh
  let count = 0;
  for (const row of sheet.rows) {
    const receiptNumber = parseText(row[0]);
    if (!receiptNumber) continue;

    const invoiceNumber = parseText(row[1]);
    const woNumber = parseWoNumber(row[2]);

    let invoiceId = null;
    if (invoiceNumber) {
      const { rows } = await client.query('select id from invoices where invoice_number = $1', [invoiceNumber]);
      invoiceId = rows[0]?.id || null;
    }
    let workOrderId = null;
    if (woNumber) {
      const { rows } = await client.query('select id from work_orders where wo_number = $1', [woNumber]);
      workOrderId = rows[0]?.id || null;
    }

    await client.query(
      `insert into receipts
         (receipt_number, invoice_id, work_order_id, issue_date, received_from,
          amount, purpose, method, notes, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (receipt_number) do update
         set invoice_id = excluded.invoice_id, work_order_id = excluded.work_order_id,
             issue_date = excluded.issue_date, received_from = excluded.received_from,
             amount = excluded.amount, purpose = excluded.purpose,
             method = excluded.method, notes = excluded.notes,
             created_by = excluded.created_by`,
      [
        receiptNumber,
        invoiceId,
        workOrderId,
        parseDate(row[3]) || '1970-01-01',
        parseText(row[4]) || '-',
        parseNumber(row[5]),
        parseText(row[6]),
        parseText(row[7]) || 'Transfer',
        parseText(row[8]),
        ctx.ownerByName.get(norm(row[9])) || null,
      ]
    );
    count++;
  }
  report.add('receipts', count);
}

// ============================================================================
// Counter dokumen
// ============================================================================

/**
 * Semai document_counters dari nomor tertinggi yang sudah ada.
 * Tanpa langkah ini, dokumen pertama yang dibuat di sistem baru akan bernomor
 * 001 dan menabrak dokumen historis.
 */
export function collectCounters(sheets, ctx) {
  const counters = [];
  const maxOf = (rows, kind, colIndex) =>
    rows.reduce((max, row) => {
      const seq = extractDocSeq(kind, row[colIndex]);
      return seq && seq > max ? seq : max;
    }, 0);

  counters.push({
    docType: 'quotation',
    period: '-',
    lastSeq: maxOf(sheets.quotation.rows, 'quotation', 0),
  });
  counters.push({
    docType: 'invoice',
    period: '-',
    lastSeq: maxOf(sheets.invoice.rows, 'invoice', 0),
  });
  counters.push({
    docType: 'receipt',
    period: '-',
    lastSeq: maxOf(sheets.receipt.rows, 'receipt', 0),
  });

  for (const [year, seq] of ctx.woSeqByYear || new Map()) {
    counters.push({ docType: 'work_order', period: String(year), lastSeq: seq });
  }

  return counters;
}

// ============================================================================
// Pengaturan
// ============================================================================

export async function importSettings(client, settings, report) {
  // Nilai berasal dari PropertiesService, yang tidak bisa dibaca lewat Sheets
  // API. Ekspor manual ke berkas JSON, lalu tunjuk dengan --settings=<file>.
  if (!settings) return;

  if (Array.isArray(settings.BANK_ACCOUNTS)) {
    for (const [i, acc] of settings.BANK_ACCOUNTS.entries()) {
      await client.query(
        `insert into bank_accounts (bank_name, account_no, account_name, sort_order)
         values ($1, $2, $3, $4)
         on conflict do nothing`,
        [
          parseText(acc.bank) || parseText(acc.bankName) || '-',
          parseText(acc.noRek) || parseText(acc.accountNo) || '-',
          parseText(acc.atasNama) || parseText(acc.accountName) || '-',
          i,
        ]
      );
    }
    report.add('bank_accounts', settings.BANK_ACCOUNTS.length);
  }

  for (const key of ['TC_OPTIONS']) {
    if (settings[key] !== undefined) {
      await client.query(
        `insert into app_settings (key, value) values ($1, $2)
         on conflict (key) do update set value = excluded.value`,
        [key, JSON.stringify(settings[key])]
      );
    }
  }
}
