import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/supabase/server';
import { createCustomer } from '../actions';
import { CustomerForm } from '../CustomerForm';

export const dynamic = 'force-dynamic';

export default async function KlienBaruPage() {
  const profile = await getCurrentProfile();
  if (!profile || !['admin', 'sales'].includes(profile.role)) redirect('/klien');

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Klien</div>
          <h2>Tambah Klien</h2>
        </div>
      </div>

      <div className="form-card">
        <CustomerForm action={createCustomer} />
      </div>
    </>
  );
}
