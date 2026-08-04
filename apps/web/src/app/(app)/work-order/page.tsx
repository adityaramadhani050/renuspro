import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { parseListParams, rangeFor, likePattern, formatRupiah } from '@/lib/query';
import { Pagination } from '@/components/Pagination';
import { SearchBox } from '@/components/SearchBox';
import type { WorkOrderRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Daftar Work Order.
 *
 * Menggantikan getWorkOrderDashboard() (WorkOrder.gs:120), yang membaca
 * Penawaran_Main, Invoice_Main, dan Kwitansi_Main secara penuh lalu
 * menggabungkannya dengan loop di JavaScript. Di sini penggabungan itu sudah
 * jadi view `v_work_orders`, dan yang berpindah hanya satu halaman data.
 */
export default async function WorkOrderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = parseListParams(raw);
  const outstandingOnly = raw.outstanding === '1';
  const [from, to] = rangeFor(params);

  const supabase = await createClient();

  let query = supabase
    .from('v_work_orders')
    .select(
      'id, wo_number, project_name, customer_name, owner_name, deal_date, ' +
        'contract_value_gross, billed_total, paid_total, outstanding, ' +
        'uninvoiced_gross, invoice_count',
      { count: 'exact' }
    )
    .order('wo_number', { ascending: false });

  if (params.q) {
    const pattern = likePattern(params.q);
    query = query.or(
      `wo_number.ilike.${pattern},project_name.ilike.${pattern},customer_name.ilike.${pattern}`
    );
  }
  if (outstandingOnly) query = query.gt('outstanding', 0);

  const { data, count, error } = await query
    .range(from, to)
    .returns<WorkOrderRow[]>();

  const filterHref = (on: boolean) => {
    const p = new URLSearchParams();
    if (params.q) p.set('q', params.q);
    if (on) p.set('outstanding', '1');
    const qs = p.toString();
    return qs ? `/work-order?${qs}` : '/work-order';
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>Work Order</h2>
        <SearchBox
          basePath="/work-order"
          q={params.q}
          perPage={params.perPage}
          placeholder="Cari No. WO, project, atau klien…"
        />
      </div>

      <div className="tabbar">
        <Link className={!outstandingOnly ? 'active' : ''} href={filterHref(false)}>
          Semua
        </Link>
        <Link className={outstandingOnly ? 'active' : ''} href={filterHref(true)}>
          Masih ada piutang
        </Link>
      </div>

      {error ? (
        <div className="empty">Gagal memuat data: {error.message}</div>
      ) : !data || data.length === 0 ? (
        <div className="empty">
          {params.q || outstandingOnly
            ? 'Tidak ada Work Order yang cocok dengan filter ini.'
            : 'Belum ada Work Order. WO terbit otomatis saat penawaran berstatus Deal.'}
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 80 }}>No. WO</th>
              <th>Project</th>
              <th style={{ width: 180 }}>Klien</th>
              <th className="num" style={{ width: 150 }}>Nilai Kontrak</th>
              <th className="num" style={{ width: 140 }}>Ditagih</th>
              <th className="num" style={{ width: 140 }}>Terbayar</th>
              <th className="num" style={{ width: 140 }}>Piutang</th>
              <th className="num" style={{ width: 140 }}>Belum Ditagih</th>
            </tr>
          </thead>
          <tbody>
            {data.map((w) => (
              <tr key={w.id}>
                <td>
                  <Link href={`/work-order/${w.id}`} className="link-strong">
                    {w.wo_number}
                  </Link>
                </td>
                <td>{w.project_name}</td>
                <td>{w.customer_name}</td>
                <td className="num">{formatRupiah(w.contract_value_gross)}</td>
                <td className="num">{formatRupiah(w.billed_total)}</td>
                <td className="num">{formatRupiah(w.paid_total)}</td>
                <td className={`num${w.outstanding > 0 ? ' amount-due' : ''}`}>
                  {formatRupiah(w.outstanding)}
                </td>
                <td className="num muted">{formatRupiah(w.uninvoiced_gross)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination
        basePath="/work-order"
        page={params.page}
        perPage={params.perPage}
        count={count ?? 0}
        q={params.q}
        extra={outstandingOnly ? { outstanding: '1' } : undefined}
      />
    </div>
  );
}
