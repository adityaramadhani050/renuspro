-- ============================================================================
-- Tes Dashboard Sales
--
-- Yang diuji bukan "apakah angkanya keluar", melainkan tiga keputusan yang
-- mudah salah dan sulit ketahuan kalau salah:
--   • jendela periode pembanding
--   • sales tanpa penawaran tetap muncul di papan peringkat
--   • batas kelompok umur pipeline
-- ============================================================================

\set ON_ERROR_STOP on
\echo '▸ Dashboard Sales'

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a001', 'sales-a@renus.test'),
  ('00000000-0000-0000-0000-00000000a002', 'sales-b@renus.test')
on conflict do nothing;

insert into profiles (id, legacy_code, full_name, username, role, monthly_target) values
  ('00000000-0000-0000-0000-00000000a001', 'D1', 'Sales Aktif', 'salesaktif', 'sales', 100000000),
  ('00000000-0000-0000-0000-00000000a002', 'D2', 'Sales Diam',  'salesdiam',  'sales', 200000000)
on conflict (id) do nothing;

insert into customers (id, legacy_code, name) values
  ('00000000-0000-0000-0000-0000000cd001', 'KDASH', 'PT UJI DASHBOARD')
on conflict (id) do nothing;

-- Penawaran disisipkan langsung, seperti tes perilaku lainnya: trigger yang
-- menjaga current_revision_id ikut berjalan, jadi v_quotations tetap terisi
-- persis seperti pada data sungguhan.
insert into quotations (id, quote_number, customer_id, project_name, owner_id, status, deal_date) values
  ('00000000-0000-0000-0000-00000000da01', '900/QUOT/VIII/2026',
   '00000000-0000-0000-0000-0000000cd001', 'Deal Bulan Ini',
   '00000000-0000-0000-0000-00000000a001', 'Deal', now()),
  ('00000000-0000-0000-0000-00000000da02', '901/QUOT/VII/2026',
   '00000000-0000-0000-0000-0000000cd001', 'Deal Bulan Lalu',
   '00000000-0000-0000-0000-00000000a001', 'Deal',
   date_trunc('month', current_date) - interval '10 days'),
  ('00000000-0000-0000-0000-00000000da03', '902/QUOT/IV/2026',
   '00000000-0000-0000-0000-0000000cd001', 'Mengendap Lama',
   '00000000-0000-0000-0000-00000000a001', 'On-Progress', null)
on conflict (quote_number) do nothing;

insert into quotation_revisions
  (quotation_id, rev, issue_date, valid_until, subtotal, discount, tax_amount,
   grand_total, total_cost, est_profit, margin_pct)
values
  ('00000000-0000-0000-0000-00000000da01', 0, current_date, current_date + 30,
   500000000, 0, 55000000, 555000000, 350000000, 150000000, 30),
  ('00000000-0000-0000-0000-00000000da02', 0,
   (date_trunc('month', current_date) - interval '10 days')::date,
   current_date, 300000000, 0, 33000000, 333000000, 210000000, 90000000, 30),
  ('00000000-0000-0000-0000-00000000da03', 0, current_date - 100, current_date,
   200000000, 0, 22000000, 222000000, 140000000, 60000000, 30)
on conflict (quotation_id, rev) do nothing;


-- ============================================================================
-- 1. Periode pembanding memakai jendela sepanjang periode berjalan
-- ============================================================================
do $$
declare k record;
begin
  select * into k from dashboard_kpi(
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date);

  perform assert_true(k.revenue_deal > 0, 'revenue bulan ini terhitung');
  perform assert_true(k.revenue_prev > 0,
                      'deal bulan lalu masuk kolom pembanding, bukan kolom berjalan');
  perform assert_true(k.revenue_deal <> k.revenue_prev,
                      'periode berjalan dan pembanding memang dua himpunan berbeda');

  -- Pipeline sengaja TIDAK dibatasi periode: pertanyaannya "berapa yang
  -- sedang berjalan", bukan "berapa yang dibuat bulan ini".
  perform assert_true(k.pipeline_jumlah >= 1,
                      'pipeline mencakup penawaran lama yang masih berjalan');
end $$;


-- ============================================================================
-- 2. Sales tanpa penawaran tetap muncul
--
-- Kalau ia hilang dari papan peringkat, orang yang paling perlu diperhatikan
-- justru jadi yang paling tidak terlihat.
-- ============================================================================
do $$
declare n int; capaian numeric;
begin
  select count(*) into n from sales_leaderboard(
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date)
   where nama_sales = 'Sales Diam';
  perform assert_eq(n, 1, 'sales tanpa penawaran tetap muncul di papan peringkat');

  select l.capaian_pct into capaian from sales_leaderboard(
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date) l
   where l.nama_sales = 'Sales Diam';
  perform assert_true(capaian = 0, 'capaiannya nol, bukan kosong');
end $$;


-- ============================================================================
-- 3. Kelompok umur pipeline
-- ============================================================================
do $$
declare h record;
begin
  select * into h from pipeline_health();
  perform assert_true(h.umur_90plus_n >= 1,
                      'penawaran berumur 100 hari masuk kelompok >90 hari');
  perform assert_true(h.umur_0_30_n = 0 or h.umur_0_30_v >= 0,
                      'kelompok 0-30 hari terhitung tanpa error');
  perform assert_true(h.pipeline_nilai > 0, 'nilai pipeline terhitung');
end $$;


-- ============================================================================
-- 4. Penawaran mengendap tersaring menurut umur
-- ============================================================================
do $$
declare n int;
begin
  select count(*) into n from pipeline_stale(30)
   where quote_number = '902/QUOT/IV/2026';
  perform assert_eq(n, 1, 'penawaran 100 hari muncul sebagai mengendap');

  select count(*) into n from pipeline_stale(200);
  perform assert_eq(n, 0, 'ambang umur benar-benar dipakai sebagai penyaring');
end $$;


-- ============================================================================
-- 5. Tren bulanan selalu 12 baris
--
-- Bulan tanpa deal harus tetap muncul sebagai nol; kalau dilewati, garis
-- grafiknya menyambung antar bulan yang tidak bersebelahan dan berbohong.
-- ============================================================================
do $$
declare n int;
begin
  select count(*) into n from dashboard_trend(extract(year from current_date)::int);
  perform assert_eq(n, 12, 'tren bulanan selalu 12 baris, termasuk bulan kosong');
end $$;

\echo '✓ Tes Dashboard Sales lulus.'
