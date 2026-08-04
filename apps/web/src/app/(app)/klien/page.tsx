import Link from 'next/link';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { parseListParams, rangeFor, likePattern } from '@/lib/query';
import { Pagination } from '@/components/Pagination';
import { SearchBox } from '@/components/SearchBox';

export const dynamic = 'force-dynamic';

/**
 * Daftar Klien.
 *
 * Menggantikan getCustomerList() (Customer.gs:6). Pencarian mencakup nama dan
 * perusahaan sekaligus — di sistem lama itu berarti menyaring seluruh array di
 * browser; di sini satu kondisi OR yang dijalankan database.
 */
export default async function KlienPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseListParams(await searchParams);
  const [from, to] = rangeFor(params);
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const canWrite = !!profile && ['admin', 'sales'].includes(profile.role);

  let query = supabase
    .from('customers')
    .select('id, legacy_code, name, company, address, phone', { count: 'exact' })
    .order('name');

  if (params.q) {
    const pattern = likePattern(params.q);
    query = query.or(`name.ilike.${pattern},company.ilike.${pattern}`);
  }

  const { data, count, error } = await query.range(from, to);

  return (
    <div className="card">
      <div className="card-head">
        <h2>Klien</h2>
        <div className="filters">
          <SearchBox
            basePath="/klien"
            q={params.q}
            perPage={params.perPage}
            placeholder="Cari nama klien atau perusahaan…"
          />
          {canWrite ? (
            <Link className="btn btn-primary" href="/klien/baru">
              + Tambah Klien
            </Link>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="empty">Gagal memuat data: {error.message}</div>
      ) : !data || data.length === 0 ? (
        <div className="empty">
          {params.q ? `Tidak ada klien yang cocok dengan "${params.q}".` : 'Belum ada klien.'}
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 90 }}>Kode</th>
              <th>Nama Klien</th>
              <th style={{ width: 150 }}>Perusahaan</th>
              <th>Alamat</th>
              <th style={{ width: 150 }}>Kontak</th>
              {canWrite ? <th style={{ width: 70 }} /> : null}
            </tr>
          </thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id}>
                <td style={{ color: 'var(--muted)' }}>{c.legacy_code ?? '—'}</td>
                <td>{c.name}</td>
                <td>{c.company ?? '—'}</td>
                <td>{c.address ?? '—'}</td>
                <td>{c.phone ?? '—'}</td>
                {canWrite ? (
                  <td className="row-actions">
                    <Link href={`/klien/${c.id}`}>Ubah</Link>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination
        basePath="/klien"
        page={params.page}
        perPage={params.perPage}
        count={count ?? 0}
        q={params.q}
      />
    </div>
  );
}
