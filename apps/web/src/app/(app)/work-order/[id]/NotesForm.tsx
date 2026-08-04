'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/form';
import { saveWorkOrderNotes } from '../actions';

export function NotesForm({ id, notes }: { id: string; notes: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(
    saveWorkOrderNotes,
    EMPTY_FORM_STATE
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      {state.error ? <div className="error">{state.error}</div> : null}
      {state.ok ? <div className="ok-msg">Catatan tersimpan.</div> : null}

      <div className="inline-form">
        <textarea
          name="notes"
          rows={3}
          defaultValue={notes}
          placeholder="Progres pekerjaan, kendala di lapangan, dsb."
          aria-label="Catatan Work Order"
        />
        <Submit />
      </div>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? 'Menyimpan…' : 'Simpan Catatan'}
    </button>
  );
}
