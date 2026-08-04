import Link from 'next/link';

/**
 * Pemilih periode — bentuk yang sama dengan .db-preset-btn di sistem lama:
 * empat tombol, yang aktif biru pekat, dengan rentang tanggal di ujung kanan.
 *
 * Dibuat sebagai tautan biasa, bukan komponen berstate, supaya periode ikut
 * tersimpan di URL. Konsekuensinya kecil tapi nyata: hasil filter bisa
 * di-bookmark dan dikirim ke orang lain — sesuatu yang tidak bisa dilakukan
 * sistem lama karena seluruh filternya hanya hidup di memori browser.
 */
export type Preset = 'bulan-ini' | 'bulan-lalu' | 'tahun-ini' | 'custom';

const PILIHAN: { key: Preset; label: string }[] = [
  { key: 'bulan-ini', label: 'Bulan Ini' },
  { key: 'bulan-lalu', label: 'Bulan Lalu' },
  { key: 'tahun-ini', label: 'Tahun Ini' },
  { key: 'custom', label: 'Custom' },
];

const NAMA_BULAN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function tampil(tanggalIso: string) {
  const [y, m, d] = tanggalIso.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${NAMA_BULAN[m - 1]} ${y}`;
}

/**
 * Terjemahkan preset menjadi rentang tanggal.
 *
 * Patokan waktunya Asia/Jakarta, bukan zona server: aplikasi berjalan di
 * Singapura dan Postgres menyimpan UTC, sehingga "bulan ini" bisa bergeser
 * satu hari pada awal atau akhir bulan — persis saat angka bulanan paling
 * sering dilihat.
 */
export function rentangPeriode(preset: Preset, from?: string, to?: string) {
  const kini = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })
  );
  const th = kini.getFullYear();
  const bl = kini.getMonth();

  if (preset === 'custom' && from && to) {
    return { dari: from, sampai: to, label: `${tampil(from)} – ${tampil(to)}` };
  }

  let awal: Date;
  let akhir: Date;

  if (preset === 'bulan-lalu') {
    awal = new Date(Date.UTC(th, bl - 1, 1));
    akhir = new Date(Date.UTC(th, bl, 0));
  } else if (preset === 'tahun-ini') {
    awal = new Date(Date.UTC(th, 0, 1));
    akhir = new Date(Date.UTC(th, 11, 31));
  } else {
    awal = new Date(Date.UTC(th, bl, 1));
    akhir = new Date(Date.UTC(th, bl + 1, 0));
  }

  return {
    dari: iso(awal),
    sampai: iso(akhir),
    label: `${tampil(iso(awal))} – ${tampil(iso(akhir))}`,
  };
}

export function PeriodePills({
  aktif,
  label,
  from,
  to,
}: {
  aktif: Preset;
  label: string;
  from?: string;
  to?: string;
}) {
  return (
    <div className="periode-bar">
      <div className="periode-kiri">
        <span className="periode-judul">Periode</span>
        {PILIHAN.map((p) => (
          <Link
            key={p.key}
            href={p.key === 'custom' && from && to
              ? `/?periode=custom&from=${from}&to=${to}`
              : `/?periode=${p.key}`}
            className={aktif === p.key ? 'pill active' : 'pill'}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <form method="get" className="periode-custom">
        <input type="hidden" name="periode" value="custom" />
        <input type="date" name="from" defaultValue={from} aria-label="Tanggal mulai" />
        <input type="date" name="to" defaultValue={to} aria-label="Tanggal akhir" />
        <button type="submit" className="btn">Terapkan</button>
      </form>

      <span className="periode-rentang">{label}</span>
    </div>
  );
}
