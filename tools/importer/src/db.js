/** Lapisan database untuk importer. */
import pg from 'pg';
import { config } from './config.js';

// Sheets menyimpan uang sebagai angka biasa; node-pg mengembalikan numeric
// sebagai string demi presisi. Untuk rekonsiliasi kita perlu angka.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));

export async function connect() {
  const client = new pg.Client({ connectionString: config.databaseUrl() });
  await client.connect();
  return client;
}

/**
 * Trigger yang HARUS dimatikan selama impor.
 *
 * Tanpa ini, mengimpor penawaran berstatus Deal akan memicu penerbitan Work
 * Order dengan nomor BARU — bukan nomor historis dari sheet. Begitu pula
 * meng-upsert ulang invoice yang sudah lunas akan menimpa tanggal bayarnya
 * dengan tanggal hari ini. Keduanya merusak data secara diam-diam.
 *
 * sync_current_revision sengaja DIBIARKAN aktif karena memang itu yang kita
 * inginkan: pointer revisi terkini terisi otomatis.
 */
const TRIGGERS_TO_DISABLE = [
  ['quotations', 'quotations_handle_status_change'],
  ['quotations', 'quotations_handle_insert_deal'],
  ['invoices', 'invoices_handle_payment_status'],
  ['profiles', 'profiles_guard_privilege_columns'],
];

export async function withImportTriggersDisabled(client, fn) {
  for (const [table, trigger] of TRIGGERS_TO_DISABLE) {
    await client.query(`alter table ${table} disable trigger ${trigger}`);
  }
  try {
    return await fn();
  } finally {
    for (const [table, trigger] of TRIGGERS_TO_DISABLE) {
      await client.query(`alter table ${table} enable trigger ${trigger}`);
    }
  }
}

/** Peta legacy_code → id untuk satu tabel. */
export async function loadLegacyMap(client, table) {
  const { rows } = await client.query(
    `select legacy_code, id from ${table} where legacy_code is not null`
  );
  return new Map(rows.map((r) => [r.legacy_code, r.id]));
}

/**
 * Semai document_counters dari nomor tertinggi yang sudah ada, supaya
 * dokumen baru tidak menabrak nomor historis.
 */
export async function seedCounters(client, counters) {
  for (const { docType, period, lastSeq } of counters) {
    await client.query(
      `insert into document_counters (doc_type, period, last_seq)
       values ($1, $2, $3)
       on conflict (doc_type, period)
         do update set last_seq = greatest(document_counters.last_seq, excluded.last_seq)`,
      [docType, period, lastSeq]
    );
  }
}
