'use client';

import { useFormStatus } from 'react-dom';
import type { FormState } from '@/lib/form';

export function SubmitButton({
  children,
  variant = 'primary',
}: {
  children: React.ReactNode;
  variant?: 'primary' | 'danger';
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={variant === 'danger' ? 'btn btn-danger' : 'btn btn-primary'}
      disabled={pending}
    >
      {pending ? 'Menyimpan…' : children}
    </button>
  );
}

export function FormError({ state }: { state: FormState }) {
  if (!state.error) return null;
  return <div className="error">{state.error}</div>;
}

export function Field({
  label,
  name,
  state,
  hint,
  ...rest
}: {
  label: string;
  name: string;
  state: FormState;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const error = state.fieldErrors?.[name];
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : hint ? `${name}-hint` : undefined}
        {...rest}
      />
      {error ? (
        <div className="field-error" id={`${name}-error`}>
          {error}
        </div>
      ) : hint ? (
        <div className="field-hint" id={`${name}-hint`}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}
