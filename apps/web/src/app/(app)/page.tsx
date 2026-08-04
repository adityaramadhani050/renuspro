import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { formatRupiah } from '@/lib/query';
import { TrenRevenue, DonatStatus } from '@/components/Charts';
import { Progres } from '@/components/Progres';
import { PeriodePills, rentangPeriode, type Preset } from '@/components/PeriodePills';
import type { DashboardKpi, LeaderboardRow, PipelineHealth, StaleRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Dashboard Sales.
 *
 * Menggantikan Page_Dashboard.html + JS_Dashboard.html (37 KB). Di sana
 * getDashboardRawData() mengirim SETIAP baris penawaran ke browser, lalu
 * seluruh penjumlahan, pengelompokan, dan pengurutan dikerjakan di sana — dan
 * biayanya tumbuh setiap kali ada penawaran baru. Di sini lima panggilan RPC
 * mengembalikan angka yang sudah jadi.
 *
 * Susunan panelnya sengaja tidak diubah: urutan kartu, arti warnanya, dan
 * letak tiap blok sama seperti yang sudah dihafal tim.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const preset = (sp.periode ?? 'bulan-ini') as Preset;
  const { dari, sampai, label } = rentangPeriode(preset, sp.from, sp.to);

  const supabase = await createClient();
  const tahun = Number(sampai.slice(0, 4));

  const [kpiRes, trenRes, boardRes, healthRes, staleRes] = await Promise.all([
    supabase.rpc('dashboard_kpi', { p_from: dari, p_to: sampai }).single<DashboardKpi>(),
    supabase.rpc('dashboard_trend', { p_tahun: tahun }),
    supabase.rpc('sales_leaderboard', { p_from: dari, p_to: sampai }),
    supabase.rpc('pipeline_health').single<PipelineHealth>(),
    supabase.rpc('pipeline_stale', { p_min_hari: 30 }),
  ]);

  if (kpiRes.error) {
    return (
      <div className="card">
        <div className="empty">Gagal memuat dashboard: {kpiRes.error.message}</div>
      </div>
    );
  }

  const k = kpiRes.data!;
  const tren = (trenRes.data ?? []) as { bulan: number; revenue: number }[];
  const board = (boardRes.data ?? []) as LeaderboardRow[];
  const h = healthRes.data;
  const stale = (staleRes.data ?? []) as StaleRow[];

  const delta = (kini: number, lalu: number) =>
    lalu === 0 ? (kini > 0 ? 100 : 0) : ((kini - lalu) / lalu) * 100;

  const revDelta = delta(Number(k.revenue_deal), Number(k.revenue_prev));
  const dealDelta = Number(k.total_deal) - Number(k.deal_prev);

  // Dikelompokkan per sales seperti sistem lama: daftar panjang tanpa
  // penanggung jawab tidak menghasilkan tindakan apa pun.
  const perSales = new Map<string, StaleRow[]>();
  for (const s of stale) {
    if (!perSales.has(s.nama_sales)) perSales.set(s.nama_sales, []);
    perSales.get(s.nama_sales)!.push(s);
  }

  return (
    <>
      <div className="page-head">
        <h2>Ringkasan Performa Tim Sales</h2>
      </div>

      <PeriodePills aktif={preset} label={label} from={sp.from} to={sp.to} />

      {/* ── Empat kartu utama ─────────────────────────────────────────── */}
      <div className="kpi-grid">
        <div className="kpi">
          <div className="label">
            Revenue Deal <DeltaBadge nilai={revDelta} satuan="%" />
          </div>
          <div className="value money" style={{ color: 'var(--emerald-600)' }}>
            {formatRupiah(k.revenue_deal)}
          </div>
          <div className="sub">Periode lalu: {formatRupiah(k.revenue_prev)}</div>
        </div>

        <div className="kpi">
          <div className="label">Penawaran Dibuat</div>
          <div className="value" style={{ color: 'var(--blue-600)' }}>
            {Number(k.jumlah_penawaran).toLocaleString('id-ID')}
          </div>
          <div className="sub">Termasuk semua status</div>
        </div>

        <div className="kpi">
          <div className="label">
            Total Deal <DeltaBadge nilai={dealDelta} satuan=" vs lalu" absolut />
          </div>
          <div className="value">{Number(k.total_deal).toLocaleString('id-ID')}</div>
          <div className="sub">
            Penawaran periode ini: {Number(k.jumlah_penawaran).toLocaleString('id-ID')}, sebelumnya:{' '}
            {Number(k.penawaran_prev).toLocaleString('id-ID')}
          </div>
        </div>

        <div className="kpi">
          <div className="label">Pipeline Aktif</div>
          <div className="value money" style={{ color: 'var(--amber-600)' }}>
            {formatRupiah(k.pipeline_nilai)}
          </div>
          <div className="sub">
            <strong>{Number(k.pipeline_jumlah).toLocaleString('id-ID')} penawaran</strong>
          </div>
        </div>
      </div>

      {/* ── Capaian target & statistik konversi ───────────────────────── */}
      <div className="dua-kolom">
        <div className="card pad">
          <Progres
            judul="Capaian Target Bulanan"
            nilai={Number(k.realisasi_bulanan)}
            target={Number(k.target_bulanan)}
          />
          <Progres
            judul="Capaian Target Tahunan"
            nilai={Number(k.realisasi_setahun)}
            target={Number(k.target_setahun)}
          />
        </div>

        <div className="card pad">
          <h3 className="panel-title">Statistik Konversi</h3>
          <div className="mini-grid">
            <MiniStat label="Avg Win Rate" nilai={`${Number(k.win_rate_pct)}%`}
                      sub="deals / penawaran" tone="blue" />
            <MiniStat label="Avg Nilai Deal" nilai={formatRupiah(k.avg_nilai_deal)}
                      sub="per deal" tone="green" />
            <MiniStat label="Avg Margin Deal" nilai={`${Number(k.avg_margin_pct)}%`}
                      sub="dari penawaran deal" tone="violet" />
            <MiniStat label="Avg Sales Cycle" nilai={`${Number(k.avg_sales_cycle)} hari`}
                      sub="penawaran → deal" tone="cyan" />
          </div>
        </div>
      </div>

      {/* ── Grafik ────────────────────────────────────────────────────── */}
      <div className="dua-kolom">
        <div className="card pad">
          <h3 className="panel-title">Tren Revenue Tahun {tahun}</h3>
          <TrenRevenue data={tren} target={Number(k.target_bulanan)} />
        </div>

        <div className="card pad">
          <h3 className="panel-title">Status Penawaran</h3>
          <StatusPenawaran deal={Number(k.total_deal)} total={Number(k.jumlah_penawaran)} />
        </div>
      </div>

      {/* ── Pipeline health ───────────────────────────────────────────── */}
      {h ? (
        <>
          <h3 className="section-title">Pipeline Health</h3>
          <div className="card pad">
            <div className="kpi-grid cols-3" style={{ marginBottom: 18 }}>
              <div className="kpi green">
                <div className="label">Pipeline Coverage</div>
                <div className="value">{Number(h.coverage)}×</div>
                <div className="sub">pipeline / sisa target tahunan — sehat (≥3×)</div>
              </div>
              <div className="kpi amber">
                <div className="label">Nilai Pipeline Aktif</div>
                <div className="value money">{formatRupiah(h.pipeline_nilai)}</div>
                <div className="sub">{Number(h.pipeline_jumlah)} penawaran On-Progress</div>
              </div>
              <div className="kpi">
                <div className="label">Sisa Target Tahunan</div>
                <div className="value money">{formatRupiah(h.sisa_target)}</div>
                <div className="sub">target tahunan − revenue tahun ini</div>
              </div>
            </div>

            <h4 className="sub-title">
              Aging Pipeline <span className="muted">(umur sejak penawaran terbit)</span>
            </h4>
            <div className="kpi-grid">
              <Aging label="0–30 hari"   n={h.umur_0_30_n}   v={h.umur_0_30_v}   tone="green" />
              <Aging label="31–60 hari"  n={h.umur_31_60_n}  v={h.umur_31_60_v}  tone="blue" />
              <Aging label="61–90 hari"  n={h.umur_61_90_n}  v={h.umur_61_90_v}  tone="amber" />
              <Aging label="&gt;90 hari" n={h.umur_90plus_n} v={h.umur_90plus_v} tone="red" />
            </div>
          </div>
        </>
      ) : null}

      {/* ── Penawaran mengendap ───────────────────────────────────────── */}
      {stale.length ? (
        <>
          <h3 className="section-title">
            Penawaran Stale{' '}
            <span className="muted">(&gt; 30 hari) — {stale.length} penawaran</span>
          </h3>
          {[...perSales.entries()].map(([nama, baris]) => (
            <details className="card akordion" key={nama}>
              <summary>
                <span>{nama}</span>
                <span className="muted">
                  {baris.length} penawaran ·{' '}
                  {formatRupiah(baris.reduce((s, b) => s + Number(b.nilai), 0))}
                </span>
              </summary>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 190 }}>No Penawaran</th>
                    <th>Klien / Project</th>
                    <th className="num" style={{ width: 150 }}>Nilai</th>
                    <th className="num" style={{ width: 100 }}>Umur</th>
                  </tr>
                </thead>
                <tbody>
                  {baris.slice(0, 25).map((b) => (
                    <tr key={b.quotation_id}>
                      <td>
                        <Link href={`/penawaran/${b.quotation_id}`} className="link-strong">
                          {b.quote_number}
                        </Link>
                        <div className="muted" style={{ fontSize: 12 }}>{b.issue_date}</div>
                      </td>
                      <td>
                        <div className="muted" style={{ fontSize: 12 }}>{b.customer}</div>
                        {b.project}
                      </td>
                      <td className="num">{formatRupiah(b.nilai)}</td>
                      <td className="num">
                        <span className="badge badge-fail">{b.umur_hari} hari</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {baris.length > 25 ? (
                <div className="empty" style={{ padding: 14 }}>
                  … dan {baris.length - 25} penawaran lagi
                </div>
              ) : null}
            </details>
          ))}
        </>
      ) : null}

      {/* ── Leaderboard ───────────────────────────────────────────────── */}
      <h3 className="section-title">Leaderboard Sales</h3>
      <div className="card">
        {board.length === 0 ? (
          <div className="empty">Belum ada data sales pada periode ini.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 70 }}>Rank</th>
                <th>Nama Sales</th>
                <th className="num" style={{ width: 100 }}>Penawaran</th>
                <th className="num" style={{ width: 150 }}>Nilai Total</th>
                <th className="num" style={{ width: 80 }}>Deal</th>
                <th className="num" style={{ width: 160 }}>Revenue Deal</th>
                <th className="num" style={{ width: 110 }}>Avg Margin</th>
                <th className="num" style={{ width: 100 }}>Win Rate</th>
                <th className="num" style={{ width: 150 }}>Target</th>
                <th style={{ width: 110 }}>Capaian</th>
              </tr>
            </thead>
            <tbody>
              {board.map((r, i) => (
                <tr key={r.owner_id}>
                  <td><span className={`rank rank-${i + 1}`}>{i + 1}</span></td>
                  <td><strong>{r.nama_sales}</strong></td>
                  <td className="num">{Number(r.penawaran)}</td>
                  <td className="num">{formatRupiah(r.nilai_total)}</td>
                  <td className="num" style={{ color: 'var(--blue-600)', fontWeight: 700 }}>
                    {Number(r.deal)}
                  </td>
                  <td className="num" style={{ color: 'var(--emerald-600)', fontWeight: 700 }}>
                    {formatRupiah(r.revenue_deal)}
                  </td>
                  <td className="num" style={{ color: '#7c3aed', fontWeight: 600 }}>
                    {Number(r.avg_margin_pct) ? `${Number(r.avg_margin_pct)}%` : '—'}
                  </td>
                  <td className="num">{Number(r.win_rate_pct)}%</td>
                  <td className="num">
                    {Number(r.target) ? formatRupiah(r.target) : <span className="muted">—</span>}
                  </td>
                  <td><CapaianBadge target={Number(r.target)} pct={Number(r.capaian_pct)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ── Potongan kecil ─────────────────────────────────────────────────────────

function DeltaBadge({
  nilai,
  satuan,
  absolut = false,
}: {
  nilai: number;
  satuan: string;
  absolut?: boolean;
}) {
  if (!Number.isFinite(nilai) || nilai === 0) return null;
  const naik = nilai > 0;
  const angka = absolut ? Math.abs(nilai) : Math.abs(nilai).toFixed(1);
  return (
    <span className={`delta ${naik ? 'naik' : 'turun'}`}>
      {naik ? '▲' : '▼'} {angka}
      {satuan}
    </span>
  );
}

function MiniStat({
  label,
  nilai,
  sub,
  tone,
}: {
  label: string;
  nilai: string;
  sub: string;
  tone: 'blue' | 'green' | 'violet' | 'cyan';
}) {
  return (
    <div className={`mini ${tone}`}>
      <div className="mini-label">{label}</div>
      <div className="mini-value">{nilai}</div>
      <div className="mini-sub">{sub}</div>
    </div>
  );
}

function Aging({
  label,
  n,
  v,
  tone,
}: {
  label: string;
  n: number;
  v: number;
  tone: 'green' | 'blue' | 'amber' | 'red';
}) {
  return (
    <div className={`kpi ${tone}`}>
      <div className="label">{label}</div>
      <div className="value">{Number(n)}</div>
      <div className="sub">{formatRupiah(v)}</div>
    </div>
  );
}

function CapaianBadge({ target, pct }: { target: number; pct: number }) {
  if (!target) return <span className="badge badge-netral">No Target</span>;
  if (pct >= 100) return <span className="badge badge-deal">✓ Tercapai</span>;
  return <span className={`badge ${pct > 0 ? 'badge-progress' : 'badge-fail'}`}>{pct}%</span>;
}

function StatusPenawaran({ deal, total }: { deal: number; total: number }) {
  // dashboard_kpi() tidak memisahkan Fail, jadi yang ditampilkan dua kategori
  // yang memang tersedia. Mencantumkan "Fail: 0" padahal angkanya tidak
  // dihitung lebih menyesatkan daripada tidak mencantumkannya sama sekali.
  const lain = Math.max(total - deal, 0);
  const data = [
    { label: 'Deal', nilai: deal, warna: '#10b981' },
    { label: 'Belum Deal', nilai: lain, warna: '#3b82f6' },
  ];
  return (
    <div className="donut-wrap">
      <DonatStatus data={data} />
      <ul className="legend">
        {data.map((d) => (
          <li key={d.label}>
            <span className="dot" style={{ background: d.warna }} />
            {d.label}
            <span className="legend-n">{d.nilai}</span>
            <span className="badge badge-netral">
              {total ? Math.round((d.nilai / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
