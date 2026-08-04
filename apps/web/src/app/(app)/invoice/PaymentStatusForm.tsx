'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/form';
import { setPaymentStatus } from './actions';

/**
 * Tombol lunas / batal lunas.
 *
 * Saat dilunasi, kwitansi terbit otomatis dalam transaksi yang sama di
 * database — tidak ada langkah terpisah yang bisa terlewat.
 */
export function PaymentStatusForm({
  id,
  current,
}: {
  id: string;
  current: 'Lunas' | 'Belum Lunas';
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    setPaymentStatus,
    EMPTY_FORM_STATE
  );
  const next = current === 'Lunas' ? 'Belum Lunas' : 'Lunas';

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (
          current === 'Lunas' &&
          !confirm('Batalkan status lunas? Kwitansi yang sudah terbit tidak ikut terhapus.')
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={next} />
      {state.error ? <div className="error" style={{ margin: 0 }}>{state.error}</div> : null}
      <Submit label={current === 'Lunas' ? 'Batal lunas' : 'Tandai lunas'} />
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn" disabled={pending} style={{ fontSize: 13, padding: '5px 10px' }}>
      {pending ? '…' : label}
    </button>
  );
}
