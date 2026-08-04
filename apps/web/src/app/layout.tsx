import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RenusPro — PT. Renus Global Indonesia',
  description: 'Sistem ERP: penawaran, work order, invoice, dan kwitansi.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
