/**
 * Tes integrasi importer terhadap Postgres sungguhan.
 *
 * Tes parser membuktikan nilai dibaca benar; tes ini membuktikan SQL-nya benar —
 * relasi tersambung, impor idempoten, dan rekonsiliasi menangkap selisih.
 *
 * Dilewati otomatis kalau tidak ada Postgres yang bisa dihubungi, sehingga
 * `npm test` tetap bisa dijalankan di mana saja.
 *
 *   PGPORT=5433 npm test
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PGPORT = process.env.PGPORT || '5433';
const PGHOST = process.env.PGHOST || '127.0.0.1';
const PGUSER = process.env.PGUSER || 'postgres';
const DB = 'renuspro_import_test';

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  `postgresql://${PGUSER}@${PGHOST}:${PGPORT}/${DB}`;

function psql(args, db = 'postgres') {
  return execFileSync(
    'psql',
    ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', ...args],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
}

let available = true;
try {
  psql(['-c', 'select 1']);
} catch {
  available = false;
}

describe('importer → Postgres', { skip: available ? false : 'Postgres tidak tersedia' }, () => {
  let client;
  let steps;
  let db;
  let Report;
  let reconcileMod;

  before(async () => {
    psql(['-c', `drop database if exists ${DB}`]);
    psql(['-c', `create database ${DB}`]);
    psql(['-f', path.join(ROOT, 'supabase/tests/00_local_stubs.sql')], DB);

    const migrations = execFileSync('ls', [path.join(ROOT, 'supabase/migrations')], {
      encoding: 'utf8',
    })
      .trim()
      .split('\n');
    for (const m of migrations) {
      psql(['-f', path.join(ROOT, 'supabase/migrations', m)], DB);
    }

    steps = await import('../src/steps.js');
    db = await import('../src/db.js');
    reconcileMod = await import('../src/reconcile.js');
    ({ Report } = await import('../src/report.js'));

    client = await db.connect();
  });

  after(async () => {
    if (client) await client.end();
  });

  // ── Data sheet tiruan, meniru bentuk aslinya termasuk kejanggalannya ──────
  const sheets = () => ({
    user: {
      sheetName: 'Master_User',
      rows: [
        ['U001', 'Administrator', 'admin', 'admin123', 'admin', 'TRUE', 0],
        ['U002', 'Sales Executive', 'sales1', 'sales123', 'sales', 'TRUE', 100000000],
      ],
    },
    customer: {
      sheetName: 'Master_Klien',
      rows: [['K001', 'PT SUMMIT GLOBAL TEKNOLOGI', 'C&I', 'Tangerang', '081283576437']],
    },
    product: {
      sheetName: 'Master_Produk',
      rows: [
        ['P001', 'Panel Surya Jinko 625Wp', 'unit', 2500000, 1900000],
        // Harga sebagai teks berformat Indonesia — harus terbaca benar
        ['P002', 'Inverter Deye 10kW', 'unit', '42.000.000', '35.000.000'],
      ],
    },
    template: {
      sheetName: 'Template_Paket',
      rows: [
        [
          'PKT001',
          'PAKET PLTS 10KWP',
          JSON.stringify([
            { produkId: 'P001', deskripsi: 'Panel Surya', qty: 17, unit: 'unit', harga: 2500000, hpp: 1900000 },
          ]),
        ],
      ],
    },
    quotation: {
      sheetName: 'Penawaran_Main',
      rows: [
        // rev 0 — masih On-Progress
        [
          '001/QUOT/III/2026', 0, '15/03/2026', '15/04/2026', 'PLTS Off-Grid 10kWp',
          'K001', 'Sales Executive', 100000000, 5000000, 10450000, 105450000,
          70000000, 25000000, 26.32, '{"pembayaran":"DP 30%"}',
          JSON.stringify([
            {
              kelompok: 'A', namaKelompok: 'PAKET UTAMA', subtotal: 84500000,
              subItems: [
                { noItem: 1, produkId: 'P001', deskripsi: 'Panel Surya', qty: 17, unit: 'unit', harga: 2500000, hpp: 1900000, total: 42500000 },
                { noItem: 2, produkId: 'P002', deskripsi: 'Inverter', qty: 1, unit: 'unit', harga: 42000000, hpp: 35000000, total: 42000000 },
              ],
            },
          ]),
          'On-Progress', '', '',
        ],
        // rev 1 — jadi Deal, punya No WO (tersimpan sebagai ANGKA)
        [
          '001/QUOT/III/2026', 1, '20/03/2026', '20/04/2026', 'PLTS Off-Grid 10kWp',
          'K001', 'Sales Executive', 120000000, 0, 13200000, 133200000,
          80000000, 40000000, 33.33, '{"pembayaran":"DP 30%"}',
          JSON.stringify([
            {
              kelompok: 'A', namaKelompok: 'PAKET UTAMA', subtotal: 120000000,
              subItems: [
                { noItem: 1, produkId: 'P001', deskripsi: 'Panel Surya', qty: 20, unit: 'unit', harga: 2500000, hpp: 1900000, total: 50000000 },
              ],
            },
          ]),
          'Deal', 26001, '01/04/2026',
        ],
        // Penawaran kedua, pemiliknya TIDAK ada di Master_User
        [
          '002/QUOT/III/2026', 0, '18/03/2026', '18/04/2026', 'Proyek Lain',
          'K001', 'Orang Yang Sudah Resign', 50000000, 0, 5500000, 55500000,
          30000000, 20000000, 40, '{}', '[]', 'On-Progress', '', '',
        ],
      ],
    },
    woNotes: {
      sheetName: 'WorkOrder_Catatan',
      rows: [[26001, 'Menunggu pengiriman panel', 'Sales Executive', '02/04/2026 09:15']],
    },
    invoiceRequest: { sheetName: 'WO_RequestInvoice', rows: [] },
    invoice: {
      sheetName: 'Invoice_Main',
      rows: [
        [
          '001/RGI/INV/IV/2026', 26001, '001/QUOT/III/2026', '05/04/2026', 'DP', 30,
          'PO-123', '02/04/2026', 'K001', 'PT SUMMIT GLOBAL TEKNOLOGI', 'PLTS Off-Grid 10kWp',
          36000000, 11, 3960000, 39960000,
          JSON.stringify({ scope: 'Termin 1', nilaiKontrak: 120000000, inputMode: 'persen' }),
          'Lunas', 'catatan', 'Finance Officer', 'BCA', '10/04/2026',
        ],
      ],
    },
    receipt: {
      sheetName: 'Kwitansi_Main',
      rows: [
        [
          '001/RGI/KWT/IV/2026', '001/RGI/INV/IV/2026', 26001, '10/04/2026',
          'PT SUMMIT GLOBAL TEKNOLOGI', 39960000, 'Pembayaran DP 30%', 'Transfer', '', 'Finance Officer',
        ],
      ],
    },
  });

  async function runImport(data) {
    const report = new Report();
    await client.query('begin');
    await db.withImportTriggersDisabled(client, async () => {
      // Profil dibuat langsung: importProfiles memerlukan Supabase Auth, yang
      // tidak tersedia di lingkungan tes.
      await client.query(`
        insert into auth.users (id, email) values
          ('00000000-0000-0000-0000-0000000000a1','admin@test'),
          ('00000000-0000-0000-0000-0000000000b1','sales1@test')
        on conflict do nothing;
        insert into profiles (id, legacy_code, full_name, username, role, monthly_target) values
          ('00000000-0000-0000-0000-0000000000a1','U001','Administrator','admin','admin',0),
          ('00000000-0000-0000-0000-0000000000b1','U002','Sales Executive','sales1','sales',100000000)
        on conflict (id) do nothing;
      `);

      const ctx = {
        ownerByName: new Map([
          ['administrator', '00000000-0000-0000-0000-0000000000a1'],
          ['sales executive', '00000000-0000-0000-0000-0000000000b1'],
        ]),
      };

      await steps.importCustomers(client, data.customer, report);
      await steps.importProducts(client, data.product, report);
      await steps.importTemplates(client, data.template, report);
      await steps.importQuotations(client, data.quotation, ctx, report);
      await steps.importWorkOrders(client, data.quotation, data.woNotes, ctx, report);
      await steps.importInvoiceRequests(client, data.invoiceRequest, ctx, report);
      await steps.importInvoices(client, data.invoice, ctx, report);
      await steps.importReceipts(client, data.receipt, ctx, report);
      await db.seedCounters(client, steps.collectCounters(data, ctx));
    });
    await client.query('commit');
    return report;
  }

  test('impor pertama memuat seluruh entitas dengan relasi yang benar', async () => {
    const report = await runImport(sheets());

    assert.equal(report.counts.get('customers'), 1);
    assert.equal(report.counts.get('products'), 2);
    assert.equal(report.counts.get('quotations'), 2);
    assert.equal(report.counts.get('quotation_revisions'), 3);

    // Angka berformat Indonesia terbaca sebagai angka, bukan nol
    const { rows: [p] } = await client.query(
      `select price, cost from products where legacy_code = 'P002'`
    );
    assert.equal(p.price, 42000000, 'harga "42.000.000" terbaca benar');
    assert.equal(p.cost, 35000000);

    // Tanggal dd/MM/yyyy terbaca sebagai hari/bulan
    const { rows: [rev] } = await client.query(
      `select issue_date from quotation_revisions r
         join quotations q on q.id = r.quotation_id
        where q.quote_number = '001/QUOT/III/2026' and r.rev = 0`
    );
    assert.equal(
      rev.issue_date.toISOString().slice(0, 10),
      '2026-03-15',
      '15/03/2026 harus jadi 15 Maret, bukan 3 Maret'
    );

    // Pointer revisi terkini menunjuk rev 1
    const { rows: [q] } = await client.query(
      `select v.rev, v.grand_total, v.wo_number, v.owner_name
         from v_quotations v where v.quote_number = '001/QUOT/III/2026'`
    );
    assert.equal(q.rev, 1);
    assert.equal(q.grand_total, 133200000);
    assert.equal(q.wo_number, '26001', 'No WO historis dipertahankan, bukan diterbitkan ulang');
    assert.equal(q.owner_name, 'Sales Executive');

    // Item berkelompok tersimpan berikut relasi produknya
    const { rows: [items] } = await client.query(
      `select count(*)::int as n, count(qi.product_id)::int as with_product
         from quotation_items qi
         join quotation_item_groups g on g.id = qi.group_id
         join quotation_revisions r on r.id = g.revision_id
         join quotations q on q.id = r.quotation_id
        where q.quote_number = '001/QUOT/III/2026'`
    );
    assert.equal(items.n, 3, '2 item di rev 0 + 1 item di rev 1');
    assert.equal(items.with_product, 3, 'semua item tersambung ke master produk');
  });

  test('pemilik yang tidak dikenali dilaporkan, bukan dibuang diam-diam', async () => {
    const report = await runImport(sheets());
    assert.ok(
      report.unmatchedOwners.has('Orang Yang Sudah Resign'),
      'nama yang tidak cocok harus masuk laporan'
    );

    const { rows: [q] } = await client.query(
      `select owner_id, owner_name_legacy from quotations where quote_number = '002/QUOT/III/2026'`
    );
    assert.equal(q.owner_id, null);
    assert.equal(
      q.owner_name_legacy,
      'Orang Yang Sudah Resign',
      'nama asli tetap disimpan agar bisa diperbaiki tanpa impor ulang'
    );
  });

  test('tanggal bayar historis tidak tertimpa tanggal hari ini', async () => {
    await runImport(sheets());
    const { rows: [inv] } = await client.query(
      `select paid_at, payment_status, scope, contract_value
         from invoices where invoice_number = '001/RGI/INV/IV/2026'`
    );
    assert.equal(inv.payment_status, 'Lunas');
    assert.equal(
      inv.paid_at.toISOString().slice(0, 10),
      '2026-04-10',
      'trigger tanggal bayar harus nonaktif selama impor'
    );
    // Meta JSON (yang kolomnya salah label "Rincian Item") terurai jadi kolom
    assert.equal(inv.scope, 'Termin 1');
    assert.equal(inv.contract_value, 120000000);
  });

  test('impor ulang bersifat idempoten — tidak ada duplikasi', async () => {
    const before = await countAll();
    await runImport(sheets());
    const after = await countAll();
    assert.deepEqual(after, before, 'menjalankan ulang impor tidak boleh menambah baris');
  });

  test('counter dokumen tersemai dari nomor tertinggi', async () => {
    await runImport(sheets());
    // Data uji berisi penawaran 001 dan 002, jadi nomor berikutnya adalah 003 —
    // bukan 001 yang akan menabrak dokumen historis.
    const { rows: [n] } = await client.query(`select next_quotation_number('2026-06-01') as v`);
    assert.equal(n.v, '003/QUOT/VI/2026');

    const { rows: [w] } = await client.query(`select next_wo_number('2026-06-01') as v`);
    assert.equal(w.v, '26002');
  });

  test('rekonsiliasi cocok terhadap data sumber', async () => {
    const data = sheets();
    await runImport(data);

    const report = new Report();
    await reconcileMod.reconcile(client, data, report);

    const failed = report.reconciliation.filter((r) => !r.ok);
    assert.deepEqual(
      failed.map((f) => `${f.label}: sheet=${f.sheet} db=${f.db}`),
      [],
      'semua baris rekonsiliasi harus cocok'
    );
  });

  test('rekonsiliasi MENANGKAP data yang tidak cocok', async () => {
    // Kalau tes ini lolos dengan cara yang salah, rekonsiliasi tidak ada gunanya.
    const data = sheets();
    await runImport(data);

    data.invoice.rows.push([
      '999/RGI/INV/V/2026', 26001, '001/QUOT/III/2026', '01/05/2026', 'Termin', 20,
      '', '', 'K001', 'PT SUMMIT', 'PLTS', 24000000, 11, 2640000, 26640000,
      '{}', 'Belum Lunas', '', 'Finance Officer', 'BCA', '',
    ]);

    const report = new Report();
    await reconcileMod.reconcile(client, data, report);

    assert.ok(report.hasBlockingIssues, 'selisih harus terdeteksi');
    assert.ok(
      report.reconciliation.some((r) => !r.ok && r.label.includes('Jumlah invoice')),
      'selisih jumlah invoice harus dilaporkan'
    );
  });

  async function countAll() {
    const tables = [
      'customers', 'products', 'package_templates', 'package_template_items',
      'quotations', 'quotation_revisions', 'quotation_item_groups', 'quotation_items',
      'work_orders', 'invoices', 'receipts',
    ];
    const out = {};
    for (const t of tables) {
      const { rows: [r] } = await client.query(`select count(*)::int as n from ${t}`);
      out[t] = r.n;
    }
    return out;
  }
});
