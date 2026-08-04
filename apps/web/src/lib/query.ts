/**
 * Helper daftar berpaginasi.
 *
 * Inilah perbedaan inti dengan sistem lama. Sebelumnya seluruh tabel ditarik
 * ke browser lalu dipotong di sana (`state.data.slice(...)`,
 * JS_Pagination.html:199), sehingga biaya tiap halaman tumbuh mengikuti
 * total baris. Di sini yang berpindah hanya satu halaman data, dan pencarian
 * dilakukan database memakai index trigram.
 */

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

export type ListParams = {
  page: number;
  perPage: number;
  q: string;
};

/** Baca & validasi parameter daftar dari query string. */
export function parseListParams(
  searchParams: Record<string, string | string[] | undefined>
): ListParams {
  const rawPage = Number(first(searchParams.page));
  const rawPerPage = Number(first(searchParams.perPage));

  const perPage = (PAGE_SIZES as readonly number[]).includes(rawPerPage)
    ? rawPerPage
    : DEFAULT_PAGE_SIZE;

  return {
    page: Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1,
    perPage,
    q: (first(searchParams.q) ?? '').trim(),
  };
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Rentang baris untuk PostgREST `.range()` (inklusif di kedua ujung). */
export function rangeFor({ page, perPage }: ListParams): [number, number] {
  const from = (page - 1) * perPage;
  return [from, from + perPage - 1];
}

/**
 * Bersihkan kata kunci untuk pola `ilike`.
 * Karakter `%`, `_` dan `,` harus di-escape: `,` memisahkan argumen di
 * PostgREST, jadi membiarkannya lewat memungkinkan penyuntikan filter.
 */
export function likePattern(q: string): string {
  return `%${q.replace(/[%_,()\\]/g, (c) => `\\${c}`)}%`;
}

export function totalPages(count: number, perPage: number): number {
  return Math.max(1, Math.ceil(count / perPage));
}

export function formatRupiah(value: number | null | undefined): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

export function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat('id-ID').format(value ?? 0);
}
