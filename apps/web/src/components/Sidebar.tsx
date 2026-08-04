'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Menu yang sudah dimigrasi. Modul yang masih dilayani Apps Script sengaja
 * TIDAK dicantumkan di sini — selama migrasi bertahap, satu modul hanya boleh
 * punya satu rumah, supaya tidak ada dua tempat yang menulis data yang sama.
 */
const NAV: { href: string; label: string; roles?: string[] }[] = [
  { href: '/', label: 'Dashboard' },
  { href: '/produk', label: 'Produk & Jasa' },
  { href: '/klien', label: 'Klien' },
];

export function Sidebar({ role }: { role: string }) {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="brand">
        RenusPro
        <small>PT. Renus Global Indonesia</small>
      </div>

      <nav>
        {NAV.filter((item) => !item.roles || item.roles.includes(role)).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={
              item.href === '/'
                ? pathname === '/'
                  ? 'page'
                  : undefined
                : pathname.startsWith(item.href)
                  ? 'page'
                  : undefined
            }
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="foot">
        Penawaran, Work Order, Invoice &amp; Kwitansi masih di sistem lama —
        dimigrasi pada tahap berikutnya.
      </div>
    </aside>
  );
}
