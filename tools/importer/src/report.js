/**
 * Laporan impor.
 *
 * Impor yang "berhasil" tanpa laporan adalah impor yang tidak bisa dipercaya.
 * Yang paling penting di sini bukan angka yang cocok, melainkan daftar hal
 * yang TIDAK cocok — terutama nama pemilik penawaran yang gagal dipetakan,
 * karena itu memutus kepemilikan data historis dan harus direview manusia
 * sebelum cutover (lihat MIGRATION_PLAN.md §5.3d).
 */

export class Report {
  constructor() {
    this.counts = new Map();
    this.warnings = new Map();
    this.unmatchedOwners = new Map();
    this.reconciliation = [];
  }

  add(entity, n) {
    this.counts.set(entity, (this.counts.get(entity) || 0) + n);
  }

  warn(kind, message) {
    if (!this.warnings.has(kind)) this.warnings.set(kind, []);
    this.warnings.get(kind).push(message);
  }

  unmatchedOwner(name, docRef) {
    if (!this.unmatchedOwners.has(name)) this.unmatchedOwners.set(name, []);
    this.unmatchedOwners.get(name).push(docRef);
  }

  addReconciliation(row) {
    this.reconciliation.push(row);
  }

  get hasBlockingIssues() {
    return this.reconciliation.some((r) => !r.ok);
  }

  render() {
    const out = [];
    const rule = '─'.repeat(72);

    out.push('', rule, 'HASIL IMPOR', rule);
    const width = Math.max(...[...this.counts.keys()].map((k) => k.length), 12);
    for (const [entity, n] of this.counts) {
      out.push(`  ${entity.padEnd(width)}  ${String(n).padStart(7)}`);
    }

    // ── Rekonsiliasi ──
    if (this.reconciliation.length) {
      out.push('', rule, 'REKONSILIASI  (Sheets  vs  Postgres)', rule);
      for (const r of this.reconciliation) {
        const mark = r.ok ? '✓' : '✗';
        out.push(`  ${mark} ${r.label}`);
        out.push(`      sheets   : ${fmt(r.sheet)}`);
        out.push(`      postgres : ${fmt(r.db)}`);
        if (!r.ok) out.push(`      SELISIH  : ${fmt(r.db - r.sheet)}`);
      }
    }

    // ── Nama pemilik yang gagal dipetakan ──
    if (this.unmatchedOwners.size) {
      out.push('', rule, 'NAMA "DIBUAT OLEH" YANG TIDAK COCOK  — PERLU REVIEW MANUAL', rule);

      // Kalau tidak ada satu pun profil yang masuk, SEMUA nama otomatis tidak
      // cocok — dan daftar panjang di bawah menjadi menyesatkan. Sebutkan
      // sebabnya lebih dulu supaya tidak disangka data yang bermasalah.
      if (!this.counts.get('profiles')) {
        out.push(
          '  ⚠ Tidak ada user yang diimpor, sehingga SELURUH nama otomatis tidak',
          '    cocok. Ini bukan masalah pada data Anda.',
          '',
          '    Penyebabnya: pembuatan user memerlukan Supabase Auth, yang hanya',
          '    aktif dengan --create-auth-users. Jalankan sekali dengan opsi itu',
          '    (aman diulang), lalu ulangi impor percobaan — daftar di bawah akan',
          '    menyusut menjadi hanya nama yang benar-benar bermasalah.',
          ''
        );
      } else {
        out.push(
          '  Penawaran berikut kehilangan kepemilikan karena namanya tidak ada di',
          '  Master_User. Kolom owner_name_legacy tetap menyimpan nama aslinya,',
          '  jadi ini bisa diperbaiki tanpa impor ulang.',
          ''
        );
      }
      for (const [name, docs] of this.unmatchedOwners) {
        const sample = docs.slice(0, 5).join(', ');
        const more = docs.length > 5 ? `, +${docs.length - 5} lainnya` : '';
        out.push(`  • "${name}"  (${docs.length} dokumen)`);
        out.push(`      ${sample}${more}`);
      }
    }

    // ── Peringatan lain ──
    if (this.warnings.size) {
      out.push('', rule, 'PERINGATAN', rule);
      for (const [kind, messages] of this.warnings) {
        out.push(`  [${kind}]  ${messages.length} kejadian`);
        for (const m of messages.slice(0, 5)) out.push(`      - ${m}`);
        if (messages.length > 5) out.push(`      ... +${messages.length - 5} lainnya`);
      }
    }

    out.push('', rule);
    out.push(
      this.hasBlockingIssues
        ? '✗ REKONSILIASI GAGAL — jangan lanjut ke cutover sebelum selisihnya dijelaskan.'
        : '✓ Rekonsiliasi cocok.'
    );
    out.push(rule, '');

    return out.join('\n');
  }
}

function fmt(n) {
  if (typeof n !== 'number') return String(n);
  return Number.isInteger(n) ? n.toLocaleString('id-ID') : n.toFixed(2);
}
