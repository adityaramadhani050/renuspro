import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/supabase/server';
import { createProduct } from '../actions';
import { ProductForm } from '../ProductForm';
import { canManageMaster } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export default async function ProdukBaruPage() {
  const profile = await getCurrentProfile();
  // Database sudah menolak lewat RLS; pengecekan di sini hanya agar pengguna
  // tidak dibiarkan mengisi form yang pasti gagal saat disimpan.
  if (!profile || !canManageMaster(profile.role)) redirect('/produk');

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Produk &amp; Jasa</div>
          <h2>Tambah Produk</h2>
        </div>
      </div>

      <div className="form-card">
        <ProductForm action={createProduct} />
      </div>
    </>
  );
}
