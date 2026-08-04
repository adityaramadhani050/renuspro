import { createClient } from '@/lib/supabase/server';
import { parseListParams, rangeFor, likePattern, formatRupiah } from '@/lib/query';
import { Pagination } from '@/components/Pagination';
import { SearchBox } from '@/components/SearchBox';

export const dynamic = 'force-dynamic';

type ReceiptRow = {
  id: string;
  receipt_number: string;
  issue_date: string;
  received_from: string;
  amount: number;
  purpose: string | null;
  method: string;
  invoices: { invoice_number: string } | null;
  work_orders: { wo_number: string } | null;
};

/**
 * Daftar Kwitansi — read-only.
 *
 * Kwitansi tidak dibuat manual: ia terbit otomatis saat invoice dilunasi,
 * di dalam transaksi yang sama (set_invoice_payment_status). Menyediakan
 * tombol "tambah kwitansi" justru membuka celah kwitansi tanpa invoice
 * yang mendasarinya.
 */
export default async function KwitansiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseListParams(await searchParams);
  const [from, to] = rangeFor(params);

  const supabase = await createClient();

  let query = supabase
    .from('receipts')
    .select(
      'id, receipt_number, issue_date, received_from, amount, purpose, method, ' +
        'invoices(invoice_number), work_orders(wo_number)',
      { count: 'exact' }
    )
    .order('issue_date', { ascending: false })
    .order('receipt_number', { ascending: false });

  if (params.q) {
    const pattern = likePattern(params.q);
    query = query.or(`receipt_number.ilike.${pattern},received_from.ilike.${pattern}`);
  }

  const { data, count, error } = await query.range(from, to).returns<ReceiptRow[]>();

  return (
    <div className="card">
      <div className="card-head">
        <h2>Kwitansi</h2>
        <SearchBox
          basePath="/kwitansi"
          q={params.q}
          perPage={params.perPage}
          placeholder="Cari nomor kwitansi atau penerima…"
        />
      </div>

      {error ? (
        <div className="empty">Gagal memuat data: {error.message}</div>
      ) : !data || data.length === 0 ? (
        <div className="empty">
          {params.q
            ? 'Tidak ada kwitansi yang cocok.'
            : 'Belum ada kwitansi. Kwitansi terbit otomatis saat invoice dilunasi.'}
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 170 }}>No. Kwitansi</th>
              <th style={{ width: 95 }}>Tanggal</th>
              <th style={{ width: 170 }}>No. Invoice</th>
              <th>Terima Dari</th>
              <th>Untuk Pembayaran</th>
              <th style={{ width: 95 }}>Metode</th>
              <th className="num" style={{ width: 150 }}>Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id}>
                <td className="link-strong">{r.receipt_number}</td>
                <td>{formatDate(r.issue_date)}</td>
                <td className="muted">{r.invoices?.invoice_number ?? '—'}</td>
                <td>{r.received_from}</td>
                <td>{r.purpose ?? <span className="muted">—</span>}</td>
                <td>{r.method}</td>
                <td className="num">{formatRupiah(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination
        basePath="/kwitansi"
        page={params.page}
        perPage={params.perPage}
        count={count ?? 0}
        q={params.q}
      />
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const [y, m, d] = value.split('-');
  return `${d}/${m}/${y}`;
}
