#!/usr/bin/env node
/**
 * Importer RenusPro: Google Sheets → Supabase/Postgres.
 *
 *   npm run import -- --dry-run              impor lalu ROLLBACK (tidak menyimpan)
 *   npm run import -- --create-auth-users    sekalian buat user di Supabase Auth
 *   npm run import -- --emit-user-template   tulis users.csv untuk diisi email
 *   npm run import -- --reconcile-only       hanya bandingkan, tanpa menulis
 *   npm run import -- --settings=./tc.json   impor TC_OPTIONS & BANK_ACCOUNTS
 *
 * Seluruh impor berjalan dalam SATU transaksi: kalau ada yang gagal di
 * tengah, tidak ada yang tersimpan setengah jalan.
 */
import fs from 'node:fs';
import { connect, withImportTriggersDisabled, seedCounters } from './db.js';
import { createSheetsClient, readAllSheets } from './sheets.js';
import { importProfiles, writeEmailTemplate } from './profiles.js';
import {
  importCustomers,
  importProducts,
  importTemplates,
  importQuotations,
  importWorkOrders,
  importInvoiceRequests,
  importInvoices,
  importReceipts,
  importSettings,
  collectCounters,
} from './steps.js';
import { reconcile } from './reconcile.js';
import { Report } from './report.js';

function parseArgs(argv) {
  const args = {
    dryRun: false,
    createAuthUsers: false,
    emitUserTemplate: false,
    reconcileOnly: false,
    usersCsv: 'users.csv',
    settings: null,
  };
  for (const a of argv.slice(2)) {
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--create-auth-users') args.createAuthUsers = true;
    else if (a === '--emit-user-template') args.emitUserTemplate = true;
    else if (a === '--reconcile-only') args.reconcileOnly = true;
    else if (a.startsWith('--users=')) args.usersCsv = a.slice(8);
    else if (a.startsWith('--settings=')) args.settings = a.slice(11);
    else throw new Error(`Argumen tidak dikenal: ${a}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const report = new Report();

  console.log('▸ Membaca Google Sheets...');
  const sheetsClient = await createSheetsClient();
  const sheets = await readAllSheets(sheetsClient);

  for (const [key, s] of Object.entries(sheets)) {
    if (s.missing) {
      console.log(`  ! sheet "${s.sheetName}" tidak ditemukan — dilewati`);
    } else {
      console.log(`  ${s.sheetName.padEnd(20)} ${String(s.rows.length).padStart(6)} baris`);
    }
  }

  if (args.emitUserTemplate) {
    const { count, content } = writeEmailTemplate(sheets.user, args.usersCsv);

    console.log(`\n✓ ${args.usersCsv} ditulis dengan ${count} user.\n`);
    console.log('─'.repeat(72));
    console.log(content.trimEnd());
    console.log('─'.repeat(72));
    console.log(
      '\nSalin isi di atas, buat berkas tools/importer/users.csv di repository,\n' +
        'lalu isi kolom email HANYA untuk user yang alamatnya berbeda dari pola\n' +
        'username@AUTH_EMAIL_DOMAIN. Sisanya boleh dibiarkan kosong.'
    );
    return;
  }

  const settings = args.settings
    ? JSON.parse(fs.readFileSync(args.settings, 'utf8'))
    : null;

  const client = await connect();
  try {
    await client.query('begin');

    if (!args.reconcileOnly) {
      await withImportTriggersDisabled(client, async () => {
        console.log('\n▸ Mengimpor...');

        const ownerByName = await importProfiles(client, sheets.user, args, report);
        const ctx = { ownerByName };

        await importCustomers(client, sheets.customer, report);
        await importProducts(client, sheets.product, report);
        await importTemplates(client, sheets.template, report);
        await importQuotations(client, sheets.quotation, ctx, report);
        await importWorkOrders(client, sheets.quotation, sheets.woNotes, ctx, report);
        await importInvoiceRequests(client, sheets.invoiceRequest, ctx, report);
        await importInvoices(client, sheets.invoice, ctx, report);
        await importReceipts(client, sheets.receipt, ctx, report);
        await importSettings(client, settings, report);

        // Wajib: tanpa ini dokumen baru akan bernomor 001 dan menabrak
        // dokumen historis.
        await seedCounters(client, collectCounters(sheets, ctx));
      });
    }

    console.log('\n▸ Rekonsiliasi...');
    await reconcile(client, sheets, report);

    if (args.dryRun) {
      await client.query('rollback');
      console.log('\n(--dry-run: seluruh perubahan di-ROLLBACK)');
    } else if (args.reconcileOnly) {
      await client.query('rollback');
    } else {
      await client.query('commit');
    }

    console.log(report.render());

    // Selisih rekonsiliasi adalah kegagalan, bukan sekadar catatan: exit code
    // bukan nol supaya pipeline tidak menganggapnya sukses.
    if (report.hasBlockingIssues) process.exitCode = 1;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('\n✗ Impor gagal:', err.message);
  if (process.env.DEBUG) console.error(err);
  process.exit(1);
});
