'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Icon, type IconName } from './Icon';

/**
 * Sidebar — disamakan dengan Index.html sistem lama.
 *
 * Label, urutan, dan ikonnya sengaja disalin persis, termasuk yang tidak
 * konsisten dengan penamaan di database: menu klien tetap tertulis "Customer"
 * dan produk tetap "Produk / Jasa". Menyeragamkannya di sini akan lebih rapi
 * di mata pengembang dan lebih membingungkan di mata pengguna — dan pengguna
 * yang menang.
 *
 * Modul yang belum dimigrasi TIDAK dicantumkan. Selama migrasi bertahap, satu
 * modul hanya boleh punya satu rumah; menu yang mengarah ke halaman kosong
 * hanya akan membuat orang mengira sistemnya rusak.
 */
type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  visible?: (role: string) => boolean;
};

const NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: 'chart-pie' },
  { href: '/penawaran', label: 'Penawaran', icon: 'file-invoice-dollar' },
  { href: '/work-order', label: 'Work Order', icon: 'clipboard-check' },
  { href: '/invoice', label: 'Invoice', icon: 'file-invoice' },
  { href: '/kwitansi', label: 'Kwitansi', icon: 'receipt' },
  { href: '/produk', label: 'Produk / Jasa', icon: 'box' },
  { href: '/klien', label: 'Customer', icon: 'users' },
];

/**
 * Menu sistem lama yang belum punya halaman di sini, dalam urutan aslinya.
 * Didaftar supaya jelas apa yang masih kurang — dan supaya urutan menu tetap
 * benar saat masing-masing menyusul.
 */
export const MENU_BELUM_DIMIGRASI = [
  'Dashboard Finance', // setelah Dashboard
  'Template Paket',    // setelah Produk / Jasa
  'Manajemen User',    // setelah Customer
  'Pengaturan',        // paling bawah
];

function inisial(nama: string) {
  const bagian = nama.trim().split(/\s+/);
  return ((bagian[0]?.[0] ?? '') + (bagian[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function Sidebar({ role, fullName }: { role: string; fullName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const aktif = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <aside className="sidebar">
      <div>
        <div className="brand">
          <span className="mark">R</span>
          <span className="label">
            Renus<span className="pro">Pro</span>
          </span>
        </div>

        <nav>
          {NAV.filter((item) => !item.visible || item.visible(role)).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={aktif(item.href) ? 'page' : undefined}
            >
              <span className="ico">
                <Icon name={item.icon} size={17} />
              </span>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="user">
        <div className="avatar" aria-hidden="true">
          {inisial(fullName)}
        </div>
        <div className="who">
          <strong>{fullName}</strong>
          <small>Online</small>
        </div>
        <div className="acts">
          <Link
            href="/ganti-password"
            className="icon-btn"
            title="Ganti Password"
            aria-label="Ganti password"
          >
            <Icon name="key" size={13} />
          </Link>
          <button
            type="button"
            className="icon-btn danger"
            title="Keluar"
            aria-label="Keluar"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await createClient().auth.signOut();
                router.replace('/login');
                router.refresh();
              });
            }}
          >
            <Icon name="logout" size={13} />
          </button>
        </div>
      </div>
    </aside>
  );
}
