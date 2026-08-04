import { createClient } from '@/lib/supabase/server';
import { formatRupiah, formatNumber } from '@/lib/query';
import type { DashboardSummary } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Dashboard.
 *
 * Perbedaan pokok dengan versi lama: getDashboardRawData() mengirim SELURUH
 * baris penawaran ke browser lalu KPI dihitung di sana (JS_Dashboard.html,
 * 37 KB). Di sini satu panggilan RPC mengembalikan sepuluh angka, dan seluruh
 * agregasi dikerjakan Postgres.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc('dashboard_summary', {
      p_from: from || null,
      p_to: to || null,
      p_owner_id: null, // RLS sudah membatasi sales ke penawarannya sendiri
    })
    .single<DashboardSummary>();

  if (error) {
    return (
      <div className="card">
        <div className="empty">Gagal memuat dashboard: {error.message}</div>
      </div>
    );
  }

  const s = data!;

  return (
    <>
      <form method="get" className="search" style={{ marginBottom: 18 }}>
        <label htmlFor="from" style={{ fontSize: 13, color: 'var(--muted)' }}>
          Periode
        </label>
        <input id="from" type="text" name="from" placeholder="YYYY-MM-DD" defaultValue={from ?? ''} />
        <span style={{ color: 'var(--muted)' }}>s/d</span>
        <input type="text" name="to" placeholder="YYYY-MM-DD" defaultValue={to ?? ''} />
        <button className="btn" type="submit">
          Terapkan
        </button>
      </form>

      <div className="kpi-grid">
        <Kpi label="Revenue (Deal)" value={formatRupiah(s.revenue)} sub={`${formatNumber(s.total_deal)} penawaran deal`} />
        <Kpi label="Pipeline (On-Progress)" value={formatRupiah(s.pipeline_value)} sub={`${formatNumber(s.total_progress)} penawaran berjalan`} />
        <Kpi label="Estimasi Keuntungan" value={formatRupiah(s.est_profit)} sub={`Margin rata-rata ${s.avg_margin_pct}%`} />
        <Kpi label="Win Rate" value={`${s.win_rate_pct}%`} sub={`${formatNumber(s.total_deal)} deal / ${formatNumber(s.total_fail)} gagal`} />
        <Kpi label="Total Penawaran" value={formatNumber(s.total_quotations)} />
        <Kpi label="Total HPP (Deal)" value={formatRupiah(s.total_cost)} />
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Catatan migrasi</h2>
        </div>
        <div style={{ padding: '16px', fontSize: 14, color: 'var(--muted)', lineHeight: 1.65 }}>
          <p style={{ marginTop: 0 }}>
            Angka di atas dihitung oleh Postgres lewat satu panggilan{' '}
            <code>dashboard_summary()</code>, bukan dengan mengirim seluruh data
            penawaran ke browser seperti sistem lama.
          </p>
          <p style={{ marginBottom: 0 }}>
            Modul <strong>Penawaran, Work Order, Invoice</strong> dan{' '}
            <strong>Kwitansi</strong> masih dilayani Apps Script dan akan
            dipindahkan pada tahap berikutnya. Selama itu, jangan menulis data
            modul tersebut dari dua tempat.
          </p>
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}
