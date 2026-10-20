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


-- ── LANGKAH 3 — Perbaikan (DRY-RUN: diakhiri ROLLBACK) ───────────────────────
--  Aturan: per No WO ganda, DIPERTAHANKAN penawaran yang status Deal/Closed &
--  tanggal deal PALING AWAL. Penawaran lain diberi No WO BARU (next_wo_seq).
--  Ikut dipindah otomatis: invoice (berdasar no_penawaran) & kwitansinya.
--  Lihat hasil tabel di akhir. Bila sudah benar, ganti ROLLBACK → COMMIT.
begin;

create temp table _wo_fix on commit drop as
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
select no_penawaran, no_wo as wo_lama, nama_project, status, tgl, null::text as wo_baru
from ranked where cnt > 1 and rn > 1;

update _wo_fix set wo_baru = next_wo_seq();          -- nomor baru, satu per baris

-- kwitansi dulu (lewat invoice yg masih ber-no_wo lama), lalu invoice, lalu penawaran
update kwitansi k set no_wo = f.wo_baru
  from invoice i join _wo_fix f on i.no_penawaran = f.no_penawaran and i.no_wo = f.wo_lama
 where k.no_invoice = i.no_invoice;
update invoice i set no_wo = f.wo_baru
  from _wo_fix f where i.no_penawaran = f.no_penawaran and i.no_wo = f.wo_lama;
update penawaran p set no_wo = f.wo_baru
  from _wo_fix f where p.no_penawaran = f.no_penawaran and p.no_wo = f.wo_lama;

select no_penawaran, nama_project, status, tgl as tgl_deal, wo_lama, wo_baru from _wo_fix order by wo_lama;

rollback;   -- ← ganti menjadi COMMIT; setelah hasil di atas dicek benar


-- ── LANGKAH 4 — Verifikasi (harus 0 baris) ───────────────────────────────────
-- with latest as (select distinct on (no_penawaran) no_penawaran, no_wo from penawaran order by no_penawaran, rev desc)
-- select no_wo, count(*) from latest where coalesce(no_wo,'') <> '' group by no_wo having count(*) > 1;
