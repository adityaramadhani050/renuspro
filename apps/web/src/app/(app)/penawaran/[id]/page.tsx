import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { formatRupiah, formatNumber } from '@/lib/query';
import { StatusBadge } from '@/components/StatusBadge';
import { StatusForm } from './StatusForm';
import type {
  QuotationDetail,
  QuotationRevision,
  QuotationItemGroup,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Detail penawaran.
 *
 * Menampilkan revisi mana pun, bukan hanya yang terakhir — riwayat revisi di
 * sistem lama (getRiwayatRevisi, Penawaran.gs:85) hanya bisa menampilkan
 * ringkasan, karena tiap revisi menyimpan itemnya sebagai satu blob JSON.
 * Setelah dinormalisasi, item tiap revisi bisa dibuka utuh.
 */
export default async function PenawaranDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ rev?: string }>;
}) {
  const { id } = await params;
  const { rev: revParam } = await searchParams;

  const supabase = await createClient();
  const profile = await getCurrentProfile();

  const { data: quotation } = await supabase
    .from('v_quotations')
    .select(
      'id, quote_number, status, project_name, deal_date, owner_id, owner_name, ' +
        'customer_name, customer_company, revision_id, rev, issue_date, valid_until, ' +
        'subtotal, discount, tax_amount, grand_total, total_cost, est_profit, ' +
        'margin_pct, contract_value, contract_value_gross, work_order_id, wo_number'
    )
    .eq('id', id)
    .single<QuotationDetail>();

  // RLS mengembalikan baris kosong (bukan error) untuk penawaran milik orang
  // lain, jadi ini sekaligus menangani kasus tidak berwenang.
  if (!quotation) notFound();

  const { data: revisions } = await supabase
    .from('quotation_revisions')
    .select('id, rev, issue_date, grand_total, total_cost, est_profit, margin_pct')
    .eq('quotation_id', id)
    .order('rev', { ascending: false })
    .returns<QuotationRevision[]>();

  const selected =
    revisions?.find((r) => String(r.rev) === revParam) ??
    revisions?.find((r) => r.id === quotation.revision_id) ??
    revisions?.[0];

  const { data: groups } = selected
    ? await supabase
        .from('quotation_item_groups')
        .select(
          'id, code, name, subtotal, sort_order, ' +
            'quotation_items(id, description, qty, unit, price, cost, line_total, sort_order)'
        )
        .eq('revision_id', selected.id)
        .order('sort_order')
        .returns<QuotationItemGroup[]>()
    : { data: [] as QuotationItemGroup[] };

  const isCurrent = selected?.id === quotation.revision_id;
  const canEditStatus =
    !!profile &&
    (profile.role === 'admin' || quotation.owner_id === profile.id);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            <Link href="/penawaran">Penawaran</Link> · {quotation.customer_name}
          </div>
          <h2>
            {quotation.quote_number} <StatusBadge status={quotation.status} />
          </h2>
        </div>
        {quotation.wo_number ? (
          <div className="wo-chip">
            No. WO <strong>{quotation.wo_number}</strong>
          </div>
        ) : null}
      </div>

      <div className="detail-grid">
        {/* ── Kolom kiri: item ── */}
        <div>
          <div className="card">
            <div className="card-head">
              <h2>
                Rincian Item — Revisi {selected?.rev ?? 0}
                {isCurrent ? null : <span className="rev-tag">bukan revisi terkini</span>}
              </h2>
            </div>

            {!groups || groups.length === 0 ? (
              <div className="empty">Revisi ini tidak punya rincian item.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>No</th>
                    <th>Deskripsi</th>
                    <th className="num" style={{ width: 70 }}>Qty</th>
                    <th style={{ width: 60 }}>Unit</th>
                    <th className="num" style={{ width: 140 }}>Harga</th>
                    <th className="num" style={{ width: 150 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <GroupBlock key={g.id} group={g} />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {revisions && revisions.length > 1 ? (
            <div className="card" style={{ marginTop: 18 }}>
              <div className="card-head">
                <h2>Riwayat Revisi</h2>
              </div>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>Revisi</th>
                    <th style={{ width: 110 }}>Tanggal</th>
                    <th className="num">Grand Total</th>
                    <th className="num" style={{ width: 90 }}>Margin</th>
                    <th style={{ width: 90 }} />
                  </tr>
                </thead>
                <tbody>
                  {revisions.map((r) => (
                    <tr key={r.id}>
                      <td>
                        Rev {r.rev}
                        {r.id === quotation.revision_id ? (
                          <span className="rev-tag">terkini</span>
                        ) : null}
                      </td>
                      <td>{formatDate(r.issue_date)}</td>
                      <td className="num">{formatRupiah(r.grand_total)}</td>
                      <td className="num">{r.margin_pct}%</td>
                      <td className="row-actions">
                        <Link href={`/penawaran/${id}?rev=${r.rev}`}>Lihat</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        {/* ── Kolom kanan: ringkasan ── */}
        <div>
          <div className="card">
            <div className="card-head">
              <h2>Informasi</h2>
            </div>
            <div className="meta-list">
              <dl>
                <dt>Klien</dt>
                <dd>
                  {quotation.customer_name}
                  {quotation.customer_company ? (
                    <div className="muted" style={{ fontSize: 13 }}>
                      {quotation.customer_company}
                    </div>
                  ) : null}
                </dd>
                <div className="row-sep" />
                <dt>Project</dt>
                <dd>{quotation.project_name}</dd>
                <div className="row-sep" />
                <dt>Sales</dt>
                <dd>{quotation.owner_name ?? <span className="muted">—</span>}</dd>
                <div className="row-sep" />
                <dt>Tanggal</dt>
                <dd>{formatDate(quotation.issue_date)}</dd>
                <div className="row-sep" />
                <dt>Berlaku s/d</dt>
                <dd>{formatDate(quotation.valid_until)}</dd>
                {quotation.deal_date ? (
                  <>
                    <div className="row-sep" />
                    <dt>Tanggal Deal</dt>
                    <dd>{formatDate(quotation.deal_date.slice(0, 10))}</dd>
                  </>
                ) : null}
              </dl>
            </div>
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <div className="card-head">
              <h2>Nilai — Revisi {selected?.rev ?? 0}</h2>
            </div>
            <div className="totals">
              <Line label="Subtotal" value={quotation.subtotal} />
              <Line label="Diskon" value={-quotation.discount} />
              <Line label="PPN" value={quotation.tax_amount} />
              <div className="line grand">
                <span>Grand Total</span>
                <span>{formatRupiah(quotation.grand_total)}</span>
              </div>

              {/* HPP & margin tetap terlihat oleh sales, sama seperti sistem
                  lama (JS_Form_Penawaran.html:268). */}
              <div className="line internal" style={{ marginTop: 10 }}>
                <span>Total HPP</span>
                <span>{formatRupiah(quotation.total_cost)}</span>
              </div>
              <div className="line internal">
                <span>Estimasi Keuntungan</span>
                <span>{formatRupiah(quotation.est_profit)}</span>
              </div>
              <div className="line internal">
                <span>Margin</span>
                <span>{formatNumber(quotation.margin_pct)}%</span>
              </div>
            </div>
          </div>

          {canEditStatus ? (
            <div className="card" style={{ marginTop: 18 }}>
              <div className="card-head">
                <h2>Status</h2>
              </div>
              <div style={{ padding: '14px 16px' }}>
                <StatusForm
                  id={quotation.id}
                  current={quotation.status}
                  hasWorkOrder={!!quotation.work_order_id}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

function GroupBlock({ group }: { group: QuotationItemGroup }) {
  const items = [...(group.quotation_items ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order
  );

  return (
    <>
      <tr className="group-head">
        <td>{group.code ?? ''}</td>
        <td colSpan={4}>{group.name || 'Tanpa nama sub-paket'}</td>
        <td className="num">{formatRupiah(group.subtotal)}</td>
      </tr>
      {items.map((item, i) => (
        <tr key={item.id}>
          <td className="muted">{i + 1}</td>
          <td>{item.description}</td>
          <td className="num">{formatNumber(item.qty)}</td>
          <td>{item.unit}</td>
          <td className="num">{formatRupiah(item.price)}</td>
          <td className="num">{formatRupiah(item.line_total)}</td>
        </tr>
      ))}
    </>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="line">
      <span>{label}</span>
      <span>{formatRupiah(value)}</span>
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const [y, m, d] = value.split('-');
  return `${d}/${m}/${y}`;
}
