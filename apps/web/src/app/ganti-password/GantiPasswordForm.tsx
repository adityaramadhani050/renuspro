'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { pesanGalatAuth } from '@/lib/auth-errors';

const PANJANG_MINIMAL = 8;

/**
 * Password awal ditolak di sini supaya pagar tidak bisa dilewati dengan
 * "mengganti" password menjadi password yang sama. Penolakan sungguhannya
 * tetap di database — halaman ini hanya menjelaskannya lebih cepat, sebelum
 * pengguna menekan tombol dan menunggu.
 */
const PASSWORD_AWAL = '123456';

export function GantiPasswordForm({ wajib }: { wajib: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [ulangi, setUlangi] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selesai, setSelesai] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.trim() === PASSWORD_AWAL) {
      setError(
        'Itu password awal yang dipakai semua orang. Pilih yang hanya Anda ketahui.'
      );
      return;
    }
    if (password.length < PANJANG_MINIMAL) {
      setError(`Password minimal ${PANJANG_MINIMAL} karakter.`);
      return;
    }
    if (password !== ulangi) {
      setError('Kedua isian password belum sama.');
      return;
    }

    setBusy(true);
    const { error: gagal } = await createClient().auth.updateUser({ password });

    if (gagal) {
      setError(pesanGalatAuth(gagal));
      setBusy(false);
      return;
    }

    setSelesai(true);
    setBusy(false);
    router.replace('/');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      {error ? <div className="error">{error}</div> : null}

      <div className="field">
        <label htmlFor="password">Password baru</label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={PANJANG_MINIMAL}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="ulangi">Ulangi password baru</label>
        <input
          id="ulangi"
          type="password"
          autoComplete="new-password"
          required
          value={ulangi}
          onChange={(e) => setUlangi(e.target.value)}
        />
      </div>

      <button
        type="submit"
        className="btn btn-primary"
        disabled={busy || selesai}
        style={{ width: '100%' }}
      >
        {selesai ? 'Berhasil — mengalihkan…' : busy ? 'Menyimpan…' : 'Simpan password'}
      </button>

      <p className="note">
        Minimal {PANJANG_MINIMAL} karakter. Pilih yang tidak dipakai di tempat
        lain — di sini tersimpan seluruh data penawaran, harga, dan tagihan
        perusahaan.
        {wajib ? null : (
          <>
            {' '}
            <a href="/">Kembali tanpa mengganti</a>
          </>
        )}
      </p>
    </form>
  );
}
