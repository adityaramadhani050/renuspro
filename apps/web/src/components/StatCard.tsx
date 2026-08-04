import { formatRupiah } from '@/lib/query';

/**
 * Kartu ringkasan di atas tiap halaman daftar — bentuk yang sama dengan
 * Page_WorkOrder.html dan Page_Invoice.html di sistem lama.
 *
 * Warnanya membawa arti, bukan hiasan, dan artinya sudah dihafal pengguna:
 * biru untuk yang sudah ditagih, hijau untuk yang lunas, merah untuk yang
 * masih menggantung. Mengacaknya akan membuat orang salah membaca angka
 * sekilas — kesalahan yang justru berbahaya karena tidak terasa salah.
 */
export type StatTone = 'netral' | 'blue' | 'green' | 'red' | 'amber';

export function StatCard({
  label,
  value,
  sub,
  tone = 'netral',
  money = false,
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: StatTone;
  money?: boolean;
}) {
  const teks =
    typeof value === 'number' && money
      ? formatRupiah(value)
      : typeof value === 'number'
        ? value.toLocaleString('id-ID')
        : value;

  return (
    <div className={tone === 'netral' ? 'kpi' : `kpi ${tone}`}>
      <div className="label">{label}</div>
      <div className={money ? 'value money' : 'value'}>{teks}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}

export function StatGrid({
  children,
  columns = 4,
}: {
  children: React.ReactNode;
  columns?: 3 | 4 | 5;
}) {
  return (
    <div className={columns === 4 ? 'kpi-grid' : `kpi-grid cols-${columns}`}>
      {children}
    </div>
  );
}
