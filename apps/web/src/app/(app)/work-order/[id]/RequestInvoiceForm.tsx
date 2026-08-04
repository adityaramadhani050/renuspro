'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/form';
import { requestInvoice } from '../actions';

/**
 * Sales meminta finance menerbitkan invoice.
 *
 * Sales sengaja tidak bisa menerbitkan invoice sendiri — itu ditegakkan RLS
 * (`can_manage_finance()`), bukan sekadar disembunyikan dari tampilan.
 */
export function RequestInvoiceForm({ workOrderId }: { workOrderId: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(
    requestInvoice,
    EMPTY_FORM_STATE
  );

  return (
    <form action={formAction} style={{ marginBottom: 16 }}>
      <input type="hidden" name="work_order_id" value={workOrderId} />
      {state.error ? <div className="error">{state.error}</div> : null}
      {state.ok ? <div className="ok-msg">Permintaan terkirim ke tim Finance.</div> : null}

      <div className="inline-form">
        <textarea
          name="message"
          rows={2}
          placeholder="Mis. mohon terbitkan termin 2 sebesar 30%"
          aria-label="Pesan permintaan invoice"
        />
        <Submit />
      </div>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn" disabled={pending}>
      {pending ? 'Mengirim…' : 'Minta Invoice'}
    </button>
  );
}
