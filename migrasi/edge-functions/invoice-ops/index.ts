// =============================================================================
//  Edge Function: invoice-ops
//  Operasi Invoice yang FINANSIAL & MULTI-TABEL (atomik di server):
//   action 'create'    → simpanInvoice (hitung DPP/PPN, nomor invoice)
//   action 'setStatus'  → updateStatusBayarInvoice (Lunas → auto Kwitansi +
//                         auto Pemasukan; Belum Lunas → hapus Pemasukan)
//  Memakai service_role agar bisa menulis banyak tabel dengan konsisten.
//
//  Deploy:  supabase functions deploy invoice-ops
//  Panggil: POST {SUPABASE_URL}/functions/v1/invoice-ops
//           body: { action, ...payload }
// =============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

function wibParts() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const g = (t: string) => p.find((e) => e.type === t)?.value || '';
  return { y: g('year'), m: g('month'), d: g('day') };
}
function todayIso() { const { y, m, d } = wibParts(); return `${y}-${m}-${d}`; }
function romanMonthYear() { const { y, m } = wibParts(); return { mon: ROMAN[parseInt(m, 10) - 1], yr: y }; }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json();
    const action = body.action;

    // ── Helper: ambil semua baris (pagination) ──
    async function all(table: string, sel: string) {
      const out: any[] = []; let from = 0;
      for (;;) {
        const { data, error } = await sb.from(table).select(sel).range(from, from + 999);
        if (error) throw new Error(error.message);
        out.push(...(data || []));
        if (!data || data.length < 1000) break; from += 1000;
      }
      return out;
    }
    async function nextSeq(table: string, idField: string, prefix: string) {
      const rows = await all(table, idField);
      let max = 0;
      for (const r of rows) { const id = (r[idField] || '').toString(); if (id.startsWith(prefix)) { const s = parseInt(id.slice(prefix.length), 10) || 0; if (s > max) max = s; } }
      return prefix + ('000' + (max + 1)).slice(-3);
    }

    // ═══════════════════════ CREATE ═══════════════════════
    if (action === 'create') {
      const p = body.payload || {};
      const isPredeal = !p.noWO;
      let wo: any;
      if (isPredeal) {
        if (!p.noPenawaran) return json({ success: false, message: 'No. Penawaran tidak ditemukan.' });
        const pen = await all('penawaran', 'no_penawaran,rev,subtotal,diskon,pajak,klien_id,nama_project,items');
        const rows = pen.filter((r) => (r.no_penawaran || '') === p.noPenawaran).sort((a, b) => (parseInt(b.rev) || 0) - (parseInt(a.rev) || 0));
        if (!rows.length) return json({ success: false, message: 'Penawaran tidak ditemukan.' });
        const r = rows[0];
        const k = await sb.from('klien').select('nama_klien').eq('id', r.klien_id || '').maybeSingle();
        wo = { subtotal: r.subtotal, diskon: r.diskon, pajak: r.pajak, id: r.no_penawaran, klienId: r.klien_id, namaKlien: k.data?.nama_klien || '', namaProject: r.nama_project, items: r.items };
        if (p.jenis !== 'DP') return json({ success: false, message: 'Invoice pre-deal hanya boleh jenis DP.' });
      } else {
        const w = await sb.from('work_order').select('subtotal,diskon,pajak,no_penawaran,klien_id,nama_klien,nama_project,items').eq('no_wo', p.noWO).maybeSingle();
        if (w.error || !w.data) return json({ success: false, message: 'Work Order tidak ditemukan.' });
        const r = w.data;
        wo = { subtotal: r.subtotal, diskon: r.diskon, pajak: r.pajak, id: r.no_penawaran, klienId: r.klien_id, namaKlien: r.nama_klien, namaProject: r.nama_project, items: r.items };
      }

      const nilaiKontrak = Math.max(0, (Number(wo.subtotal) || 0) - (Number(wo.diskon) || 0));
      const ppnPersen = nilaiKontrak > 0 ? Math.round((Number(wo.pajak) || 0) / nilaiKontrak * 100) : 0;

      const inv = await all('invoice', 'no_wo,no_penawaran,dpp');
      let ditagihDpp = 0;
      for (const r of inv) {
        if (isPredeal) { if ((r.no_penawaran || '') === wo.id) ditagihDpp += Number(r.dpp) || 0; }
        else { if ((r.no_wo || '') === p.noWO) ditagihDpp += Number(r.dpp) || 0; }
      }
      const sisaDpp = Math.max(0, nilaiKontrak - ditagihDpp);

      const jenis = p.jenis || 'Penuh';
      let dpp: number, persen: number;
      if (jenis === 'Pelunasan') { dpp = sisaDpp; persen = 0; }
      else if (jenis === 'Penuh') { dpp = nilaiKontrak; persen = 100; }
      else if (p.inputMode === 'nominal') { dpp = Math.round(parseFloat(p.dpp) || 0); persen = nilaiKontrak > 0 ? Math.round(dpp / nilaiKontrak * 100) : 0; }
      else { persen = parseFloat(p.persen) || 0; dpp = Math.round(persen / 100 * nilaiKontrak); }

      if (dpp <= 0) return json({ success: false, message: 'Nilai tagihan harus lebih dari 0.' });
      if (dpp > sisaDpp + 1) return json({ success: false, message: `Nilai tagihan (Rp ${dpp.toLocaleString('id-ID')}) melebihi sisa kontrak (Rp ${Math.round(sisaDpp).toLocaleString('id-ID')}).` });

      const ppnNominal = Math.round(dpp * ppnPersen / 100);
      const total = dpp + ppnNominal;
      let scope: any = []; try { scope = typeof wo.items === 'string' ? JSON.parse(wo.items || '[]') : (wo.items || []); } catch (_) { scope = []; }
      const meta = { scope, nilaiKontrak, inputMode: p.inputMode || 'persen' };

      // Nomor invoice: NNN/RGI/INV/{roman}/{year}
      let maxId = 0;
      for (const r of inv) { const m = (r as any).no_invoice; } // no_invoice not selected above; re-scan:
      const invIds = await all('invoice', 'no_invoice');
      for (const r of invIds) { const m = (r.no_invoice || '').toString().match(/^(\d+)\/RGI(?:-INV|\/INV)/); if (m) { const n = parseInt(m[1], 10); if (n > maxId) maxId = n; } }
      const { mon, yr } = romanMonthYear();
      const noInvoice = `${('00' + (maxId + 1)).slice(-3)}/RGI/INV/${mon}/${yr}`;

      const ins = await sb.from('invoice').insert({
        no_invoice: noInvoice, no_wo: isPredeal ? '' : p.noWO, no_penawaran: wo.id, tanggal: (p.tanggal && /^\d{4}-\d{2}-\d{2}/.test(p.tanggal)) ? p.tanggal.slice(0, 10) : todayIso(),
        jenis, persen, no_po: p.noPO || '', tgl_po: (p.tglPO && /^\d{4}-\d{2}-\d{2}/.test(p.tglPO)) ? p.tglPO.slice(0, 10) : null,
        klien_id: wo.klienId, nama_klien: wo.namaKlien, nama_project: wo.namaProject,
        dpp, ppn_persen: ppnPersen, ppn_nominal: ppnNominal, total, rincian_item: meta,
        status_bayar: 'Belum Lunas', catatan: p.catatan || '', dibuat_oleh: p.dibuatOleh || 'Finance', bank_account: p.bankAccount || '',
      });
      if (ins.error) return json({ success: false, message: ins.error.message });
      return json({ success: true, message: 'Invoice ' + noInvoice + ' berhasil dibuat!', noInvoice });
    }

    // ═══════════════════════ EDIT ═══════════════════════
    if (action === 'edit') {
      const p = body.payload || {};
      const id = (p.id || '').toString();
      const cur = await sb.from('invoice').select('*').eq('no_invoice', id).maybeSingle();
      if (cur.error || !cur.data) return json({ success: false, message: 'Invoice tidak ditemukan.' });
      const oldDpp = Number(cur.data.dpp) || 0;
      const isStub = !(cur.data.no_wo || '') && !(cur.data.no_penawaran || '');
      const resolvedNoWO = isStub ? (p.noWO || '') : (cur.data.no_wo || '');
      const resolvedNoPen = isStub ? (p.noPenawaran || '') : (cur.data.no_penawaran || '');
      const isPredeal = !resolvedNoWO;
      let wo: any;
      if (isPredeal) {
        if (!resolvedNoPen) return json({ success: false, message: 'Pilih Work Order atau Penawaran terlebih dahulu.' });
        const pen = await all('penawaran', 'no_penawaran,rev,subtotal,diskon,pajak,klien_id,nama_project,items');
        const rows = pen.filter((r) => (r.no_penawaran || '') === resolvedNoPen).sort((a, b) => (parseInt(b.rev) || 0) - (parseInt(a.rev) || 0));
        if (!rows.length) return json({ success: false, message: 'Penawaran tidak ditemukan.' });
        const r = rows[0]; const k = await sb.from('klien').select('nama_klien').eq('id', r.klien_id || '').maybeSingle();
        wo = { subtotal: r.subtotal, diskon: r.diskon, pajak: r.pajak, id: r.no_penawaran, klienId: r.klien_id, namaKlien: k.data?.nama_klien || '', namaProject: r.nama_project, items: r.items };
        if (p.jenis !== 'DP') return json({ success: false, message: 'Invoice pre-deal hanya boleh jenis DP.' });
      } else {
        const w = await sb.from('work_order').select('subtotal,diskon,pajak,no_penawaran,klien_id,nama_klien,nama_project,items').eq('no_wo', resolvedNoWO).maybeSingle();
        if (w.error || !w.data) return json({ success: false, message: 'Work Order sumber tidak ditemukan.' });
        const r = w.data; wo = { subtotal: r.subtotal, diskon: r.diskon, pajak: r.pajak, id: r.no_penawaran, klienId: r.klien_id, namaKlien: r.nama_klien, namaProject: r.nama_project, items: r.items };
      }
      const nilaiKontrak = Math.max(0, (Number(wo.subtotal) || 0) - (Number(wo.diskon) || 0));
      const ppnPersen = nilaiKontrak > 0 ? Math.round((Number(wo.pajak) || 0) / nilaiKontrak * 100) : 0;
      const inv = await all('invoice', 'no_invoice,no_wo,no_penawaran,dpp');
      let ditagih = 0;
      for (const r of inv) { if (isPredeal) { if ((r.no_penawaran || '') === wo.id) ditagih += Number(r.dpp) || 0; } else { if ((r.no_wo || '') === resolvedNoWO) ditagih += Number(r.dpp) || 0; } }
      const sisaDpp = Math.max(0, nilaiKontrak - (ditagih - oldDpp));
      const jenis = p.jenis || 'Penuh';
      let dpp: number, persen: number;
      if (jenis === 'Pelunasan') { dpp = sisaDpp; persen = 0; }
      else if (jenis === 'Penuh') { dpp = nilaiKontrak; persen = 100; }
      else if (p.inputMode === 'nominal') { dpp = Math.round(parseFloat(p.dpp) || 0); persen = nilaiKontrak > 0 ? Math.round(dpp / nilaiKontrak * 100) : 0; }
      else { persen = parseFloat(p.persen) || 0; dpp = Math.round(persen / 100 * nilaiKontrak); }
      if (dpp <= 0) return json({ success: false, message: 'Nilai tagihan harus lebih dari 0.' });
      if (dpp > sisaDpp + 1) return json({ success: false, message: `Nilai tagihan (Rp ${dpp.toLocaleString('id-ID')}) melebihi sisa kontrak (Rp ${Math.round(sisaDpp).toLocaleString('id-ID')}).` });
      const ppnNominal = Math.round(dpp * ppnPersen / 100); const total = dpp + ppnNominal;
      let scope: any = []; try { scope = typeof wo.items === 'string' ? JSON.parse(wo.items || '[]') : (wo.items || []); } catch (_) { scope = []; }
      const meta = { scope, nilaiKontrak, inputMode: p.inputMode || 'persen' };
      const upd: any = {
        tanggal: (p.tanggal && /^\d{4}-\d{2}-\d{2}/.test(p.tanggal)) ? p.tanggal.slice(0, 10) : todayIso(),
        jenis, persen, no_po: p.noPO || '', tgl_po: (p.tglPO && /^\d{4}-\d{2}-\d{2}/.test(p.tglPO)) ? p.tglPO.slice(0, 10) : null,
        dpp, ppn_persen: ppnPersen, ppn_nominal: ppnNominal, total, rincian_item: meta, catatan: p.catatan || '', bank_account: p.bankAccount || '',
      };
      if (isStub) { upd.no_wo = isPredeal ? '' : resolvedNoWO; upd.no_penawaran = wo.id; upd.klien_id = wo.klienId; upd.nama_klien = wo.namaKlien; upd.nama_project = wo.namaProject; }
      const u = await sb.from('invoice').update(upd).eq('no_invoice', id);
      if (u.error) return json({ success: false, message: u.error.message });
      return json({ success: true, message: 'Invoice ' + id + ' berhasil diperbarui!' });
    }

    // ═══════════════════════ SET STATUS ═══════════════════════
    if (action === 'setStatus') {
      const idInvoice = (body.idInvoice || '').toString();
      const statusBaru = (body.statusBaru || '').toString();
      const bukti = body.bukti || {};
      const iv = await sb.from('invoice').select('*').eq('no_invoice', idInvoice).maybeSingle();
      if (iv.error || !iv.data) return json({ success: false, message: 'Invoice tidak ditemukan.' });
      const row = iv.data;
      if (statusBaru === 'Lunas' && !(bukti.buktiFileUrl || '').toString().trim()) return json({ success: false, message: 'Bukti transaksi pembayaran wajib dilampirkan.' });

      const upd: any = { status_bayar: statusBaru };
      if (statusBaru === 'Lunas') { upd.tanggal_bayar = todayIso(); upd.bukti_file_id = bukti.buktiFileId || ''; upd.bukti_file_url = bukti.buktiFileUrl || ''; upd.bukti_file_nama = bukti.buktiFileName || ''; }
      const u = await sb.from('invoice').update(upd).eq('no_invoice', idInvoice);
      if (u.error) return json({ success: false, message: u.error.message });

      let noKwitansi = ''; let kwitansiBaru = false;
      const jenis = (row.jenis || 'Penuh').toString();
      const persen = parseFloat(row.persen) || 0;

      if (statusBaru === 'Lunas') {
        const kw = await sb.from('kwitansi').select('no_kwitansi').eq('no_invoice', idInvoice).maybeSingle();
        if (kw.data) { noKwitansi = kw.data.no_kwitansi; }
        else {
          const kwIds = await all('kwitansi', 'no_kwitansi');
          let kmax = 0; for (const r of kwIds) { const m = (r.no_kwitansi || '').toString().match(/^(\d+)\/RGI(?:-KW|\/KWT)/); if (m) { const n = parseInt(m[1], 10); if (n > kmax) kmax = n; } }
          const { mon, yr } = romanMonthYear();
          noKwitansi = `${('00' + (kmax + 1)).slice(-3)}/RGI/KWT/${mon}/${yr}`;
          const untuk = 'Pembayaran ' + jenis + (persen > 0 ? ' ' + persen + '%' : '') + ' - ' + (row.nama_project || '');
          const ik = await sb.from('kwitansi').insert({ no_kwitansi: noKwitansi, no_invoice: idInvoice, no_wo: row.no_wo || '', tanggal: todayIso(), terima_dari: row.nama_klien || '', jumlah: Number(row.total) || 0, untuk_pembayaran: untuk, metode: 'Transfer', catatan: '', dibuat_oleh: 'Sistem' });
          if (ik.error) return json({ success: false, message: ik.error.message });
          kwitansiBaru = true;
        }

        // Auto-pemasukan (nilai = DPP). Akun kas dari bank_account text → akun_pembayaran.
        const bankText = (row.bank_account || '').toString().trim();
        let idAkun = '', namaAkun = '';
        if (bankText) {
          const ap = await all('akun_pembayaran', 'id,nama_akun,detail');
          const hit = ap.find((a) => (a.detail || '').toString().trim() === bankText);
          if (hit) { idAkun = (hit.id || '').toString(); namaAkun = (hit.nama_akun || '').toString(); }
        }
        // Idempoten: jangan dobel bila sudah ada pemasukan untuk invoice ini.
        const exPem = await sb.from('pemasukan').select('id_pemasukan').eq('id_referensi', idInvoice).limit(1);
        if (!exPem.data || !exPem.data.length) {
          const idPem = await nextSeq('pemasukan', 'id_pemasukan', 'IN-' + todayIso().slice(0, 7).replace('-', '') + '-');
          const desk = 'Pembayaran ' + jenis + (persen > 0 ? ' ' + persen + '%' : '') + ' - ' + (row.nama_klien || '') + (row.nama_project ? ' (' + row.nama_project + ')' : '');
          await sb.from('pemasukan').insert({ id_pemasukan: idPem, tanggal: todayIso(), sumber: 'Invoice', kategori: 'Pembayaran Invoice', id_akun: idAkun, nama_akun: namaAkun, no_invoice_ref: idInvoice, id_referensi: idInvoice, deskripsi: desk, jumlah: Number(row.dpp) || 0, catatan: '', dibuat_oleh: 'Sistem', dibuat_pada: new Date().toISOString() });
        }
      } else if (statusBaru === 'Belum Lunas') {
        await sb.from('pemasukan').delete().eq('id_referensi', idInvoice);
      }

      const msg = statusBaru === 'Lunas'
        ? (kwitansiBaru ? 'Invoice dilunasi. Kwitansi ' + noKwitansi + ' otomatis dibuat.' : 'Status diperbarui: Lunas. Kwitansi ' + noKwitansi + ' sudah ada.')
        : 'Status bayar diperbarui: ' + statusBaru;
      return json({ success: true, message: msg, statusBaru, noKwitansi });
    }

    return json({ success: false, message: 'Aksi tidak dikenal.' }, 400);
  } catch (e) {
    return json({ success: false, message: String(e) }, 500);
  }
});
