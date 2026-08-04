'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getText, describeDbError, type FormState } from '@/lib/form';

const ALLOWED = ['On-Progress', 'Deal', 'Fail'] as const;

/**
 * Ubah status penawaran.
 *
 * Menggantikan updateStatusPenawaran() (Penawaran.gs:316), yang harus memegang
 * ScriptLock lalu menulis tiga hal secara terpisah: status, No WO, dan tanggal
 * deal. Di sini cukup satu UPDATE — trigger database yang menerbitkan Work
 * Order dan mengisi tanggal deal, semuanya dalam satu transaksi.
 *
 * Perbedaan perilaku yang disengaja: keluar dari status Deal TIDAK menghapus
 * Work Order. Sistem lama menghapusnya (Penawaran.gs:345), padahal nomor WO
 * itu mungkin sudah dipakai di invoice — yang lalu menjadi yatim. Di sini
 * foreign key mencegahnya.
 */
export async function updateQuotationStatus(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const id = getText(fd, 'id');
  const status = getText(fd, 'status');

  if (!id) return { error: 'Penawaran tidak ditemukan.' };
  if (!(ALLOWED as readonly string[]).includes(status)) {
    return { error: 'Status tidak dikenali.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('quotations').update({ status }).eq('id', id);

  if (error) return { error: describeDbError(error) };

  revalidatePath('/penawaran');
  revalidatePath(`/penawaran/${id}`);
  return { ok: true };
}

// ── Simpan penawaran (baru atau revisi) ─────────────────────────────────────

export type QuotationItemInput = {
  product_id: string | null;
  description: string;
  qty: number;
  unit: string;
  price: number;
  cost: number;
};

export type QuotationGroupInput = {
  code: string | null;
  name: string;
  items: QuotationItemInput[];
};

export type QuotationPayload = {
  quotation_id: string | null;
  customer_id: string;
  project_name: string;
  issue_date: string;
  valid_until: string | null;
  discount: number;
  tax_percent: number;
  terms: Record<string, string>;
  groups: QuotationGroupInput[];
};

export type SaveResult =
  | { ok: true; quotation_id: string; quote_number: string; rev: number }
  | { ok: false; error: string };

/**
 * Menyimpan penawaran lewat RPC save_quotation().
 *
 * Seluruh angka uang dihitung ULANG oleh database dari item — nilai yang
 * dihitung di browser hanya untuk ditampilkan, tidak pernah dipercaya sebagai
 * yang tersimpan. Sistem lama menyimpan apa pun yang dikirim browser
 * (JS_Form_Penawaran.html:271 → Penawaran.gs:475).
 *
 * Empat tabel ditulis dalam satu transaksi; kalau ada yang gagal, tidak ada
 * penawaran separuh jadi yang tertinggal.
 */
export async function saveQuotation(payload: QuotationPayload): Promise<SaveResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('save_quotation', { p_payload: payload });

  if (error) {
    return { ok: false, error: describeDbError(error) };
  }

  const result = data as { quotation_id: string; quote_number: string; rev: number };

  revalidatePath('/penawaran');
  revalidatePath(`/penawaran/${result.quotation_id}`);

  return { ok: true, ...result };
}
