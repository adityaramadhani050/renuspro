-- ============================================================================
-- RenusPro — 19. Dashboard Sales
-- ----------------------------------------------------------------------------
-- Page_Dashboard.html menghitung SELURUH angka di browser: getDashboardRawData()
-- mengirim setiap baris penawaran, lalu JS_Dashboard.html (37 KB) menjumlahkan,
-- mengelompokkan, dan mengurutkannya di sana. Itu sebabnya halaman ini yang
-- paling lambat dibuka — dan makin lambat setiap penawaran bertambah.
--
-- Di sini seluruh agregasi dikerjakan Postgres, dan yang berpindah ke browser
-- hanya angka jadi. Bentuk laporannya tidak berubah sedikit pun.
--
-- Semua fungsi di bawah SECURITY INVOKER (bawaan) dan membaca view ber-RLS,
-- sehingga sales tetap hanya melihat angkanya sendiri — tanpa satu pun
-- pemeriksaan peran ditulis ulang di sini.
-- ============================================================================

-- ── Target tahunan ─────────────────────────────────────────────────────────
-- Sistem lama menampilkan target tahunan Rp 25 M sementara jumlah target
-- bulanan seluruh sales adalah Rp 2,3 M (× 12 = Rp 27,6 M). Keduanya angka
-- yang berbeda, jadi target tahunan jelas ditetapkan tersendiri — bukan
-- turunan dari target bulanan.
--
-- Menebaknya dengan perkalian akan menghasilkan angka yang SALAH tapi masuk
-- akal, dan itu jenis kesalahan yang paling lama tidak ketahuan. Jadi nilainya
-- disimpan eksplisit, dengan perkalian hanya sebagai cadangan bila belum diisi.
create or replace function target_tahunan()
returns numeric language sql stable
as $$
  select coalesce(
    (select (value ->> 'nilai')::numeric from app_settings where key = 'TARGET_TAHUNAN'),
    (select coalesce(sum(monthly_target), 0) * 12 from profiles where is_active)
  )
$$;

comment on function target_tahunan() is
  'Target penjualan setahun. Diisi lewat app_settings.TARGET_TAHUNAN; kalau '
  'kosong, dipakai jumlah target bulanan × 12 sebagai perkiraan.';


