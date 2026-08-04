import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { formatRupiah } from '@/lib/query';
import { StatusBadge } from '@/components/StatusBadge';
import { NotesForm } from './NotesForm';
import { RequestInvoiceForm } from './RequestInvoiceForm';
import type { WorkOrderRow, InvoiceRow } from '@/lib/types';
import { canManageFinance, canWriteWoNotes, canRequestInvoice, isSuperuser } from '@/lib/roles';

export const dynamic = 'force-dynamic';

type RequestRow = {
  id: string;
  message: string | null;
  status: string;
  created_at: string;
  profiles: { full_name: string } | null;
};

export default async function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const profile = await getCurrentProfile();

  const { data: wo } = await supabase
    .from('v_work_orders')
    .select('*')
    .eq('id', id)
    .single<WorkOrderRow>();

  if (!wo) notFound();

  const [{ data: invoices }, { data: requests }] = await Promise.all([
    supabase
      .from('v_invoices')
      .select(
        'id, invoice_number, issue_date, type, percent, dpp, vat_amount, total, ' +
          'payment_status, paid_at, receipt_number, aging_bucket, days_outstanding'
      )
      .eq('work_order_id', id)
      .order('invoice_number')
      .returns<InvoiceRow[]>(),
    supabase
      .from('invoice_requests')
      .select('id, message, status, created_at, profiles!invoice_requests_requested_by_fkey(full_name)')
      .eq('work_order_id', id)
      .order('created_at', { ascending: false })
      .returns<RequestRow[]>(),
  ]);

  const canBillFinance = !!profile && canManageFinance(profile.role);
  // Catatan progres ditulis orang lapangan, bukan hanya pemilik penawaran.
  const canEditNotes = !!profile && (canWriteWoNotes(profile.role) || wo.owner_id === profile.id);
  const canAskInvoice =
    !!profile &&
    canRequestInvoice(profile.role) &&
    (isSuperuser(profile.role) || wo.owner_id === profile.id);
  const canBill = canBillFinance && wo.remaining_dpp > 0;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            <Link href="/work-order">Work Order</Link> · {wo.customer_name}
          </div>
          <h2>
            No. WO {wo.wo_number}{' '}
            <span className="muted" style={{ fontSize: 15, fontWeight: 400 }}>
              — {wo.project_name}
            </span>
          </h2>
        </div>
        <div className="filters">
          <Link className="btn" href={`/penawaran/${wo.quotation_id}`}>
            Lihat penawaran {wo.quote_number}
          </Link>
          {canBill ? (
            <Link className="btn btn-primary" href={`/invoice/baru?wo=${wo.id}`}>
              + Terbitkan Invoice
            </Link>
          ) : null}
        </div>
      </div>

      <div className="detail-grid">
        <div className="stack">
          <div className="card">
            <div className="card-head">
              <h2>Invoice</h2>
              {wo.remaining_dpp <= 0 ? (
                <span className="badge badge-deal">Kontrak tertagih penuh</span>
              ) : null}
            </div>

            {!invoices || invoices.length === 0 ? (
              <div className="empty">Belum ada invoice untuk Work Order ini.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 170 }}>No. Invoice</th>
                    <th style={{ width: 95 }}>Tanggal</th>
                    <th style={{ width: 110 }}>Jenis</th>
                    <th className="num" style={{ width: 140 }}>DPP</th>
                    <th className="num" style={{ width: 150 }}>Total</th>
                    <th style={{ width: 110 }}>Status</th>
                    <th style={{ width: 150 }}>Kwitansi</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td>
                        <Link href={`/invoice?q=${inv.invoice_number}`} className="link-strong">
                          {inv.invoice_number}
                        </Link>
                      </td>
                      <td>{formatDate(inv.issue_date)}</td>
                      <td>
                        {inv.type}
                        {inv.percent > 0 ? ` ${inv.percent}%` : ''}
                      </td>
                      <td className="num">{formatRupiah(inv.dpp)}</td>
                      <td className="num">{formatRupiah(inv.total)}</td>
                      <td>
                        <StatusBadge status={inv.payment_status} />
                      </td>
                      <td className="muted">{inv.receipt_number ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Catatan Work Order</h2>
            </div>
            <div style={{ padding: 16 }}>
              {canEditNotes ? (
                <NotesForm id={wo.id} notes={wo.notes ?? ''} />
              ) : (
                <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                  {wo.notes || 'Belum ada catatan.'}
                </p>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Permintaan Invoice</h2>
            </div>
            {canAskInvoice ? (
              <div style={{ padding: '16px 16px 0' }}>
                <RequestInvoiceForm workOrderId={wo.id} />
              </div>
            ) : null}

            {!requests || requests.length === 0 ? (
              <div className="empty">Belum ada permintaan.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 130 }}>Diminta oleh</th>
                    <th>Pesan</th>
                    <th style={{ width: 100 }}>Status</th>
                    <th style={{ width: 110 }}>Tanggal</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td>{r.profiles?.full_name ?? '—'}</td>
                      <td>{r.message ?? <span className="muted">—</span>}</td>
                      <td>{r.status}</td>
                      <td>{formatDate(r.created_at.slice(0, 10))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Ringkasan penagihan ── */}
        <div className="card">
          <div className="card-head">
            <h2>Penagihan</h2>
          </div>
          <div className="totals">
            <div className="line">
              <span>Nilai kontrak (DPP)</span>
              <span>{formatRupiah(wo.contract_value)}</span>
            </div>
            <div className="line">
              <span>PPN</span>
              <span>{formatRupiah(wo.tax_amount)}</span>
            </div>
            <div className="line grand">
              <span>Nilai kontrak bruto</span>
              <span>{formatRupiah(wo.contract_value_gross)}</span>
            </div>

            <div className="internal-box">
              <div className="line">
                <span>Sudah ditagih</span>
                <span>{formatRupiah(wo.billed_total)}</span>
              </div>
              <div className="line">
                <span>Sudah terbayar</span>
                <span>{formatRupiah(wo.paid_total)}</span>
              </div>
              <div className="line">
                <span>Piutang berjalan</span>
                <span className={wo.outstanding > 0 ? 'amount-due' : undefined}>
                  {formatRupiah(wo.outstanding)}
                </span>
              </div>
              <div className="line">
                <span>Belum ditagih</span>
                <span>{formatRupiah(wo.uninvoiced_gross)}</span>
              </div>
            </div>

            {/* Angka inilah yang membatasi penerbitan invoice berikutnya, dan
                divalidasi ulang di database saat invoice benar-benar dibuat. */}
            <div className="line internal" style={{ marginTop: 10 }}>
              <span>Sisa yang boleh ditagih (DPP)</span>
              <span>{formatRupiah(wo.remaining_dpp)}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const [y, m, d] = value.split('-');
  return `${d}/${m}/${y}`;
}
