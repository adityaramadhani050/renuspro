-- ============================================================================
-- Tes invoice warisan
--
-- Yang dijaga: data historis boleh masuk tanpa induk, TAPI jalur penerbitan
-- yang baru tetap tidak boleh menghasilkan invoice yatim. Kalau penjagaan
-- kedua ini lepas, kelonggaran untuk data lama pelan-pelan menjadi kelonggaran
-- untuk data baru.
-- ============================================================================

\set ON_ERROR_STOP on
\echo '▸ Invoice warisan'

-- Invoice warisan: tanpa WO, tanpa penawaran, jenis apa pun.
insert into invoices (
  invoice_number, issue_date, type, dpp, vat_amount, total,
  is_legacy, legacy_reference, customer_snapshot, payment_status)
values (
  '900/RGI/INV/I/2026', '2026-01-15', 'Termin', 40000000, 4400000, 44400000,
  true, 'No Penawaran: 653/QUOT/XI/2025',
  '{"name":"PT KLIEN LAMA","project":"Proyek 2025"}'::jsonb, 'Belum Lunas');

do $$
begin
  perform assert_true(true, 'invoice warisan boleh masuk tanpa induk');

  perform assert_eq(
    (select is_predeal from v_invoices where invoice_number = '900/RGI/INV/I/2026'),
    false,
    'warisan TIDAK ditandai pre-deal — keduanya keadaan yang berbeda');

  perform assert_eq(
    (select legacy_reference from v_invoices where invoice_number = '900/RGI/INV/I/2026'),
    'No Penawaran: 653/QUOT/XI/2025',
    'rujukan aslinya tersimpan agar masih bisa ditelusuri ke arsip');

  -- Piutangnya ikut terhitung. Inilah alasan invoice ini tidak boleh dibuang.
  perform assert_true(
    (select total_outstanding from v_finance_summary) >= 44400000,
    'piutang invoice warisan ikut terhitung di ringkasan finance');
end $$;

-- Tanpa tanda warisan, invoice tanpa induk tetap ditolak.
do $$
begin
  begin
    insert into invoices (invoice_number, issue_date, type, dpp, total)
    values ('901/RGI/INV/I/2026', '2026-01-15', 'Termin', 1000000, 1110000);
    raise exception 'GAGAL — invoice tanpa induk & tanpa tanda warisan harus ditolak';
  exception when check_violation then
    raise notice '  ✓ invoice tanpa induk tetap ditolak bila tidak ditandai warisan';
  end;
end $$;

\echo '✓ Tes invoice warisan lulus.'
