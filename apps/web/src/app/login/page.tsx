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
  const [modeLupa, setModeLupa] = useState(false);
  const [kabar, setKabar] = useState<string | null>(null);

  /** Sistem lama memakai username; Supabase Auth memakai email. */
  function keEmail(nilai: string) {
    const domain = process.env.NEXT_PUBLIC_AUTH_EMAIL_DOMAIN;
    return nilai.includes('@') || !domain
      ? nilai.trim()
      : `${nilai.trim().toLowerCase()}@${domain}`;
  }

  async function onKirimTautan(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setKabar(null);

    const { error: gagal } = await createClient().auth.resetPasswordForEmail(
      keEmail(identity),
      { redirectTo: `${window.location.origin}/reset-password` }
    );

    setBusy(false);

    if (gagal) {
      setError(gagal.message);
      return;
    }

    // Sengaja tidak membedakan email terdaftar dan tidak: kalau dibedakan,
    // halaman ini jadi alat untuk menebak siapa saja yang punya akun.
    setKabar(
      'Kalau email itu terdaftar, tautan penetapan password sudah dikirim. ' +
        'Tautannya berlaku satu jam dan hanya bisa dipakai sekali.'
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    // Selama masa peralihan username tetap diterima dan dilengkapi domain
    // default, agar kebiasaan pengguna tidak berubah.
    const { error: signInError } = await createClient().auth.signInWithPassword({
      email: keEmail(identity),
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
      <form className="login-card" onSubmit={modeLupa ? onKirimTautan : onSubmit}>
        <h1>{modeLupa ? 'Lupa password' : 'Masuk ke RenusPro'}</h1>
        <p className="sub">PT. Renus Global Indonesia</p>

        {error ? <div className="error">{error}</div> : null}
        {kabar ? <div className="note" style={{ marginTop: 0 }}>{kabar}</div> : null}

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

        {modeLupa ? null : (
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
        )}

        <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Memproses…' : modeLupa ? 'Kirim tautan penetapan password' : 'Masuk'}
        </button>

        <p className="note">
          <button
            type="button"
            className="tautan-teks"
            onClick={() => {
              setModeLupa((v) => !v);
              setError(null);
              setKabar(null);
            }}
          >
            {modeLupa ? '← Kembali ke halaman masuk' : 'Lupa password?'}
          </button>
          <br />
          Password lama dari sistem Google Sheets tidak berlaku lagi. Kalau Anda
          belum pernah menetapkan password baru, mintalah tautan lewat tombol di
          atas.
        </p>
      </form>
    </div>
  );
}