-- ── Kartu KPI + statistik konversi ─────────────────────────────────────────
create or replace function dashboard_kpi(
  p_from date default null,
  p_to   date default null
)
returns table (
  revenue_deal        numeric,
  revenue_prev        numeric,
  jumlah_penawaran    bigint,
  penawaran_prev      bigint,
  total_deal          bigint,
  deal_prev           bigint,
  pipeline_nilai      numeric,
  pipeline_jumlah     bigint,
  target_bulanan      numeric,
  realisasi_bulanan   numeric,
  target_setahun      numeric,
  realisasi_setahun   numeric,
  win_rate_pct        numeric,
  avg_nilai_deal      numeric,
  avg_margin_pct      numeric,
  avg_sales_cycle     numeric
)
language sql
stable
as $$
  with rentang as (
    select
      coalesce(p_from, date_trunc('month', current_date)::date)                    as dari,
      coalesce(p_to, (date_trunc('month', current_date) + interval '1 month -
                      1 day')::date)                                              as sampai
  ),
  -- Periode pembanding: sepanjang periode berjalan, tepat sebelumnya.
  sebelum as (
    select (dari - (sampai - dari + 1))::date as dari,
           (dari - 1)::date                   as sampai
      from rentang
  ),
  kini as (
    select * from v_quotations v, rentang r
     where v.issue_date between r.dari and r.sampai
  ),
  lalu as (
    select * from v_quotations v, sebelum s
     where v.issue_date between s.dari and s.sampai
  )
  select
    (select coalesce(sum(grand_total) filter (where status = 'Deal'), 0) from kini),
    (select coalesce(sum(grand_total) filter (where status = 'Deal'), 0) from lalu),
    (select count(*) from kini),
    (select count(*) from lalu),
    (select count(*) filter (where status = 'Deal') from kini),
    (select count(*) filter (where status = 'Deal') from lalu),

    -- Pipeline TIDAK dibatasi periode: yang ditanyakan "berapa yang sedang
    -- berjalan sekarang", bukan "berapa yang dibuat bulan ini".
    (select coalesce(sum(grand_total), 0) from v_quotations where status = 'On-Progress'),
    (select count(*) from v_quotations where status = 'On-Progress'),

    (select coalesce(sum(monthly_target), 0) from profiles where is_active),
    (select coalesce(sum(grand_total) filter (where status = 'Deal'), 0)
       from v_quotations
      where deal_date >= date_trunc('month', current_date)),
    target_tahunan(),
    (select coalesce(sum(grand_total) filter (where status = 'Deal'), 0)
       from v_quotations
      where deal_date >= date_trunc('year', current_date)),

    (select round(case when count(*) filter (where status in ('Deal','Fail')) = 0 then 0
                       else count(*) filter (where status = 'Deal')::numeric * 100
                            / count(*) filter (where status in ('Deal','Fail'))
                  end, 1) from kini),
    (select round(coalesce(avg(grand_total) filter (where status = 'Deal'), 0), 0) from kini),
    (select round(coalesce(avg(margin_pct)  filter (where status = 'Deal'), 0), 1) from kini),

    -- Sales cycle: jarak dari tanggal penawaran ke tanggal Deal.
    (select round(coalesce(avg(deal_date::date - issue_date), 0), 0)
       from kini where status = 'Deal' and deal_date is not null);
$$;

grant execute on function dashboard_kpi(date, date) to authenticated;
grant execute on function target_tahunan() to authenticated;


-- ── Tren revenue bulanan ───────────────────────────────────────────────────
-- generate_series dipakai supaya bulan tanpa deal tetap muncul sebagai nol.
-- Tanpa itu grafiknya melompati bulan kosong dan garisnya berbohong.
create or replace function dashboard_trend(p_tahun int default null)
returns table (bulan int, revenue numeric)
language sql
stable
as $$
  with tahun as (select coalesce(p_tahun, extract(year from current_date)::int) as th)
  select
    b::int,
    coalesce((
      select sum(v.grand_total)
        from v_quotations v, tahun
       where v.status = 'Deal'
         and v.deal_date is not null
         and extract(year  from v.deal_date) = tahun.th
         and extract(month from v.deal_date) = b
    ), 0)
  from generate_series(1, 12) b;
$$;

grant execute on function dashboard_trend(int) to authenticated;


-- ── Leaderboard & detail per sales ─────────────────────────────────────────
create or replace function sales_leaderboard(
  p_from date default null,
  p_to   date default null
)
returns table (
  owner_id       uuid,
  nama_sales     text,
  penawaran      bigint,
  nilai_total    numeric,
  deal           bigint,
  revenue_deal   numeric,
  avg_margin_pct numeric,
  win_rate_pct   numeric,
  target         numeric,
  capaian_pct    numeric
)
language sql
stable
as $$
  with rentang as (
    select
      coalesce(p_from, date_trunc('month', current_date)::date) as dari,
      coalesce(p_to, (date_trunc('month', current_date) + interval '1 month -
                      1 day')::date)                            as sampai
  ),
  kini as (
    select v.* from v_quotations v, rentang r
     where v.issue_date between r.dari and r.sampai
  )
  select
    p.id,
    p.full_name,
    count(k.id),
    coalesce(sum(k.grand_total), 0),
    count(k.id) filter (where k.status = 'Deal'),
    coalesce(sum(k.grand_total) filter (where k.status = 'Deal'), 0),
    round(coalesce(avg(k.margin_pct) filter (where k.status = 'Deal'), 0), 1),
    round(case when count(k.id) filter (where k.status in ('Deal','Fail')) = 0 then 0
               else count(k.id) filter (where k.status = 'Deal')::numeric * 100
                    / count(k.id) filter (where k.status in ('Deal','Fail'))
          end, 1),
    p.monthly_target,
    round(case when p.monthly_target = 0 then 0
               else coalesce(sum(k.grand_total) filter (where k.status = 'Deal'), 0)
                    * 100 / p.monthly_target
          end, 1)
  -- LEFT JOIN, bukan INNER: sales tanpa penawaran periode ini tetap muncul
  -- dengan angka nol. Menghilangkan mereka dari papan peringkat justru
  -- menyembunyikan hal yang paling perlu dilihat.
  from profiles p
  left join kini k on k.owner_id = p.id
  where p.is_active
    and p.role in ('sales', 'leadsales')
  group by p.id, p.full_name, p.monthly_target
  order by 6 desc, 4 desc;
$$;

grant execute on function sales_leaderboard(date, date) to authenticated;


-- ── Pipeline health ────────────────────────────────────────────────────────
-- Umur dihitung dari tanggal revisi TERAKHIR, bukan tanggal penawaran dibuat:
-- penawaran yang baru direvisi minggu lalu sedang berjalan, betapapun tuanya
-- nomornya. Memakai tanggal awal akan menandai penawaran yang paling aktif
-- sebagai yang paling basi.
create or replace function pipeline_health()
returns table (
  pipeline_nilai   numeric,
  pipeline_jumlah  bigint,
  sisa_target      numeric,
  coverage         numeric,
  umur_0_30_n      bigint, umur_0_30_v   numeric,
  umur_31_60_n     bigint, umur_31_60_v  numeric,
  umur_61_90_n     bigint, umur_61_90_v  numeric,
  umur_90plus_n    bigint, umur_90plus_v numeric
)
language sql
stable
as $$
  with aktif as (
    select v.*, current_date - v.issue_date as umur
      from v_quotations v
     where v.status = 'On-Progress'
  ),
  sisa as (
    select greatest(
      target_tahunan() - coalesce((
        select sum(grand_total) from v_quotations
         where status = 'Deal' and deal_date >= date_trunc('year', current_date)
      ), 0), 0) as nilai
  )
  select
    coalesce(sum(grand_total), 0),
    count(*),
    (select nilai from sisa),
    round(case when (select nilai from sisa) = 0 then 0
               else coalesce(sum(grand_total), 0) / (select nilai from sisa)
          end, 1),
    count(*) filter (where umur <= 30),  coalesce(sum(grand_total) filter (where umur <= 30), 0),
    count(*) filter (where umur between 31 and 60), coalesce(sum(grand_total) filter (where umur between 31 and 60), 0),
    count(*) filter (where umur between 61 and 90), coalesce(sum(grand_total) filter (where umur between 61 and 90), 0),
    count(*) filter (where umur > 90),   coalesce(sum(grand_total) filter (where umur > 90), 0)
  from aktif;
$$;

grant execute on function pipeline_health() to authenticated;


-- ── Penawaran yang mengendap ───────────────────────────────────────────────
create or replace function pipeline_stale(p_min_hari int default 30)
returns table (
  owner_id     uuid,
  nama_sales   text,
  quotation_id uuid,
  quote_number text,
  issue_date   date,
  customer     text,
  project      text,
  nilai        numeric,
  umur_hari    int
)
language sql
stable
as $$
  select
    v.owner_id,
    coalesce(v.owner_name, '(tanpa sales)'),
    v.id,
    v.quote_number,
    v.issue_date,
    v.customer_name,
    v.project_name,
    v.grand_total,
    (current_date - v.issue_date)::int
  from v_quotations v
  where v.status = 'On-Progress'
    and current_date - v.issue_date > p_min_hari
  order by (current_date - v.issue_date) desc;
$$;

grant execute on function pipeline_stale(int) to authenticated;
