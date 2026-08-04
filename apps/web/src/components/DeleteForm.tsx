'use client';

import { useActionState } from 'react';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/form';
import { FormError, SubmitButton } from '@/components/FormControls';

/**
 * Tombol hapus dengan konfirmasi.
 *
 * Konfirmasi memakai dialog bawaan browser, bukan modal buatan sendiri:
 * penghapusan cukup jarang sehingga tidak sebanding dengan biaya membuat dan
 * merawat komponen modal, dan `confirm()` tidak bisa dilewati kalau JS mati —
 * karena tanpa JS tombolnya memang tidak ikut terkirim.
 */
export function DeleteForm({
  action,
  id,
  label,
  confirmMessage,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  id: string;
  label: string;
  confirmMessage: string;
}) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm(confirmMessage)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <FormError state={state} />
      <SubmitButton variant="danger">{label}</SubmitButton>
    </form>
  );
}
