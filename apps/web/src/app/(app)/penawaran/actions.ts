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
