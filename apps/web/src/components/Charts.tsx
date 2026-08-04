/**
 * Grafik dashboard, digambar sebagai SVG di server.
 *
 * Sistem lama memakai Chart.js dari CDN (±200 KB) yang baru menggambar setelah
 * JavaScript-nya selesai diunduh dan dijalankan — salah satu sebab dashboard
 * terasa "berkedip kosong" sebelum isinya muncul. Di sini grafiknya sudah jadi
 * bagian dari HTML yang dikirim, jadi tidak ada yang perlu ditunggu dan tidak
 * ada permintaan ke server luar.
 *
 * Bentuk dan warnanya mengikuti tampilan lama: garis biru dengan area
 * bergradasi, garis putus-putus untuk target, dan donat untuk komposisi status.
 */

import { formatRupiah } from '@/lib/query';

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** Pembulatan ke atas ke angka "bulat" supaya sumbu Y mudah dibaca. */
function batasAtas(maks: number) {
  if (maks <= 0) return 1;
  const pangkat = 10 ** Math.floor(Math.log10(maks));
  return Math.ceil(maks / (pangkat / 2)) * (pangkat / 2);
}

function ringkas(n: number) {
  if (n >= 1e9) return `Rp ${(n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 })}M`;
  if (n >= 1e6) return `Rp ${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })}Jt`;
  if (n >= 1e3) return `Rp ${Math.round(n / 1e3)}rb`;
  return `Rp ${n}`;
}

export function TrenRevenue({
  data,
  target,
}: {
  data: { bulan: number; revenue: number }[];
  target?: number;
}) {
  const W = 620;
  const H = 260;
  const padKiri = 66;
  const padBawah = 28;
  const padAtas = 12;

  const nilai = data.map((d) => Number(d.revenue) || 0);
  const maks = batasAtas(Math.max(...nilai, target ?? 0));
  const lebarPlot = W - padKiri - 12;
  const tinggiPlot = H - padAtas - padBawah;

  const x = (i: number) => padKiri + (lebarPlot * i) / Math.max(nilai.length - 1, 1);
  const y = (v: number) => padAtas + tinggiPlot - (tinggiPlot * v) / maks;

  const garis = nilai.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ');
  const area = `${garis} L${x(nilai.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;

  const kisi = [0, 0.25, 0.5, 0.75, 1].map((f) => maks * f);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img"
         aria-label="Tren revenue deal per bulan tahun ini">
      <defs>
        <linearGradient id="gradTren" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>

      {kisi.map((v) => (
        <g key={v}>
          <line x1={padKiri} y1={y(v)} x2={W - 12} y2={y(v)} stroke="#f1f5f9" strokeWidth="1" />
          <text x={padKiri - 8} y={y(v) + 4} textAnchor="end" className="chart-tick">
            {ringkas(v)}
          </text>
        </g>
      ))}

      {target ? (
        <line x1={padKiri} y1={y(target)} x2={W - 12} y2={y(target)}
              stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="6 4" />
      ) : null}

      <path d={area} fill="url(#gradTren)" />
      <path d={garis} fill="none" stroke="#3b82f6" strokeWidth="2.5"
            strokeLinejoin="round" strokeLinecap="round" />

      {nilai.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill="#fff" stroke="#3b82f6" strokeWidth="2">
          <title>{`${BULAN[i]}: ${formatRupiah(v)}`}</title>
        </circle>
      ))}

      {BULAN.map((b, i) => (
        <text key={b} x={x(i)} y={H - 8} textAnchor="middle" className="chart-tick">
          {b}
        </text>
      ))}
    </svg>
  );
}

/** Donat komposisi status penawaran. */
export function DonatStatus({
  data,
}: {
  data: { label: string; nilai: number; warna: string }[];
}) {
  const total = data.reduce((s, d) => s + d.nilai, 0);
  const R = 70;
  const tebal = 26;
  const keliling = 2 * Math.PI * R;

  let offset = 0;

  return (
    <svg viewBox="0 0 200 200" className="chart chart-donut" role="img"
         aria-label="Komposisi status penawaran">
      {total === 0 ? (
        <circle cx="100" cy="100" r={R} fill="none" stroke="#f1f5f9" strokeWidth={tebal} />
      ) : (
        data.map((d) => {
          const panjang = (d.nilai / total) * keliling;
          const el = (
            <circle
              key={d.label}
              cx="100" cy="100" r={R}
              fill="none"
              stroke={d.warna}
              strokeWidth={tebal}
              strokeDasharray={`${panjang} ${keliling - panjang}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 100 100)"
            >
              <title>{`${d.label}: ${d.nilai}`}</title>
            </circle>
          );
          offset += panjang;
          return el;
        })
      )}
    </svg>
  );
}

/** Bar mendatar — dipakai untuk perbandingan sederhana antar kategori. */
export function BarMendatar({
  data,
}: {
  data: { label: string; nilai: number; warna: string }[];
}) {
  const maks = Math.max(...data.map((d) => d.nilai), 1);
  return (
    <div className="bars">
      {data.map((d) => (
        <div className="bar-row" key={d.label}>
          <span className="bar-label">{d.label}</span>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${(d.nilai / maks) * 100}%`, background: d.warna }}
            />
          </div>
          <span className="bar-value">{d.nilai}</span>
        </div>
      ))}
    </div>
  );
}
