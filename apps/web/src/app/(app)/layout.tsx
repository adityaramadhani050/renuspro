import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/supabase/server';
import { Sidebar } from '@/components/Sidebar';
import { SignOutButton } from '@/components/SignOutButton';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  // Middleware sudah menolak pengunjung anonim; ini menangani kasus user
  // terautentikasi yang belum punya baris profiles, atau yang dinonaktifkan.
  if (!profile) redirect('/login?error=no-profile');
  if (!profile.is_active) redirect('/login?error=inactive');

  return (
    <div className="shell">
      <Sidebar role={profile.role} />
      <div className="main">
        <header className="topbar">
          <h1>RenusPro</h1>
          <div className="who">
            <strong>{profile.full_name}</strong>
            <span>{roleLabel(profile.role)}</span>
          </div>
          <SignOutButton />
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

function roleLabel(role: string) {
  return { admin: 'Administrator', sales: 'Sales', finance: 'Finance' }[role] ?? role;
}
