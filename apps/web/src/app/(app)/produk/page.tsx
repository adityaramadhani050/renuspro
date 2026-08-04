import Link from 'next/link';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { parseListParams, rangeFor, likePattern, formatRupiah } from '@/lib/query';
import { Pagination } from '@/components/Pagination';
import { SearchBox } from '@/components/SearchBox';
import { canManageMaster } from '@/lib/roles';

export const dynamic = 'force-dynamic';

/**
 * Daftar Produk & Jasa.
 *
 * Menggantikan getProdukList() (Produk.gs:6), yang membaca seluruh sheet dengan
 * getDataRange().getValues() lalu mengirim semuanya ke browser untuk dipotong
 * di sana. Di sini hanya satu halaman data yang berpindah, dan pencarian
 * ditangani database memakai index trigram.
 */
export default async function ProdukPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseListParams(await searchParams);
  const [from, to] = rangeFor(params);
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const canWrite = !!profile && canManageMaster(profile.role);

  let query = supabase
    .from('products')
    .select('id, legacy_code, name, unit, price, cost', { count: 'exact' })
    .order('name');

  if (params.q) query = query.ilike('name', likePattern(params.q));

  const { data, count, error } = await query.range(from, to);

  return (
    <>
      <div className="page-head">
        <h2>Katalog Material &amp; Jasa</h2>
        <div className="filters">
          <SearchBox
            basePath="/produk"
            q={params.q}
            perPage={params.perPage}
            placeholder="Cari nama produk/jasa…"
          />
          {canWrite ? (
            <Link className="btn btn-primary" href="/produk/baru">
              + Tambah Produk
            </Link>
          ) : null}
        </div>
      </div>

      <div className="card">

      {error ? (
        <div className="empty">Gagal memuat data: {error.message}</div>
      ) : !data || data.length === 0 ? (
        <div className="empty">
          {params.q ? `Tidak ada produk yang cocok dengan "${params.q}".` : 'Belum ada produk.'}
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 90 }}>Kode</th>
              <th>Nama Jasa/Produk</th>
              <th style={{ width: 80 }}>Unit</th>
              <th className="num" style={{ width: 160 }}>Harga Satuan</th>
              <th className="num" style={{ width: 160 }}>HPP</th>
              <th className="num" style={{ width: 90 }}>Margin</th>
              {canWrite ? <th style={{ width: 70 }} /> : null}
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.id}>
                <td style={{ color: 'var(--muted)' }}>{p.legacy_code ?? '—'}</td>
                <td>{p.name}</td>
                <td>{p.unit}</td>
                <td className="num">{formatRupiah(p.price)}</td>
                <td className="num">{formatRupiah(p.cost)}</td>
                <td className="num">{margin(p.price, p.cost)}</td>
                {canWrite ? (
                  <td className="row-actions">
                    <Link href={`/produk/${p.id}`}>Ubah</Link>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination
        basePath="/produk"
        page={params.page}
        perPage={params.perPage}
        count={count ?? 0}
        q={params.q}
      />
      </div>
    </>
  );
}

function margin(price: number, cost: number): string {
  if (!price) return '—';
  return `${(((price - cost) / price) * 100).toFixed(1)}%`;
}
