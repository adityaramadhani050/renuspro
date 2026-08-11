// =============================================================================
//  Edge Function: wa-send
//  Kirim pesan WhatsApp via server Baileys. Token & endpoint dibaca dari
//  app_config (key 'WA_CONFIG') pakai service_role → token TIDAK pernah di
//  browser. Frontend menyusun pesan + daftar nomor, lalu memanggil ini.
//
//  Body: { phones?: string[], toTarget?: boolean, message: string }
//   - phones   : daftar nomor tujuan (DM). Kosong = tidak kirim DM.
//   - toTarget : true → kirim juga ke nomor/grup default (WA_CONFIG.target).
//  Balikan: { sent, total, skipped?, reason? }
//
//  Deploy:  supabase functions deploy wa-send
// =============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json();
    const message = (body.message || '').toString();
    if (!message) return json({ sent: 0, skipped: true, reason: 'empty message' });

    const { data: row } = await sb.from('app_config').select('value').eq('key', 'WA_CONFIG').maybeSingle();
    const cfg: Record<string, unknown> = (row?.value as Record<string, unknown>) || {};
    const enabled = cfg.enabled === true;
    const endpoint = (cfg.endpoint || '').toString().replace(/\/$/, '');
    const token = (cfg.token || '').toString();
    if (!enabled || !endpoint) return json({ sent: 0, skipped: true, reason: 'disabled or no endpoint' });

    const phones: string[] = Array.isArray(body.phones) ? body.phones.map((p: unknown) => (p || '').toString().trim()).filter(Boolean) : [];
    if (body.toTarget && cfg.target) phones.push((cfg.target as string).toString().trim());
    const uniq = Array.from(new Set(phones.filter(Boolean)));
    if (!uniq.length) return json({ sent: 0, skipped: true, reason: 'no recipients' });

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    let sent = 0;
    for (const phone of uniq) {
      try {
        const r = await fetch(endpoint + '/api/messages/send', { method: 'POST', headers, body: JSON.stringify({ phone, message }) });
        if (r.ok) sent++;
      } catch (_e) { /* best-effort per nomor */ }
    }
    return json({ sent, total: uniq.length });
  } catch (e) {
    return json({ success: false, message: (e as Error).message || 'Server error.' }, 500);
  }
});
