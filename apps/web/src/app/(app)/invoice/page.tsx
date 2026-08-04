import Link from 'next/link';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { parseListParams, rangeFor, likePattern, formatRupiah } from '@/lib/query';
import { Pagination } from '@/components/Pagination';
import { SearchBox } from '@/components/SearchBox';
import { StatusBadge } from '@/components/StatusBadge';
import { PaymentStatusForm } from './PaymentStatusForm';
import type { InvoiceRow } from '@/lib/types';
import { canManageFinance } from '@/lib/roles';

export const dynamic = 'force-dynamic';

const AGING_LABEL: Record<string, string> = {
  current: '< 30 hari',
  gte30: '30–59 hari',
  gte60: '60–89 hari',
  gte90: '≥ 90 hari',
};

/**
 * Daftar Invoice.
 *
 * Menggantikan getInvoiceList() (Invoice.gs:437) beserta perhitungan umur
 * piutang yang dilakukan di klien (_agingBucket, FinanceReport.gs:37). Bucket
 * umur kini kolom di view `v_invoices`, jadi bisa difilter dan diurutkan
 * database — bukan dihitung ulang di browser setiap kali halaman dibuka.
 */
export default async function InvoicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = parseListParams(raw);
  const status = typeof raw.status === 'string' ? raw.status : '';
  const [from, to] = rangeFor(params);

  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const canWriteFinance = !!profile && canManageFinance(profile.role);

  let query = supabase
    .from('v_invoices')
    .select(
      'id, invoice_number, issue_date, type, percent, wo_number, quote_number, ' +
        'is_predeal, is_legacy, legacy_reference, customer_name, project_name, dpp, vat_amount, total, ' +
        'payment_status, paid_at, receipt_number, aging_bucket, days_outstanding',
      { count: 'exact' }
    )
    .order('issue_date', { ascending: false })
    .order('invoice_number', { ascending: false });

  if (params.q) {
    const pattern = likePattern(params.q);
    query = query.or(
      `invoice_number.ilike.${pattern},customer_name.ilike.${pattern},project_name.ilike.${pattern}`
    );
  }
  if (status === 'Lunas' || status === 'Belum Lunas') {
    query = query.eq('payment_status', status);
  }

  const { data, count, error } = await query.range(from, to).returns<InvoiceRow[]>();

  const filterHref = (s: string) => {
    const p = new URLSearchParams();
    if (params.q) p.set('q', params.q);
    if (s) p.set('status', s);
    const qs = p.toString();
    return qs ? `/invoice?${qs}` : '/invoice';
  };

  return (
    <>
      <div className="page-head">
        <h2>Invoice</h2>
        <div className="filters">
          <SearchBox
            basePath="/invoice"
            q={params.q}
            perPage={params.perPage}
            placeholder="Cari nomor, klien, atau project…"
          />
          {canWriteFinance ? (
            <Link className="btn btn-primary" href="/invoice/baru">
              + Terbitkan Invoice
            </Link>
          ) : null}
        </div>
      </div>

      <div className="card">

      <div className="tabbar">
        <Link className={!status ? 'active' : ''} href={filterHref('')}>
          Semua
        </Link>
        <Link className={status === 'Belum Lunas' ? 'active' : ''} href={filterHref('Belum Lunas')}>
          Belum Lunas
        </Link>
        <Link className={status === 'Lunas' ? 'active' : ''} href={filterHref('Lunas')}>
          Lunas
        </Link>
      </div>

      {error ? (
        <div className="empty">Gagal memuat data: {error.message}</div>
      ) : !data || data.length === 0 ? (
        <div className="empty">
          {params.q || status
            ? 'Tidak ada invoice yang cocok dengan filter ini.'
            : 'Belum ada invoice.'}
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 170 }}>No. Invoice</th>
              <th style={{ width: 95 }}>Tanggal</th>
              <th style={{ width: 80 }}>No. WO</th>
              <th>Klien / Project</th>
              <th style={{ width: 105 }}>Jenis</th>
              <th className="num" style={{ width: 150 }}>Total</th>
              <th style={{ width: 110 }}>Umur</th>
              <th style={{ width: 105 }}>Status</th>
              {canWriteFinance ? <th style={{ width: 120 }} /> : null}
            </tr>
          </thead>
          <tbody>
            {data.map((inv) => (
              <tr key={inv.id}>
                <td>
                  <span className="link-strong">{inv.invoice_number}</span>
                  {inv.receipt_number ? (
                    <div className="muted" style={{ fontSize: 12 }}>
                      Kwitansi {inv.receipt_number}
                    </div>
                  ) : null}
                </td>
                <td>{formatDate(inv.issue_date)}</td>
                <td>
                  {/* Warisan dan pre-deal sama-sama tanpa No WO, tapi sangat
                      berbeda: yang satu menunggu penawaran di-Deal, yang satu
                      lagi penawarannya memang sudah tidak ada. */}
                  {inv.is_legacy ? (
                    <span className="badge badge-legacy" title={inv.legacy_reference ?? ''}>
                      warisan
                    </span>
                  ) : inv.is_predeal ? (
                    <span className="badge badge-progress">pre-deal</span>
                  ) : (
                    inv.wo_number
                  )}
                </td>
                <td>
                  {inv.customer_name}
                  <div className="muted" style={{ fontSize: 12 }}>
                    {inv.project_name}
                  </div>
                </td>
                <td>
                  {inv.type}
                  {inv.percent > 0 ? ` ${inv.percent}%` : ''}
                </td>
                <td className="num">{formatRupiah(inv.total)}</td>
                <td className={inv.aging_bucket ? `aging-${inv.aging_bucket}` : 'muted'}>
                  {inv.aging_bucket ? AGING_LABEL[inv.aging_bucket] : '—'}
                </td>
                <td>
                  <StatusBadge status={inv.payment_status} />
                </td>
                {canWriteFinance ? (
                  <td>
                    <PaymentStatusForm id={inv.id} current={inv.payment_status} />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination
        basePath="/invoice"
        page={params.page}
        perPage={params.perPage}
        count={count ?? 0}
        q={params.q}
        extra={status ? { status } : undefined}
      />
      </div>
    </>
  );
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const [y, m, d] = value.split('-');
  return `${d}/${m}/${y}`;
}
