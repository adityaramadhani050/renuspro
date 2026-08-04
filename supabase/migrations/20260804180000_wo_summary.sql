-- ============================================================================
-- RenusPro — 18. Ringkasan Work Order
-- ----------------------------------------------------------------------------
-- Page_WorkOrder.html menampilkan lima kartu ringkasan di atas tabelnya, dan
-- angkanya ikut berubah mengikuti pencarian. Sistem lama sanggup melakukan itu
-- karena memang memuat SELURUH Work Order ke browser lebih dulu — sekaligus
-- alasan halaman itu lambat.
--
-- Di sini agregatnya dihitung di database, jadi yang berpindah ke browser
-- tetap satu halaman data. Filternya diterima sebagai argumen supaya kartu dan
-- tabel selalu bercerita tentang himpunan yang sama; kartu yang menjumlahkan
-- semua sementara tabel menampilkan hasil pencarian adalah salah satu cara
-- tercepat membuat orang salah membaca angka.
--
-- SECURITY INVOKER (bawaan): fungsi ini membaca v_work_orders yang sudah
-- ber-RLS, sehingga sales tetap hanya menjumlahkan miliknya sendiri.
-- ============================================================================

create or replace function wo_summary(
  q text default null,
  outstanding_only boolean default false
)
returns table (
  total_wo          bigint,
  nilai_kontrak     numeric,
  total_ditagih     numeric,
  total_lunas       numeric,
  total_outstanding numeric
)
language sql
stable
as $$
  select
    count(*)                                as total_wo,
    coalesce(sum(contract_value_gross), 0)  as nilai_kontrak,
    coalesce(sum(billed_total), 0)          as total_ditagih,
    coalesce(sum(paid_total), 0)            as total_lunas,
    coalesce(sum(outstanding), 0)           as total_outstanding
  from v_work_orders w
  where (
          q is null or q = ''
          or w.wo_number    ilike '%' || q || '%'
          or w.project_name ilike '%' || q || '%'
          or w.customer_name ilike '%' || q || '%'
        )
    and (not outstanding_only or w.outstanding > 0)
$$;

comment on function wo_summary(text, boolean) is
  'Kartu ringkasan halaman Work Order. Menerima filter yang sama dengan '
  'tabelnya supaya keduanya selalu menghitung himpunan yang sama.';

grant execute on function wo_summary(text, boolean) to authenticated;
