'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/form';
import { Field, FormError, SubmitButton } from '@/components/FormControls';

type Customer = {
  id: string;
  name: string;
  company: string | null;
  address: string | null;
  phone: string | null;
};

export function CustomerForm({
  action,
  customer,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  customer?: Customer;
}) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <form action={formAction}>
      {customer ? <input type="hidden" name="id" value={customer.id} /> : null}

      <FormError state={state} />

      <Field
        label="Nama Klien"
        name="name"
        state={state}
        defaultValue={customer?.name}
        required
        autoFocus
      />

      <div className="form-grid">
        <Field
          label="Perusahaan"
          name="company"
          state={state}
          defaultValue={customer?.company ?? ''}
        />
        <Field
          label="Kontak"
          name="phone"
          state={state}
          defaultValue={customer?.phone ?? ''}
          placeholder="0812…"
        />
      </div>

      <Field
        label="Alamat"
        name="address"
        state={state}
        defaultValue={customer?.address ?? ''}
      />

      <div className="form-actions">
        <SubmitButton>{customer ? 'Simpan Perubahan' : 'Tambah Klien'}</SubmitButton>
        <Link className="btn" href="/klien">
          Batal
        </Link>
      </div>
    </form>
  );
}
