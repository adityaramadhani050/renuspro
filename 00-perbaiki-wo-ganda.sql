-- =============================================================================
--  RenusPro — Diagnosa & perbaikan No WO GANDA (satu No WO dipakai >1 penawaran)
--  PRASYARAT: jalankan dulu versi terbaru 00-rpc-next-seq.sql (next_wo_seq kini
--  membandingkan dengan nomor tertinggi di tabel).
--  Jalankan per LANGKAH di Supabase → SQL Editor.
-- =============================================================================

-- ── LANGKAH 1 — Diagnosa: No WO mana yang dipakai lebih dari 1 penawaran ─────
with latest as (
  select distinct on (no_penawaran) no_penawaran, no_wo, status,
         coalesce(tanggal_deal, tanggal) as tgl, nama_project
  from penawaran order by no_penawaran, rev desc
)
select no_wo, no_penawaran, status, tgl as tgl_deal, nama_project
from latest
where coalesce(no_wo, '') <> ''
  and no_wo in (select no_wo from latest where coalesce(no_wo,'') <> ''
                group by no_wo having count(*) > 1)
order by no_wo, tgl nulls last, no_penawaran;


-- ── LANGKAH 2 — Sensus data per No WO ganda (tabel yg HANYA punya no_wo) ─────
--  Data di tabel ini tak bisa dipisah otomatis (tak ada no_penawaran). Setelah
--  perbaikan, data ini TETAP di No WO lama (milik penawaran yg dipertahankan).
--  Bila ternyata milik project yg diberi nomor baru, pindahkan manual.
with latest as (
  select distinct on (no_penawaran) no_penawaran, no_wo from penawaran order by no_penawaran, rev desc
), dup as (
  select no_wo from latest where coalesce(no_wo,'') <> '' group by no_wo having count(*) > 1
)
select 'hand_over' t, h.no_wo, null::text nama_project, count(*) n from hand_over h join dup using (no_wo) group by 1,2
union all select 'bom_project',      b.no_wo, max(b.nama_project), count(*) from bom_project b      join dup using (no_wo) group by 1,2
union all select 'qc_project',       q.no_wo, max(q.nama_project), count(*) from qc_project q       join dup using (no_wo) group by 1,2
union all select 'ded_project',      d.no_wo, max(d.nama_project), count(*) from ded_project d      join dup using (no_wo) group by 1,2
union all select 'schedule_project', s.no_wo, max(s.nama_project), count(*) from schedule_project s join dup using (no_wo) group by 1,2
union all select 'pengeluaran',      e.no_wo, null, count(*) from pengeluaran e    join dup using (no_wo) group by 1,2
union all select 'purchase_order',   o.no_wo, null, count(*) from purchase_order o join dup using (no_wo) group by 1,2
order by 2, 1;


-- ── LANGKAH 3a — PRATINJAU (hanya SELECT, TIDAK mengubah data) ───────────────
--  Aturan: per No WO ganda, DIPERTAHANKAN penawaran berstatus Deal/Closed dgn
--  tanggal deal PALING AWAL. Baris yang tampil di sini = penawaran yang AKAN
--  diberi No WO baru (beserta invoice & kwitansinya).
with latest as (
  select distinct on (no_penawaran) no_penawaran, no_wo, status,
         coalesce(tanggal_deal, tanggal) as tgl, nama_project
  from penawaran where coalesce(no_wo,'') <> ''
  order by no_penawaran, rev desc
), ranked as (
  select l.*,
         row_number() over (partition by no_wo
           order by (status in ('Deal','Closed')) desc, tgl nulls last, no_penawaran) as rn,
         count(*) over (partition by no_wo) as cnt
  from latest l
)
select no_wo, no_penawaran, nama_project, status, tgl as tgl_deal,
       case when rn = 1 then 'DIPERTAHANKAN' else 'DIBERI NO WO BARU' end as tindakan
from ranked where cnt > 1
order by no_wo, rn;


-- ── LANGKAH 3b — EKSEKUSI (jalankan bila pratinjau 3a sudah benar) ───────────
--  Satu blok DO = satu transaksi: semua berhasil, atau bila ada error tidak
--  ada yang berubah. Hasil dicatat di tabel wo_ganda_log untuk audit.
--  Catatan: jangan dijalankan 2x tanpa cek — setelah sukses, 3a harus kosong.
create table if not exists wo_ganda_log (
  dibuat_pada  timestamptz default now(),
  no_penawaran text, nama_project text, wo_lama text, wo_baru text
);

do $$
declare r record; v_baru text;
begin
  for r in
    with latest as (
      select distinct on (no_penawaran) no_penawaran, no_wo, status,
             coalesce(tanggal_deal, tanggal) as tgl, nama_project
      from penawaran where coalesce(no_wo,'') <> ''
      order by no_penawaran, rev desc
    ), ranked as (
      select l.*,
             row_number() over (partition by no_wo
               order by (status in ('Deal','Closed')) desc, tgl nulls last, no_penawaran) as rn,
             count(*) over (partition by no_wo) as cnt
      from latest l
    )
    select no_penawaran, no_wo as wo_lama, nama_project
    from ranked where cnt > 1 and rn > 1
    order by wo_lama, tgl nulls last
  loop
    v_baru := next_wo_seq();
    -- kwitansi dulu (lewat invoice ber-no_wo lama), lalu invoice, lalu penawaran
    update kwitansi k set no_wo = v_baru
      from invoice i
     where k.no_invoice = i.no_invoice and i.no_penawaran = r.no_penawaran and i.no_wo = r.wo_lama;
    update invoice   set no_wo = v_baru where no_penawaran = r.no_penawaran and no_wo = r.wo_lama;
    update penawaran set no_wo = v_baru where no_penawaran = r.no_penawaran and no_wo = r.wo_lama;
    insert into wo_ganda_log(no_penawaran, nama_project, wo_lama, wo_baru)
      values (r.no_penawaran, r.nama_project, r.wo_lama, v_baru);
  end loop;
end $$;

-- Lihat hasil yang baru diproses:
select * from wo_ganda_log order by dibuat_pada desc;


-- ── LANGKAH 4 — Verifikasi (harus 0 baris) ───────────────────────────────────
-- with latest as (select distinct on (no_penawaran) no_penawaran, no_wo from penawaran order by no_penawaran, rev desc)
-- select no_wo, count(*) from latest where coalesce(no_wo,'') <> '' group by no_wo having count(*) > 1;
