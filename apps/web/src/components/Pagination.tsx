import Link from 'next/link';
import { PAGE_SIZES, totalPages } from '@/lib/query';

type Props = {
  basePath: string;
  page: number;
  perPage: number;
  count: number;
  q: string;
};

/**
 * Navigasi halaman berbasis URL.
 *
 * Nomor halaman ada di query string, bukan di state React, sehingga hasil
 * pencarian bisa di-bookmark dan dibagikan — dan tombol Back browser bekerja
 * sebagaimana mestinya.
 */
export function Pagination({ basePath, page, perPage, count, q }: Props) {
  const pages = totalPages(count, perPage);
  const current = Math.min(page, pages);
  const from = count === 0 ? 0 : (current - 1) * perPage + 1;
  const to = Math.min(current * perPage, count);

  const href = (p: number, size = perPage) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (p > 1) params.set('page', String(p));
    if (size !== 25) params.set('perPage', String(size));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <div className="pagination">
      <div>
        Menampilkan {from.toLocaleString('id-ID')}–{to.toLocaleString('id-ID')} dari{' '}
        {count.toLocaleString('id-ID')} data
      </div>

      <div className="pages">
        <form method="get" action={basePath} style={{ marginRight: 8 }}>
          {q ? <input type="hidden" name="q" value={q} /> : null}
          <select name="perPage" defaultValue={perPage} aria-label="Baris per halaman">
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} / halaman
              </option>
            ))}
          </select>
          <noscript>
            <button type="submit" className="btn" style={{ marginLeft: 6 }}>
              Terapkan
            </button>
          </noscript>
        </form>

        {current > 1 ? (
          <Link href={href(current - 1)}>← Sebelumnya</Link>
        ) : (
          <span className="pg">← Sebelumnya</span>
        )}

        {pageWindow(current, pages).map((p, i) =>
          p === null ? (
            <span className="pg" key={`gap-${i}`}>
              …
            </span>
          ) : (
            <Link
              key={p}
              href={href(p)}
              aria-current={p === current ? 'page' : undefined}
            >
              {p}
            </Link>
          )
        )}

        {current < pages ? (
          <Link href={href(current + 1)}>Berikutnya →</Link>
        ) : (
          <span className="pg">Berikutnya →</span>
        )}
      </div>
    </div>
  );
}

/** Jendela nomor halaman ringkas: 1 … 4 5 [6] 7 8 … 20 */
function pageWindow(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const out: (number | null)[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) out.push(null);
  for (let p = start; p <= end; p++) out.push(p);
  if (end < total - 1) out.push(null);
  out.push(total);

  return out;
}
