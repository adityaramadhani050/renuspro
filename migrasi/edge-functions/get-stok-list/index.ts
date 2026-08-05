// =============================================================================
//  Edge Function: get-stok-list
//  Padanan getStokList() (Inventory.gs) — TAPI field qtyHold & qtyAvailable
//  DIHITUNG (bukan kolom tabel), jadi TIDAK bisa `supa.from('stok').select('*')`
//  langsung. Itu sebabnya jadi Edge Function.
//
//  Logika (setia dengan Apps Script lama):
//   • qtyTersedia      = stok.qty_tersedia          (saldo fisik gudang)
//   • qtyHold          = Σ (bom_item.qty_reserved - bom_item.qty_dikirim)
//                        untuk baris dgn stok_id sama & selisih > 0
//                        (dialokasikan reserve tapi belum dikirim)
//   • qtyAvailable     = max(0, qtyTersedia - qtyHold)
//
//  Balikan HARUS sama persis dgn Apps Script: array objek (BUKAN {success,list}).
//  getStokList lama mengembalikan array langsung — pertahankan itu.
//
//  Deploy:  supabase functions deploy get-stok-list
//  Panggil: POST {SUPABASE_URL}/functions/v1/get-stok-list  (body kosong)
// =============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  // Preflight CORS.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Klien memakai identitas pemanggil (Authorization header diteruskan) →
    // RLS tetap berlaku. Env SUPABASE_URL & SUPABASE_ANON_KEY otomatis ada di
    // runtime Edge Function.
    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );

    // 1) Saldo stok fisik.
    const stokQ = await supa
      .from('stok')
      .select('id_produk,nama_produk,satuan,qty_tersedia,harga_beli_terakhir,nilai_stok,terakhir_diubah_pada')
      .order('id_produk');
    if (stokQ.error) return json({ success: false, message: stokQ.error.message }, 400);

    // 2) Peta HOLD dari bom_item (reserve belum dikirim).
    const bomQ = await supa
      .from('bom_item')
      .select('stok_id,qty_reserved,qty_dikirim')
      .not('stok_id', 'is', null);
    if (bomQ.error) return json({ success: false, message: bomQ.error.message }, 400);

    const holdMap: Record<string, number> = {};
    for (const r of bomQ.data ?? []) {
      const sid = (r.stok_id ?? '').toString();
      if (!sid) continue;
      const held = (Number(r.qty_reserved) || 0) - (Number(r.qty_dikirim) || 0);
      if (held > 0) holdMap[sid] = (holdMap[sid] || 0) + held;
    }

    // 3) Susun daftar (bentuk field IDENTIK dengan getStokList lama).
    const list = (stokQ.data ?? []).map((s) => {
      const id = (s.id_produk ?? '').toString();
      const qty = Number(s.qty_tersedia) || 0;
      const hold = Number(holdMap[id]) || 0;
      return {
        idStok: id,
        idProduk: id,
        namaProduk: (s.nama_produk ?? '').toString(),
        satuan: (s.satuan ?? '').toString(),
        qtyTersedia: qty,
        qtyHold: hold,
        qtyAvailable: Math.max(0, qty - hold),
        hargaBeliTerakhir: Number(s.harga_beli_terakhir) || 0,
        nilaiStok: Number(s.nilai_stok) || 0,
        terakhirDiubah: s.terakhir_diubah_pada ? s.terakhir_diubah_pada.toString() : '',
      };
    });

    // getStokList lama mengembalikan ARRAY langsung (bukan {success,list}).
    return json(list);
  } catch (e) {
    return json({ success: false, message: String(e) }, 500);
  }
});
