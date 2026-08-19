-- =============================================================================
--  RPC: dashboard_procurement() — agregasi "Dashboard Pembelian & Gudang"
--  Server-side (Postgres) → payload kecil, ringan. Jalankan 1x di Supabase.
--  Aman diulang (create or replace).
-- =============================================================================
create or replace function dashboard_procurement()
returns json
language sql
security invoker
stable
as $$
select json_build_object(
  'po', json_build_object(
    'totalNilai',     (select coalesce(sum(grand_total), 0) from purchase_order where status_po <> 'Batal'),
    'outstanding',    (select coalesce(sum(greatest(grand_total - coalesce(total_dibayar, 0), 0)), 0) from purchase_order where status_po <> 'Batal'),
    'aktif',          (select count(*) from purchase_order where status_po not in ('Selesai', 'Batal')),
    'menungguTerima', (select count(*) from purchase_order where status_po in ('Menunggu Gudang', 'Menunggu Penerimaan Gudang', 'Diterima Sebagian'))
  ),
  'poStatus', (
    select coalesce(json_object_agg(status_po, c), '{}'::json)
    from (select coalesce(nullif(status_po, ''), 'Lainnya') as status_po, count(*) c from purchase_order group by 1) s
  ),
  'payReq', json_build_object(
    'menunggu',      (select count(*) from po_payment_request where status = 'Menunggu'),
    'nilaiMenunggu', (select coalesce(sum(jumlah), 0) from po_payment_request where status = 'Menunggu')
  ),
  'trenBeli', (
    select coalesce(json_agg(t order by t.bln), '[]'::json) from (
      select to_char(date_trunc('month', tanggal), 'YYYY-MM') as bln, sum(grand_total) as nilai
      from purchase_order
      where status_po <> 'Batal' and tanggal is not null and tanggal >= (date_trunc('month', current_date) - interval '11 months')
      group by 1
    ) t
  ),
  'topSupplier', (
    select coalesce(json_agg(x order by x.nilai desc), '[]'::json) from (
      select coalesce(nullif(nama_supplier, ''), '-') as nama, sum(grand_total) as nilai, count(*) as jml
      from purchase_order where status_po <> 'Batal'
      group by 1 order by sum(grand_total) desc limit 6
    ) x
  ),
  'stok', json_build_object(
    'totalNilai', (select coalesce(sum(nilai_stok), 0) from stok),
    'jumlahItem', (select count(*) from stok),
    'habis',      (select count(*) from stok where coalesce(qty_tersedia, 0) <= 0),
    'menipis',    (select count(*) from stok where coalesce(qty_tersedia, 0) > 0 and coalesce(qty_tersedia, 0) <= 5)
  ),
  'stokRequest', json_build_object(
    'menunggu', (select count(*) from stok_request where status = 'Menunggu')
  ),
  'mutasiBulanIni', json_build_object(
    'masuk',  (select coalesce(sum(qty_masuk  * coalesce(harga_satuan, 0)), 0) from mutasi_stok where tanggal >= date_trunc('month', current_date)),
    'keluar', (select coalesce(sum(qty_keluar * coalesce(harga_satuan, 0)), 0) from mutasi_stok where tanggal >= date_trunc('month', current_date))
  ),
  'itemMenipis', (
    select coalesce(json_agg(x order by x.qty asc), '[]'::json) from (
      select id_produk as id, nama_produk as nama, coalesce(qty_tersedia, 0) as qty, satuan
      from stok where coalesce(qty_tersedia, 0) <= 5
      order by qty_tersedia asc limit 10
    ) x
  )
);
$$;

grant execute on function dashboard_procurement() to authenticated;
