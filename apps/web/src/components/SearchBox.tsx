import Link from 'next/link';

/**
 * Pencarian sisi server.
 *
 * Berupa <form method="get"> biasa: kata kunci masuk ke URL, halaman
 * dirender ulang di server, dan database yang melakukan pencarian memakai
 * index trigram. Tidak ada data yang perlu ditarik lebih dulu ke browser
 * untuk disaring di sana.
 */
export function SearchBox({
  basePath,
  q,
  perPage,
  placeholder,
}: {
  basePath: string;
  q: string;
  perPage: number;
  placeholder: string;
}) {
  return (
    <form className="search" method="get" action={basePath}>
      {perPage !== 25 ? <input type="hidden" name="perPage" value={perPage} /> : null}
      <input
        type="search"
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        aria-label="Cari"
        style={{ minWidth: 240 }}
      />
      <button type="submit" className="btn">
        Cari
      </button>
      {q ? (
        <Link className="btn" href={basePath}>
          Reset
        </Link>
      ) : null}
    </form>
  );
}
