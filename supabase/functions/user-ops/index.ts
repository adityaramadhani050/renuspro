// =============================================================================
//  Edge Function: user-ops
//  Manajemen user (butuh service_role → Supabase Auth admin):
//   action 'create' → simpanUser  (buat auth user email+password + app_user)
//   action 'edit'    → editUser    (update app_user; ganti password/email auth)
//   action 'delete'  → hapusUser   (hapus app_user + auth user)
//  Login RenusPro memakai Supabase Auth (email+password), profil di app_user
//  (dikaitkan via auth_uid). Karena itu tulis user WAJIB lewat server.
//
//  Deploy:  supabase functions deploy user-ops
//  Panggil: POST {SUPABASE_URL}/functions/v1/user-ops  body: { action, ...payload }
// =============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

function normalizePhone(v: unknown): string {
  let s = (v ?? '').toString().trim().replace(/[^0-9]/g, '');
  if (!s) return '';
  if (s.startsWith('0')) s = '62' + s.slice(1);
  else if (s.startsWith('8')) s = '62' + s;
  return s;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json();
    const action = body.action;
    const p = body.payload || {};

    // Ambil semua app_user (untuk cek duplikat + generate id).
    async function allUsers() {
      const out: any[] = []; let from = 0;
      for (;;) {
        const { data, error } = await sb.from('app_user').select('id,username,auth_uid').range(from, from + 999);
        if (error) throw new Error(error.message);
        out.push(...(data || []));
        if (!data || data.length < 1000) break; from += 1000;
      }
      return out;
    }

    if (action === 'create') {
      const nama = (p.nama || '').toString().trim();
      const username = (p.username || '').toString().trim().toLowerCase();
      const password = (p.password || '').toString();
      const role = (p.role || '').toString().toLowerCase();
      const email = (p.email || '').toString().trim().toLowerCase();
      if (!nama || !username || !password || !role) return json({ success: false, message: 'Semua field wajib diisi.' });
      if (!email) return json({ success: false, message: 'Email wajib diisi (untuk login Supabase).' });
      if (password.length < 6) return json({ success: false, message: 'Password minimal 6 karakter.' });

      const users = await allUsers();
      if (users.some((u) => (u.username || '').toString().trim().toLowerCase() === username))
        return json({ success: false, message: 'Username "' + username + '" sudah digunakan.' });

      // Buat auth user (email terkonfirmasi agar bisa langsung login).
      const created = await sb.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error || !created.data?.user) return json({ success: false, message: 'Gagal membuat akun auth: ' + (created.error?.message || 'unknown') });
      const authUid = created.data.user.id;

      // Generate id U###.
      let maxNum = 0;
      users.forEach((u) => { const m = (u.id || '').toString().match(/^U(\d+)/i); if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10)); });
      const nextId = 'U' + String(maxNum + 1).padStart(3, '0');

      const ins = await sb.from('app_user').insert({
        id: nextId, nama, username, role, aktif: true, target_bulanan: 0,
        lead_id: (p.leadId || '') || null, no_whatsapp: normalizePhone(p.noWa), email, auth_uid: authUid,
      });
      if (ins.error) {
        // Rollback auth user bila gagal simpan profil.
        try { await sb.auth.admin.deleteUser(authUid); } catch (_e) { /* ignore */ }
        return json({ success: false, message: ins.error.message });
      }
      return json({ success: true, message: 'User ' + nextId + ' (' + nama + ') berhasil ditambahkan!' });
    }

    if (action === 'edit') {
      const id = (p.id || '').toString().trim();
      const nama = (p.nama || '').toString().trim();
      const username = (p.username || '').toString().trim().toLowerCase();
      const role = (p.role || '').toString().toLowerCase();
      if (!id || !nama || !username || !role) return json({ success: false, message: 'Data tidak lengkap.' });

      const users = await allUsers();
      const self = users.find((u) => (u.id || '').toString().trim() === id);
      if (!self) return json({ success: false, message: 'User tidak ditemukan.' });
      if (users.some((u) => (u.id || '').toString().trim() !== id && (u.username || '').toString().trim().toLowerCase() === username))
        return json({ success: false, message: 'Username "' + username + '" sudah digunakan user lain.' });

      const upd: Record<string, unknown> = {
        nama, username, role,
        aktif: p.aktif === true || p.aktif === 'TRUE' || p.aktif === true,
        target_bulanan: parseFloat(p.targetBulanan) || 0,
        lead_id: (p.leadId || '') || null,
      };
      if (p.noWa !== undefined && p.noWa !== null) upd.no_whatsapp = normalizePhone(p.noWa);
      const emailVal = (p.email === undefined || p.email === null) ? '' : (p.email || '').toString().trim().toLowerCase();
      if (emailVal) upd.email = emailVal;

      const up = await sb.from('app_user').update(upd).eq('id', id);
      if (up.error) return json({ success: false, message: up.error.message });

      // Update auth (password &/atau email) bila ada auth_uid.
      if (self.auth_uid) {
        const authUpd: Record<string, unknown> = {};
        if ((p.password || '').toString().trim()) authUpd.password = (p.password || '').toString().trim();
        if (emailVal) authUpd.email = emailVal;
        if (Object.keys(authUpd).length) {
          const au = await sb.auth.admin.updateUserById(self.auth_uid, authUpd);
          if (au.error) return json({ success: false, message: 'Profil tersimpan, tapi gagal update akun auth: ' + au.error.message });
        }
      }
      return json({ success: true, message: 'User ' + id + ' berhasil diperbarui!' });
    }

    if (action === 'delete') {
      const id = (p.id || '').toString().trim();
      if (!id) return json({ success: false, message: 'ID user wajib.' });
      const { data: row } = await sb.from('app_user').select('auth_uid').eq('id', id).maybeSingle();
      if (!row) return json({ success: false, message: 'User tidak ditemukan.' });
      const del = await sb.from('app_user').delete().eq('id', id);
      if (del.error) return json({ success: false, message: del.error.message });
      if (row.auth_uid) { try { await sb.auth.admin.deleteUser(row.auth_uid); } catch (_e) { /* ignore */ } }
      return json({ success: true, message: 'User ' + id + ' berhasil dihapus.' });
    }

    return json({ success: false, message: 'Action tidak dikenal: ' + action }, 400);
  } catch (e) {
    return json({ success: false, message: (e as Error).message || 'Server error.' }, 500);
  }
});
