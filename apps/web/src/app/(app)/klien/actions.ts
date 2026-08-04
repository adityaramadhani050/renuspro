'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getText, describeDbError, type FormState } from '@/lib/form';

function validate(fd: FormData) {
  const fieldErrors: Record<string, string> = {};

  const name = getText(fd, 'name');
  if (!name) fieldErrors.name = 'Nama klien wajib diisi.';

  return {
    fieldErrors,
    values: {
      name,
      company: getText(fd, 'company') || null,
      address: getText(fd, 'address') || null,
      phone: getText(fd, 'phone') || null,
    },
  };
}

export async function createCustomer(_prev: FormState, fd: FormData): Promise<FormState> {
  const { fieldErrors, values } = validate(fd);
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.from('customers').insert(values);

  if (error) return { error: describeDbError(error) };

  revalidatePath('/klien');
  redirect('/klien');
}

export async function updateCustomer(_prev: FormState, fd: FormData): Promise<FormState> {
  const id = getText(fd, 'id');
  if (!id) return { error: 'ID klien tidak ditemukan.' };

  const { fieldErrors, values } = validate(fd);
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.from('customers').update(values).eq('id', id);

  if (error) return { error: describeDbError(error) };

  revalidatePath('/klien');
  redirect('/klien');
}

/**
 * Hapus klien.
 *
 * Berbeda dengan produk, `quotations.customer_id` memakai `on delete restrict`:
 * klien yang masih punya penawaran TIDAK bisa dihapus. Sistem lama
 * (`Customer.gs:70`) menghapusnya begitu saja, meninggalkan penawaran yang
 * merujuk ID yang tidak ada lagi — di dashboard ia muncul sebagai kode mentah
 * "K007" alih-alih nama klien.
 */
export async function deleteCustomer(_prev: FormState, fd: FormData): Promise<FormState> {
  const id = getText(fd, 'id');
  if (!id) return { error: 'ID klien tidak ditemukan.' };

  const supabase = await createClient();
  const { error } = await supabase.from('customers').delete().eq('id', id);

  if (error) return { error: describeDbError(error) };

  revalidatePath('/klien');
  redirect('/klien');
}
