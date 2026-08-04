import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentProfile, pakaiPasswordDefault } from '@/lib/supabase/server';
import { Sidebar } from '@/components/Sidebar';
import { SignOutButton } from '@/components/SignOutButton';
import { roleLabel, hasSalesModuleAccess } from '@/lib/roles';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  // Middleware sudah menolak pengunjung anonim; ini menangani kasus user
  // terautentikasi yang belum punya baris profiles, atau yang dinonaktifkan.
  if (!profile) redirect('/login?error=no-profile');
  if (!profile.is_active) redirect('/login?error=inactive');

  // Pagar password awal. Ditaruh di layout, bukan di tiap halaman, supaya
  // tidak ada rute yang bisa terlewat — termasuk rute yang ditambahkan nanti.
  // Password awal itu sama untuk semua orang dan diketahui semua orang; selama
  // masih terpasang, satu tebakan membuka seluruh harga dan HPP.
  if (await pakaiPasswordDefault()) redirect('/ganti-password?wajib=1');

  // Peran yang modulnya belum ikut dimigrasi. Tanpa layar ini mereka akan
  // melihat menu lengkap berisi tabel kosong — dan menyimpulkan sistem barunya
  // rusak, padahal RLS memang sedang bekerja sebagaimana mestinya.
  const belumAdaModul = !hasSalesModuleAccess(profile.role);

  return (
    <div className="shell">
      {belumAdaModul ? null : <Sidebar role={profile.role} />}
      <div className="main">
        <header className="topbar">
          <h1>RenusPro</h1>
          <div className="who">
            <strong>{profile.full_name}</strong>
            <span>
              {roleLabel(profile.role)} ·{' '}
              <Link href="/ganti-password">Ganti password</Link>
            </span>
          </div>
          <SignOutButton />
        </header>
        <main className="content">
          {belumAdaModul ? <ModulBelumTersedia role={profile.role} /> : children}
        </main>
      </div>
    </div>
  );
}

function ModulBelumTersedia({ role }: { role: string }) {
  return (
    <div className="card" style={{ maxWidth: 620, margin: '48px auto', padding: 32 }}>
      <h2 style={{ margin: '0 0 10px', fontSize: 17 }}>
        Modul {roleLabel(role)} belum pindah ke sini
      </h2>
      <p style={{ margin: '0 0 14px', lineHeight: 1.6 }}>
        Yang sudah dimigrasi ke RenusPro baru modul penjualan dan keuangan —
        penawaran, Work Order, invoice, dan kwitansi. Pekerjaan Anda sehari-hari
        masih dijalankan di sistem lama, dan tetap di sana sampai modulnya
        menyusul.
      </p>
      <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
        Akun Anda sudah aktif dan siap dipakai, jadi tidak ada yang perlu
        didaftarkan ulang nanti. Silakan tetap gunakan sistem lama untuk
        sekarang.
      </p>
    </div>
  );
}

