'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getText, describeDbError, type FormState } from '@/lib/form';

/**
 * Simpan catatan Work Order.
 *
 * Menggantikan simpanCatatanWO() (WorkOrder.gs:252), yang memegang ScriptLock
 * lalu memindai seluruh sheet WorkOrder_Catatan untuk mencari barisnya. Di sini
 * catatan adalah kolom pada work_orders — satu UPDATE bertarget.
 */
export async function saveWorkOrderNotes(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const id = getText(fd, 'id');
  if (!id) return { error: 'Work Order tidak ditemukan.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('work_orders')
    .update({
      notes: getText(fd, 'notes') || null,
      notes_updated_by: user?.id ?? null,
      notes_updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return { error: describeDbError(error) };

  revalidatePath(`/work-order/${id}`);
  return { ok: true };
}

/**
 * Permintaan penerbitan invoice dari sales ke finance.
 *
 * Menggantikan requestInvoice() (WorkOrder.gs:301) yang menulis ke sheet
 * WO_RequestInvoice berikut kolom klien/project/sales yang diduplikasi —
 * semuanya kini diturunkan lewat join.
 */
export async function requestInvoice(_prev: FormState, fd: FormData): Promise<FormState> {
  const workOrderId = getText(fd, 'work_order_id');
  if (!workOrderId) return { error: 'Work Order tidak ditemukan.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from('invoice_requests').insert({
    work_order_id: workOrderId,
    requested_by: user?.id ?? null,
    message: getText(fd, 'message') || null,
  });

  if (error) return { error: describeDbError(error) };

  revalidatePath(`/work-order/${workOrderId}`);
  return { ok: true };
}
