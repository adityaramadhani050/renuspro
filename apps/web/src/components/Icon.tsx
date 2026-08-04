/**
 * Ikon menu, menyamai glyph Font Awesome yang dipakai sistem lama.
 *
 * Sistem lama memuat seluruh Font Awesome (±100 KB CSS + berkas font) dari CDN
 * hanya untuk sebelas ikon. Di sini kesebelasnya digambar langsung sebagai SVG:
 * bentuknya tetap dikenali di tempat yang sama, tanpa satu pun permintaan ke
 * server luar.
 *
 * Nama ikon sengaja mengikuti nama Font Awesome-nya (`chart-pie`,
 * `clipboard-check`, …) supaya pemetaannya ke Index.html bisa ditelusuri
 * kembali kalau nanti ada menu yang ditambah.
 */

export type IconName =
  | 'chart-pie'
  | 'money-bill-trend-up'
  | 'file-invoice-dollar'
  | 'clipboard-check'
  | 'file-invoice'
  | 'receipt'
  | 'box'
  | 'layer-group'
  | 'users'
  | 'user-shield'
  | 'gear'
  | 'calendar'
  | 'key'
  | 'logout'
  | 'search';

const PATHS: Record<IconName, React.ReactNode> = {
  'chart-pie': (
    <>
      {/* Juring 12→3 sebagai potongan pai, lalu busur sisanya. Flag busur
          besar harus 0; dengan 1 keduanya melengkung ke arah yang salah dan
          hasilnya tergambar seperti bulan sabit. */}
      <path d="M12 3v9h9a9 9 0 0 0-9-9Z" />
      <path d="M20.5 15.5A9 9 0 1 1 8.5 3.2" />
    </>
  ),
  'money-bill-trend-up': (
    <>
      <path d="M3 6h13v7H3z" />
      <circle cx="9.5" cy="9.5" r="1.6" />
      <path d="m14 19 3.5-3.5 2.5 2.5L24 14" />
      <path d="M21 14h3v3" />
    </>
  ),
  'file-invoice-dollar': (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M12 11v7" />
      <path d="M14 12.5h-3a1.5 1.5 0 0 0 0 3h2a1.5 1.5 0 0 1 0 3h-3" />
    </>
  ),
  'clipboard-check': (
    <>
      <path d="M9 3h6v3H9z" />
      <path d="M15 4.5h2A2 2 0 0 1 19 6.5V20a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h2" />
      <path d="m9 14 2 2 4-4" />
    </>
  ),
  'file-invoice': (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h5" />
    </>
  ),
  receipt: (
    <>
      <path d="M5 3v18l2.5-1.6L10 21l2-1.6L14 21l2.5-1.6L19 21V3z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  box: (
    <>
      <path d="m12 2 9 4.5v11L12 22l-9-4.5v-11z" />
      <path d="M3 6.5 12 11l9-4.5M12 11v11" />
    </>
  ),
  'layer-group': (
    <>
      <path d="m12 2 9 5-9 5-9-5z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </>
  ),
  users: (
    <>
      <path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 20v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
    </>
  ),
  'user-shield': (
    <>
      <circle cx="9" cy="7" r="4" />
      <path d="M12 21H3v-2a4 4 0 0 1 4-4h4" />
      <path d="M18 12s3 1 3 2.5V17c0 2-3 4-3 4s-3-2-3-4v-2.5C15 13 18 12 18 12Z" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.4 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m10.8 12.2 8-8M17 6l2.5 2.5M14.5 8.5 17 11" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
};

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
