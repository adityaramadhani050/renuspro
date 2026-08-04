'use client';

/**
 * Halaman penetapan password baru.
 *
 * Tautan pemulihan dari Supabase mendarat di sini membawa token pada BAGIAN
 * HASH URL (`#access_token=...&type=recovery`). Hash tidak pernah dikirim ke
 * server, jadi seluruh proses di berkas ini berjalan di browser — dan karena
 * itu pula middleware harus membiarkan halaman ini terbuka: saat halaman
 * pertama dimuat, cookie sesi belum ada sama sekali.
 *
 * Dua hal yang ditangani dengan sengaja:
 *
 * 1. Token dihapus dari address bar begitu selesai dipakai. Selama masih
 *    tertera di sana, ia ikut terbawa setiap kali URL disalin atau layar
 *    difoto — dan token itu setara dengan sesi login penuh selama satu jam.
 *
 * 2. Tautan kedaluwarsa dijelaskan sebagai kedaluwarsa. Tanpa itu, layar
 *    hanya diam dan pengguna menyimpulkan sistemnya rusak.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const PANJANG_MINIMAL = 8;

type Keadaan = 'memeriksa' | 'siap' | 'tanpa-token';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [keadaan, setKeadaan] = useState<Keadaan>('memeriksa');
  const [password, setPassword] = useState('');
  const [ulangi, setUlangi] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selesai, setSelesai] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));

      // Supabase menuliskan kegagalan ke hash juga — paling sering tautan yang
      // sudah lewat satu jam, atau yang sudah pernah dipakai.
      const kodeError = hash.get('error_code') || hash.get('error');
      if (kodeError) {
        setError(
          /expired|otp_expired/i.test(kodeError)
            ? 'Tautan ini sudah kedaluwarsa. Mintalah tautan baru — setiap tautan hanya berlaku satu jam dan hanya bisa dipakai sekali.'
            : (hash.get('error_description') ?? 'Tautan pemulihan tidak berlaku.')
        );
        bersihkanHash();
        setKeadaan('tanpa-token');
        return;
      }

      // getSession() menunggu supabase-js selesai membaca hash lebih dulu,
      // jadi pemanggilan ini sudah mencakup kasus tautan pemulihan.
      let { data } = await supabase.auth.getSession();

      // Cadangan: kalau pembacaan otomatis tidak berjalan, token di hash masih
      // bisa dipasang sendiri. Lebih baik daripada memaksa pengguna meminta
      // tautan ulang karena selisih perilaku antar versi pustaka.
      if (!data.session) {
        const accessToken = hash.get('access_token');
        const refreshToken = hash.get('refresh_token');
        if (accessToken && refreshToken) {
          const dipasang = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          data = dipasang.data.session ? { session: dipasang.data.session } : data;
        }
      }

      bersihkanHash();
      setKeadaan(data.session ? 'siap' : 'tanpa-token');
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

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
      setError(
        /session|jwt|expired/i.test(gagal.message)
          ? 'Sesi pemulihan sudah berakhir. Mintalah tautan baru lalu ulangi.'
          : gagal.message
      );
      setBusy(false);
      return;
    }

    setSelesai(true);
    setBusy(false);
    router.replace('/');
    router.refresh();
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <h1>Tetapkan password baru</h1>
        <p className="sub">PT. Renus Global Indonesia</p>

        {error ? <div className="error">{error}</div> : null}

        {keadaan === 'memeriksa' ? (
          <p className="muted">Memeriksa tautan…</p>
        ) : keadaan === 'tanpa-token' ? (
          <p className="note" style={{ marginTop: 0 }}>
            Halaman ini hanya bisa dibuka lewat tautan pemulihan yang dikirim ke
            email Anda. <a href="/login">Kembali ke halaman masuk</a> untuk
            meminta tautan baru.
          </p>
        ) : (
          <>
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
              Minimal {PANJANG_MINIMAL} karakter. Jangan pakai password lama
              dari sistem Google Sheets — password di sana tersimpan apa adanya
              dan harus dianggap sudah diketahui orang lain.
            </p>
          </>
        )}
      </form>
    </div>
  );
}

/** Hapus token dari address bar tanpa memuat ulang halaman. */
function bersihkanHash() {
  window.history.replaceState(null, '', window.location.pathname);
}
