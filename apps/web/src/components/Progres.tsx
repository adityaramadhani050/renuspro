import { formatRupiah } from '@/lib/query';

/**
 * Batang capaian target — bergradasi biru→hijau seperti sistem lama.
 *
 * Lebar batang dibatasi 100% walau capaiannya lebih, tapi ANGKANYA tetap
 * ditampilkan apa adanya. Membatasi keduanya akan menyembunyikan selisih
 * antara "pas tercapai" dan "jauh melampaui" — dua kabar yang sangat berbeda.
 */
export function Progres({
  judul,
  nilai,
  target,
}: {
  judul: string;
  nilai: number;
  target: number;
}) {
  const pct = target > 0 ? (nilai / target) * 100 : 0;

  return (
    <div className="progres">
      <div className="progres-head">
        <span className="progres-judul">{judul}</span>
        <strong className={pct >= 100 ? 'progres-pct tercapai' : 'progres-pct'}>
          {pct.toFixed(1)}%
        </strong>
      </div>
      <div className="progres-track">
        <div className="progres-fill" style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className="progres-sub">
        {formatRupiah(nilai)} / {target > 0 ? formatRupiah(target) : 'target belum diisi'}
      </div>
    </div>
  );
}
