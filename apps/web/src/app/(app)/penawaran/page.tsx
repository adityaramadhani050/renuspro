import Link from 'next/link';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { parseListParams, rangeFor, likePattern, formatRupiah } from '@/lib/query';
import { Pagination } from '@/components/Pagination';
import { StatusBadge } from '@/components/StatusBadge';
import type { QuotationListRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

const STATUSES = ['On-Progress', 'Deal', 'Fail'] as const;

/**
 * Daftar Penawaran.
 *
 * Menggantikan getPenawaranList() (Penawaran.gs:6), yang membaca seluruh sheet
 * lalu menjalankan loop latestRevMap untuk mencari revisi terakhir tiap nomor.
 * Di sini pekerjaan itu sudah selesai sebelum query dimulai: view v_quotations
 * memakai quotations.current_revision_id yang dijaga trigger.
 *
 * Sales hanya melihat penawarannya sendiri — itu ditegakkan RLS di database,
 * bukan oleh filter di halaman ini, sehingga tidak bisa dilewati.
 */
export default async function PenawaranPage({
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
  const canWrite = !!profile && ['admin', 'sales'].includes(profile.role);

  let query = supabase
    .from('v_quotations')
    .select(
      'id, quote_number, rev, status, project_name, customer_name, owner_name, ' +
        'issue_date, grand_total, wo_number, revision_count',
      { count: 'exact' }
    )
    .order('issue_date', { ascending: false })
    .order('quote_number', { ascending: false });

  if (params.q) {
    const pattern = likePattern(params.q);
    query = query.or(
      `quote_number.ilike.${pattern},project_name.ilike.${pattern},customer_name.ilike.${pattern}`
    );
  }
  if ((STATUSES as readonly string[]).includes(status)) {
    query = query.eq('status', status);
  }

  // .returns<T>() dipasang paling akhir: ia mengubah tipe builder sehingga
  // .or()/.eq() tidak lagi tersedia setelahnya.
  const { data, count, error } = await query
    .range(from, to)
    .returns<QuotationListRow[]>();

  const filterHref = (s: string) => {
    const p = new URLSearchParams();
    if (params.q) p.set('q', params.q);
    if (s) p.set('status', s);
    if (params.perPage !== 25) p.set('perPage', String(params.perPage));
    const qs = p.toString();
    return qs ? `/penawaran?${qs}` : '/penawaran';
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>Penawaran</h2>
        <div className="filters">
          <form className="search" method="get" action="/penawaran">
            {status ? <input type="hidden" name="status" value={status} /> : null}
            <input
              type="search"
              name="q"
              defaultValue={params.q}
              placeholder="Cari nomor, project, atau klien…"
              aria-label="Cari penawaran"
              style={{ minWidth: 260 }}
            />
            <button type="submit" className="btn">
              Cari
            </button>
          </form>
          {canWrite ? (
            <Link className="btn btn-primary" href="/penawaran/baru">
              + Buat Penawaran
            </Link>
          ) : null}
        </div>
      </div>

      <div className="tabbar">
        <Link className={!status ? 'active' : ''} href={filterHref('')}>
          Semua
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} className={status === s ? 'active' : ''} href={filterHref(s)}>
            {s}
          </Link>
        ))}
      </div>

      {error ? (
        <div className="empty">Gagal memuat data: {error.message}</div>
      ) : !data || data.length === 0 ? (
        <div className="empty">
          {params.q || status
            ? 'Tidak ada penawaran yang cocok dengan filter ini.'
            : 'Belum ada penawaran.'}
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 170 }}>No. Penawaran</th>
              <th style={{ width: 90 }}>Tanggal</th>
              <th>Project</th>
              <th style={{ width: 190 }}>Klien</th>
              <th style={{ width: 130 }}>Sales</th>
              <th className="num" style={{ width: 160 }}>Grand Total</th>
              <th style={{ width: 110 }}>Status</th>
              <th style={{ width: 80 }}>No. WO</th>
            </tr>
          </thead>
          <tbody>
            {data.map((q) => (
              <tr key={q.id}>
                <td>
                  <Link href={`/penawaran/${q.id}`} className="link-strong">
                    {q.quote_number}
                  </Link>
                  {q.rev > 0 ? <span className="rev-tag">rev {q.rev}</span> : null}
                </td>
                <td>{formatDate(q.issue_date)}</td>
                <td>{q.project_name}</td>
                <td>{q.customer_name}</td>
                <td>{q.owner_name ?? <span className="muted">—</span>}</td>
                <td className="num">{formatRupiah(q.grand_total)}</td>
                <td>
                  <StatusBadge status={q.status} />
                </td>
                <td>{q.wo_number ?? <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination
        basePath="/penawaran"
        page={params.page}
        perPage={params.perPage}
        count={count ?? 0}
        q={params.q}
        extra={status ? { status } : undefined}
      />
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const [y, m, d] = value.split('-');
  return `${d}/${m}/${y}`;
}
