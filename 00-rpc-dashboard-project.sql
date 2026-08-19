-- =============================================================================
--  RPC: dashboard_project() — agregasi untuk "Dashboard Project" (owner/admin)
--  Semua dihitung di Postgres (server-side) → payload kecil, ringan.
--  Jalankan 1x di Supabase → SQL Editor. Aman diulang (create or replace).
-- =============================================================================
create or replace function dashboard_project()
returns json
language sql
security invoker
stable
as $$
with
sched as (
  select sp.no_wo, sp.nama_project, sp.nama_klien, sp.site_engineer,
    coalesce(avg(st.progress), 0) as prog,
    count(st.id) filter (where st.tanggal_selesai < current_date and coalesce(st.progress,0) < 100) as telat
  from schedule_project sp
  left join schedule_task st on st.no_wo = sp.no_wo
  group by sp.no_wo, sp.nama_project, sp.nama_klien, sp.site_engineer
)
select json_build_object(
  'wo', json_build_object(
    'aktif',   (select count(*) from work_order where status = 'Deal'),
    'selesai', (select count(*) from work_order where status = 'Closed'),
    'total',   (select count(*) from work_order),
    'nilaiKontrakAktif', (select coalesce(sum(grand_total), 0) from work_order where status = 'Deal'),
    'marginAvg', (select coalesce(round(avg(nullif(margin_persen, 0))::numeric, 1), 0) from work_order where status = 'Deal')
  ),
  'handOver', (
    select json_build_object(
      'selesai',     count(*) filter (where ho.status = 'Selesai'),
      'dijadwalkan', count(*) filter (where ho.status = 'Dijadwalkan'),
      'diminta',     count(*) filter (where ho.status = 'Diminta'),
      'belum',       count(*) filter (where ho.no_wo is null or ho.status is null or ho.status = 'Batal')
    )
    from work_order wo left join hand_over ho on ho.no_wo = wo.no_wo
    where wo.status = 'Deal'
  ),
  'schedule', json_build_object(
    'terjadwal',    (select count(*) from sched),
    'progressRata', (select coalesce(round(avg(prog)::numeric, 0), 0) from sched),
    'telat',        (select count(*) from sched where telat > 0)
  ),
  -- QC/DED/BOM dihitung per JUMLAH WO (bukan item). Per WO: ada item Rejected →
  -- "ada revisi"; semua Approved → "tuntas"; selain itu → "proses". Saling lepas.
  'qc', (select json_build_object(
      'approved', count(*) filter (where allappr and not rej),
      'pending',  count(*) filter (where not rej and not allappr),
      'rejected', count(*) filter (where rej)
    ) from (select no_wo, bool_or(status='Rejected') as rej, bool_and(status='Approved') as allappr from qc_item where coalesce(no_wo,'')<>'' group by no_wo) w),
  'ded', (select json_build_object(
      'approved', count(*) filter (where allappr and not rej),
      'pending',  count(*) filter (where not rej and not allappr),
      'rejected', count(*) filter (where rej)
    ) from (select no_wo, bool_or(status='Rejected') as rej, bool_and(status='Approved') as allappr from ded_item where coalesce(no_wo,'')<>'' group by no_wo) w),
  'bom', (select json_build_object(
      'approved', count(*) filter (where allappr and not rej),
      'pending',  count(*) filter (where not rej and not allappr),
      'rejected', count(*) filter (where rej)
    ) from (select no_wo, bool_or(status='Rejected') as rej, bool_and(status='Approved') as allappr from bom_item where coalesce(no_wo,'')<>'' group by no_wo) w),
  'maintenance', (select json_build_object('diajukan', count(*) filter (where status='Diajukan'), 'dijadwalkan', count(*) filter (where status='Dijadwalkan'), 'dikerjakan', count(*) filter (where status='Dikerjakan'), 'selesai', count(*) filter (where status='Selesai')) from maintenance),
  'trenDeal', (
    select coalesce(json_agg(t order by t.bln), '[]'::json) from (
      select to_char(date_trunc('month', tanggal_deal), 'YYYY-MM') as bln, count(*) as jml
      from work_order
      where tanggal_deal is not null and tanggal_deal >= (date_trunc('month', current_date) - interval '11 months')
      group by 1
    ) t
  ),
  'risiko', (
    select coalesce(json_agg(r order by r."tugasTelat" desc, r."qcRejected" desc), '[]'::json) from (
      select s.no_wo as "noWO", s.nama_project as "namaProject", s.nama_klien as "namaKlien",
        round(s.prog::numeric, 0) as progress, s.telat as "tugasTelat",
        (select count(*) from qc_item q where q.no_wo = s.no_wo and q.status = 'Rejected') as "qcRejected"
      from sched s
      where s.telat > 0 or exists (select 1 from qc_item q where q.no_wo = s.no_wo and q.status = 'Rejected')
      limit 10
    ) r
  ),
  'kinerjaSE', (
    select coalesce(json_agg(x order by x.item desc), '[]'::json) from (
      select coalesce(nullif(diupload_oleh, ''), '-') as nama,
        count(*) as item,
        count(*) filter (where status='Approved') as approved,
        count(*) filter (where status='Pending')  as pending,
        count(*) filter (where status='Rejected') as rejected
      from qc_item
      group by 1
      limit 12
    ) x
  )
);
$$;

grant execute on function dashboard_project() to authenticated;
