'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getText, getNumber, describeDbError, type FormState } from '@/lib/form';

export type CreateInvoiceResult =
  | { ok: true; invoice_id: string; invoice_number: string }
  | { ok: false; error: string };

/**
 * Menerbitkan invoice lewat RPC create_invoice().
 *
 * DPP dan sisa kontrak dihitung DI DALAM transaksi penyisipan, bukan di form.
 * Kalau dihitung di klien, dua orang finance yang membuka form bersamaan akan
 * melihat sisa yang sama lalu keduanya menerbitkan invoice — dan kontrak jadi
 * tertagih melebihi nilainya.
 */
export async function createInvoice(
  _prev: CreateInvoiceResult | null,
  fd: FormData
): Promise<CreateInvoiceResult> {
  // Sumber tagihan datang sebagai "wo:<uuid>" atau "quot:<uuid>".
  const source = getText(fd, 'source');
  const [kind, id] = source.split(':');

  if (!id) return { ok: false, error: 'Pilih Work Order atau penawaran terlebih dahulu.' };

  const payload = {
    work_order_id: kind === 'wo' ? id : null,
    quotation_id: kind === 'quot' ? id : null,
    issue_date: getText(fd, 'issue_date'),
    type: getText(fd, 'type') || 'Penuh',
    input_mode: getText(fd, 'input_mode') || 'persen',
    percent: getNumber(fd, 'percent') ?? 0,
    dpp: getNumber(fd, 'dpp') ?? 0,
    po_number: getText(fd, 'po_number'),
    po_date: getText(fd, 'po_date'),
    bank_account_id: getText(fd, 'bank_account_id'),
    notes: getText(fd, 'notes'),
  };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_invoice', { p_payload: payload });

  if (error) return { ok: false, error: describeDbError(error) };

  const result = data as { invoice_id: string; invoice_number: string };

  revalidatePath('/invoice');
  revalidatePath('/work-order');
  return { ok: true, ...result };
}

/**
 * Ubah status bayar. Saat dilunasi, kwitansi terbit otomatis dalam transaksi
 * yang sama — menggantikan updateStatusBayarInvoice() (Invoice.gs:502) yang
 * memanggil pencatatan tanggal bayar dan pembuatan kwitansi secara terpisah.
 */
export async function setPaymentStatus(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const id = getText(fd, 'id');
  const status = getText(fd, 'status');

  if (!id) return { error: 'Invoice tidak ditemukan.' };
  if (status !== 'Lunas' && status !== 'Belum Lunas') {
    return { error: 'Status tidak dikenali.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_invoice_payment_status', {
    p_invoice_id: id,
    p_status: status,
  });

  if (error) return { error: describeDbError(error) };

  revalidatePath('/invoice');
  revalidatePath('/work-order');
  return { ok: true };
}
