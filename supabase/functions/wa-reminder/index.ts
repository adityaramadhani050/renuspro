// =============================================================================
//  Edge Function: wa-reminder
//  Reminder harian penawaran expired (grup WA_TARGET). Dipanggil pg_cron TIAP
//  JAM; fungsi ini cek sendiri apakah jam WIB == reminderHour (jadi jadwal bisa
//  diubah dari Settings tanpa mengubah cron). Query pakai '?force=1' untuk uji
//  manual (abaikan gate jam).
//
//  Kualifikasi (sama dgn Apps Script): rev tertinggi per penawaran, status
//  'On-Progress', valid_hingga <= besok (reminderMulai=valid-1hari), dan
//  (bukan force) selang >= reminderInterval hari sejak reminder_expired.
//
//  Deploy: supabase functions deploy wa-reminder
// =============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

function wibToday(): string { const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const g = (t: string) => p.find((e) => e.type === t)?.value || ''; return `${g('year')}-${g('month')}-${g('day')}`; }
function wibHour(): number { return parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false }).format(new Date()), 10); }
function isoDate(v: unknown): string | null { const s = (v ?? '').toString(); const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`; const d = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (d) return `${d[3]}-${('0' + d[2]).slice(-2)}-${('0' + d[1]).slice(-2)}`; return null; }
function days(a: string, b: string): number { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }
function fmtTgl(iso: string): string { const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const force = new URL(req.url).searchParams.get('force') === '1';
    const { data: row } = await sb.from('app_config').select('value').eq('key', 'WA_CONFIG').maybeSingle();
    const cfg: Record<string, unknown> = (row?.value as Record<string, unknown>) || {};
    if (!(cfg.enabled === true) || !cfg.endpoint || !cfg.target) return json({ skipped: true, reason: 'disabled / endpoint / target kosong' });
    const hour = parseInt(cfg.reminderHour as string, 10) || 8;
    if (!force && wibHour() !== hour) return json({ skipped: true, reason: 'bukan jam terjadwal (WIB ' + wibHour() + ' != ' + hour + ')' });
    const intervalHari = parseInt(cfg.reminderInterval as string, 10) || 3;
    const today = wibToday();

    const rows: Record<string, unknown>[] = []; let from = 0;
    for (;;) { const { data, error } = await sb.from('penawaran').select('no_penawaran,rev,valid_hingga,nama_project,klien_id,dibuat_oleh,status,reminder_expired').range(from, from + 999); if (error) return json({ error: error.message }, 500); rows.push(...(data || [])); if (!data || data.length < 1000) break; from += 1000; }
    const { data: klien } = await sb.from('klien').select('id,nama_klien'); const km: Record<string, string> = {}; (klien || []).forEach((k: Record<string, unknown>) => { if (k.id != null) km[(k.id as string).toString()] = (k.nama_klien as string) || ''; });

    const latest: Record<string, Record<string, unknown>> = {};
    rows.forEach((r) => { const no = ((r.no_penawaran as string) || '').toString(); if (!no) return; const rev = parseInt(r.rev as string, 10) || 0; if (!latest[no] || (latest[no]._rev as number) < rev) { r._rev = rev; latest[no] = r; } });
    const list: { noPenawaran: string; namaProject: string; namaKlien: string; dibuatOleh: string; validHingga: string }[] = [];
    Object.keys(latest).forEach((no) => {
      const r = latest[no]; if (((r.status as string) || 'On-Progress') !== 'On-Progress') return;
      const vh = isoDate(r.valid_hingga); if (!vh) return; if (days(today, vh) > 1) return;
      const last = isoDate(r.reminder_expired); if (!force && last && days(last, today) < intervalHari) return;
      list.push({ noPenawaran: no, namaProject: ((r.nama_project as string) || '').toString(), namaKlien: km[((r.klien_id as string) || '').toString()] || ((r.klien_id as string) || '').toString(), dibuatOleh: ((r.dibuat_oleh as string) || '').toString(), validHingga: fmtTgl(vh) });
    });
    if (!list.length) return json({ sent: 0, count: 0 });

    const lines = ['⏰ *Reminder Follow-up Penawaran*', 'Penawaran berikut akan/sudah lewat tanggal berlaku, mohon segera follow-up ke customer:', '', '📊 Total: *' + list.length + '* penawaran perlu di-follow-up', ''];
    const groups: Record<string, typeof list> = {}, urut: string[] = [];
    list.forEach((it) => { const s = it.dibuatOleh || 'Tanpa Sales'; if (!groups[s]) { groups[s] = []; urut.push(s); } groups[s].push(it); });
    urut.forEach((s, gi) => { lines.push('👤 *' + s + '* (' + groups[s].length + ' penawaran)'); groups[s].forEach((it, i) => lines.push((i + 1) + '. ' + it.noPenawaran + ' - ' + it.namaProject + ' (' + it.namaKlien + ') #Exp. ' + it.validHingga)); if (gi < urut.length - 1) lines.push(''); });
    const message = lines.join('\n');

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cfg.token) headers['Authorization'] = 'Bearer ' + cfg.token;
    let sent = 0;
    try { const rr = await fetch((cfg.endpoint as string).replace(/\/$/, '') + '/api/messages/send', { method: 'POST', headers, body: JSON.stringify({ phone: cfg.target, message }) }); if (rr.ok) sent = 1; } catch (_e) { /* best-effort */ }

    const now = new Date().toISOString();
    for (const it of list) { await sb.from('penawaran').update({ reminder_expired: now }).eq('no_penawaran', it.noPenawaran); }
    return json({ sent, count: list.length });
  } catch (e) {
    return json({ error: (e as Error).message || 'Server error.' }, 500);
  }
});
