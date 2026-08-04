'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getText, getNumber, describeDbError, type FormState } from '@/lib/form';

function validate(fd: FormData) {
  const fieldErrors: Record<string, string> = {};

  const name = getText(fd, 'name');
  const unit = getText(fd, 'unit') || 'unit';
  const price = getNumber(fd, 'price');
  const cost = getNumber(fd, 'cost');

  if (!name) fieldErrors.name = 'Nama produk/jasa wajib diisi.';
  if (price === null) fieldErrors.price = 'Harga tidak dikenali sebagai angka.';
  else if (price < 0) fieldErrors.price = 'Harga tidak boleh negatif.';
  if (cost === null) fieldErrors.cost = 'HPP tidak dikenali sebagai angka.';
  else if (cost < 0) fieldErrors.cost = 'HPP tidak boleh negatif.';

  return { fieldErrors, values: { name, unit, price: price ?? 0, cost: cost ?? 0 } };
}

export async function createProduct(_prev: FormState, fd: FormData): Promise<FormState> {
  const { fieldErrors, values } = validate(fd);
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.from('products').insert(values);

  if (error) return { error: describeDbError(error) };

  revalidatePath('/produk');
  redirect('/produk');
}

export async function updateProduct(_prev: FormState, fd: FormData): Promise<FormState> {
  const id = getText(fd, 'id');
  if (!id) return { error: 'ID produk tidak ditemukan.' };

  const { fieldErrors, values } = validate(fd);
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase
    .from('products')
    .update({ ...values, is_active: fd.get('is_active') === 'on' })
    .eq('id', id);

  if (error) return { error: describeDbError(error) };

  revalidatePath('/produk');
  redirect('/produk');
}

/**
 * Hapus produk.
 *
 * Produk yang pernah dipakai di penawaran TIDAK ikut terhapus datanya:
 * quotation_items memakai `on delete set null`, sehingga deskripsi dan harga
 * historis pada penawaran lama tetap utuh. Ini disengaja — dokumen yang sudah
 * terbit tidak boleh berubah karena master data disunting.
 */
export async function deleteProduct(_prev: FormState, fd: FormData): Promise<FormState> {
  const id = getText(fd, 'id');
  if (!id) return { error: 'ID produk tidak ditemukan.' };

  const supabase = await createClient();
  const { error } = await supabase.from('products').delete().eq('id', id);

  if (error) return { error: describeDbError(error) };

  revalidatePath('/produk');
  redirect('/produk');
}
