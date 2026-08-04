'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/form';
import { Field, FormError, SubmitButton } from '@/components/FormControls';

type Product = {
  id: string;
  legacy_code: string | null;
  name: string;
  unit: string;
  price: number;
  cost: number;
  is_active: boolean;
};

export function ProductForm({
  action,
  product,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  product?: Product;
}) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <form action={formAction}>
      {product ? <input type="hidden" name="id" value={product.id} /> : null}

      <FormError state={state} />

      <Field
        label="Nama Jasa/Produk"
        name="name"
        state={state}
        defaultValue={product?.name}
        required
        autoFocus
      />

      <div className="form-grid">
        <Field
          label="Unit"
          name="unit"
          state={state}
          defaultValue={product?.unit ?? 'unit'}
          placeholder="unit / kWp / m / set"
        />
        <Field
          label="Harga Satuan"
          name="price"
          state={state}
          defaultValue={product ? String(product.price) : ''}
          inputMode="numeric"
          hint="Boleh diketik 2.500.000"
        />
        <Field
          label="HPP"
          name="cost"
          state={state}
          defaultValue={product ? String(product.cost) : ''}
          inputMode="numeric"
          hint="Harga pokok penjualan"
        />
      </div>

      {product ? (
        <label className="checkbox">
          <input type="checkbox" name="is_active" defaultChecked={product.is_active} />
          Produk aktif (muncul di pilihan form penawaran)
        </label>
      ) : null}

      <div className="form-actions">
        <SubmitButton>{product ? 'Simpan Perubahan' : 'Tambah Produk'}</SubmitButton>
        <Link className="btn" href="/produk">
          Batal
        </Link>
      </div>
    </form>
  );
}
