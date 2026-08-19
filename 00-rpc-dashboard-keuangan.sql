-- =============================================================================
--  RPC: dashboard_keuangan() — agregasi "Dashboard Keuangan"
--  (Saldo kas per akun tetap dari route getSaldoAkun yang sudah ada.)
--  Server-side (Postgres) → payload kecil. Jalankan 1x di Supabase.
--  Catatan: pengeluaran "Penggunaan Stok"/akun AP001 TIDAK dihitung sebagai
--  arus kas keluar (itu pemakaian stok, bukan uang keluar).
-- =============================================================================
create or replace function dashboard_keuangan()
returns json
language sql
security invoker
stable
as $$
select json_build_object(
  'bulanIni', json_build_object(
    'pemasukan',   (select coalesce(sum(jumlah), 0) from pemasukan where tanggal >= date_trunc('month', current_date)),
    'pengeluaran', (select coalesce(sum(total), 0) from pengeluaran where tanggal >= date_trunc('month', current_date) and coalesce(id_akun, '') <> 'AP001' and coalesce(sumber, '') <> 'Penggunaan Stok')
  ),
  'cashflow', (
    select coalesce(json_agg(t order by t.bln), '[]'::json) from (
      select bln, coalesce(sum(masuk), 0) as masuk, coalesce(sum(keluar), 0) as keluar from (
        select to_char(date_trunc('month', tanggal), 'YYYY-MM') bln, jumlah::numeric masuk, 0::numeric keluar
        from pemasukan where tanggal is not null and tanggal >= (date_trunc('month', current_date) - interval '11 months')
        union all
        select to_char(date_trunc('month', tanggal), 'YYYY-MM') bln, 0::numeric, total::numeric
        from pengeluaran where tanggal is not null and tanggal >= (date_trunc('month', current_date) - interval '11 months')
          and coalesce(id_akun, '') <> 'AP001' and coalesce(sumber, '') <> 'Penggunaan Stok'
      ) u group by bln
    ) t
  ),
  'piutang', (
    select json_build_object(
      'total',  coalesce(sum(total), 0),
      'jumlah', count(*),
      'aging',  json_build_object(
        'b30', coalesce(sum(total) filter (where current_date - tanggal <= 30), 0),
        'b60', coalesce(sum(total) filter (where current_date - tanggal between 31 and 60), 0),
        'b90', coalesce(sum(total) filter (where current_date - tanggal > 60), 0)
      )
    )
    from invoice where coalesce(status_bayar, '') <> 'Lunas'
  ),
  'hutang', (
    select json_build_object(
      'total',  coalesce(sum(greatest(grand_total - coalesce(total_dibayar, 0), 0)), 0),
      'jumlah', count(*)
    )
    from purchase_order where status_po <> 'Batal' and coalesce(status_bayar, '') <> 'Lunas'
  ),
  'profit', (
    select json_build_object(
      'kontrak',   coalesce(sum(greatest(subtotal - coalesce(diskon, 0), 0)), 0),
      'hpp',       coalesce(sum(hpp), 0),
      'profit',    coalesce(sum(profit), 0),
      'marginAvg', coalesce(round(avg(nullif(margin_persen, 0))::numeric, 1), 0)
    )
    from work_order where status = 'Deal'
  ),
  'marginTipis', (
    select coalesce(json_agg(x order by x.margin asc), '[]'::json) from (
      select no_wo as "noWO", nama_project as "namaProject", nama_klien as "namaKlien",
        greatest(subtotal - coalesce(diskon, 0), 0) as kontrak,
        coalesce(round(margin_persen::numeric, 1), 0) as margin
      from work_order where status = 'Deal'
      order by margin_persen asc nulls first limit 8
    ) x
  )
);
$$;

grant execute on function dashboard_keuangan() to authenticated;
