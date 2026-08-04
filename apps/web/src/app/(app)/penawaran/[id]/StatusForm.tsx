'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/form';
import { updateQuotationStatus } from '../actions';

const OPTIONS = ['On-Progress', 'Deal', 'Fail'] as const;

export function StatusForm({
  id,
  current,
  hasWorkOrder,
}: {
  id: string;
  current: string;
  hasWorkOrder: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    updateQuotationStatus,
    EMPTY_FORM_STATE
  );

  return (
    <form action={formAction} className="status-form">
      <input type="hidden" name="id" value={id} />

      {state.error ? <div className="error">{state.error}</div> : null}

      <label htmlFor="status">Ubah status</label>
      <div className="status-row">
        <select id="status" name="status" defaultValue={current}>
          {OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Submit />
      </div>

      <p className="field-hint">
        {current === 'Deal'
          ? hasWorkOrder
            ? 'Work Order sudah terbit. Mengubah status tidak menghapusnya — nomornya mungkin sudah dipakai di invoice.'
            : 'Work Order akan terbit otomatis.'
          : 'Mengubah ke Deal akan menerbitkan Work Order secara otomatis.'}
      </p>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? 'Menyimpan…' : 'Simpan'}
    </button>
  );
}
