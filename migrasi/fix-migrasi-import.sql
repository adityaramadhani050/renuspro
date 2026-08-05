-- =============================================================================
--  Perbaikan sebelum import ulang data (migrasi)
--  Sistem Google Sheets lama TIDAK punya Foreign Key, sehingga ada referensi
--  "yatim" (mis. penawaran menunjuk klien yang sudah dihapus, kwitansi ke
--  invoice yang tak ada, dll). FK di skema baru memblokir data itu.
--  Jalankan SQL ini SEKALI di Supabase → SQL Editor, lalu jalankan ulang import.
--
--  Efek: semua Foreign Key dilepas (data tetap masuk apa adanya, setia dgn
--  sistem lama). Kolomnya tetap ada + ter-index. FK bisa ditambahkan lagi nanti
--  SETELAH data dibersihkan, bila diinginkan.
-- =============================================================================
do $$
declare r record;
begin
  for r in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where contype = 'f' and connamespace = 'public'::regnamespace
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

-- (Kolom hand_over.waktu bertipe `time` — tidak perlu diubah; skrip import kini
--  mengirim "HH:MM" yang valid untuk tipe time.)
