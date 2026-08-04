import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

/**
 * Font yang sama dengan sistem lama, tapi tidak diambil dengan cara yang sama.
 *
 * Sistem lama menariknya dari fonts.googleapis.com setiap halaman dibuka —
 * satu permintaan ke server luar sebelum teks apa pun muncul. next/font
 * mengunduhnya saat build dan menyajikannya dari domain sendiri, jadi
 * tampilannya identik tanpa menunggu siapa pun.
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'RenusPro — PT. Renus Global Indonesia',
  description: 'Sistem ERP: penawaran, work order, invoice, dan kwitansi.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={jakarta.variable}>
      <body>{children}</body>
    </html>
  );
}
