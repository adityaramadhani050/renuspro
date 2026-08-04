import { notFound, redirect } from 'next/navigation';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { updateProduct, deleteProduct } from '../actions';
import { ProductForm } from '../ProductForm';
import { DeleteForm } from '@/components/DeleteForm';
import type { Product } from '@/lib/types';
import { canManageMaster } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export default async function ProdukEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const profile = await getCurrentProfile();
  if (!profile || !canManageMaster(profile.role)) redirect('/produk');

  const supabase = await createClient();
  const { data: product } = await supabase
    .from('products')
    .select('id, legacy_code, name, unit, price, cost, is_active')
    .eq('id', id)
    .single<Product>();

  if (!product) notFound();

  // Berapa penawaran yang memakai produk ini — supaya konsekuensi penghapusan
  // terlihat sebelum tombolnya ditekan, bukan sesudahnya.
  const { count: usageCount } = await supabase
    .from('quotation_items')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', id);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Produk &amp; Jasa · {product.legacy_code ?? '—'}</div>
          <h2>{product.name}</h2>
        </div>
      </div>

      <div className="form-card">
        <ProductForm action={updateProduct} product={product} />
      </div>

      <div className="danger-zone">
        <h3>Hapus produk</h3>
        <p>
          {usageCount
            ? `Produk ini dipakai di ${usageCount.toLocaleString('id-ID')} baris item penawaran. ` +
              'Penawaran lama TIDAK ikut berubah — deskripsi dan harganya sudah tersimpan ' +
              'sendiri, jadi dokumen yang sudah terbit tetap utuh.'
            : 'Produk ini belum pernah dipakai di penawaran mana pun.'}
        </p>
        <DeleteForm
          action={deleteProduct}
          id={product.id}
          label="Hapus produk ini"
          confirmMessage={`Hapus "${product.name}"? Tindakan ini tidak bisa dibatalkan.`}
        />
      </div>
    </>
  );
}
