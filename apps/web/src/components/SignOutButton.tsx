'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';

export function SignOutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="btn"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await createClient().auth.signOut();
          router.replace('/login');
          router.refresh();
        });
      }}
    >
      {pending ? 'Keluar…' : 'Keluar'}
    </button>
  );
}
