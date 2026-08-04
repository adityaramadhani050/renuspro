import { redirect } from 'next/navigation';
import { getCurrentProfile, pakaiPasswordDefault } from '@/lib/supabase/server';
import { GantiPasswordForm } from './GantiPasswordForm';

/**
 * Halaman ganti password.
 *
 * Berada DI LUAR grup (app) dengan sengaja. Layout (app) menahan pengguna yang
 * masih memakai password awal dan mengalihkannya ke sini; kalau halaman ini
 * ikut berada di dalam grup itu, ia akan mengalihkan ke dirinya sendiri.
 */
export default async function GantiPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ wajib?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login?error=no-profile');

  // Sumber kebenarannya tetap database, bukan parameter URL — parameter itu
  // hanya menentukan kata-kata di layar, dan siapa pun bisa mengubahnya.
  const wajib = await pakaiPasswordDefault();

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>{wajib ? 'Ganti password dulu' : 'Ganti password'}</h1>
        <p className="sub">{profile.full_name}</p>

        {wajib ? (
          <div className="error" style={{ background: '#fff4e5', color: '#b25e02' }}>
            Anda masih memakai password awal yang dibagikan ke semua orang.
            Selama belum diganti, data belum bisa dibuka.
          </div>
        ) : null}

        <GantiPasswordForm wajib={wajib} />
      </div>
    </div>
  );
}
