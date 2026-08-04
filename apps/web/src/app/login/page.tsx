'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

const MESSAGES: Record<string, string> = {
  'no-profile':
    'Akun Anda belum terhubung ke profil RenusPro. Hubungi administrator.',
  inactive: 'Akun ini tidak aktif. Hubungi administrator.',
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    MESSAGES[params.get('error') ?? ''] ?? null
  );
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    // Sistem lama memakai username; Supabase Auth memakai email. Selama masa
    // peralihan, username tetap diterima dan dilengkapi domain default agar
    // kebiasaan pengguna tidak berubah.
    const domain = process.env.NEXT_PUBLIC_AUTH_EMAIL_DOMAIN;
    const email =
      identity.includes('@') || !domain
        ? identity.trim()
        : `${identity.trim().toLowerCase()}@${domain}`;

    const { error: signInError } = await createClient().auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError('Username/email atau password salah.');
      setBusy(false);
      return;
    }

    router.replace(params.get('next') || '/');
    router.refresh();
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <h1>Masuk ke RenusPro</h1>
        <p className="sub">PT. Renus Global Indonesia</p>

        {error ? <div className="error">{error}</div> : null}

        <div className="field">
          <label htmlFor="identity">Username atau email</label>
          <input
            id="identity"
            type="text"
            autoComplete="username"
            required
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Memproses…' : 'Masuk'}
        </button>

        <p className="note">
          Password lama dari sistem Google Sheets tidak berlaku lagi. Kalau Anda
          belum pernah menetapkan password baru, minta administrator mengirim
          undangan.
        </p>
      </form>
    </div>
  );
}
