import { notFound, redirect } from 'next/navigation';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { updateCustomer, deleteCustomer } from '../actions';
import { CustomerForm } from '../CustomerForm';
import { DeleteForm } from '@/components/DeleteForm';
import type { Customer } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function KlienEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const profile = await getCurrentProfile();
  if (!profile || !['admin', 'sales'].includes(profile.role)) redirect('/klien');

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from('customers')
    .select('id, legacy_code, name, company, address, phone')
    .eq('id', id)
    .single<Customer>();

  if (!customer) notFound();

  const { count: quotationCount } = await supabase
    .from('quotations')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', id);

  const hasQuotations = (quotationCount ?? 0) > 0;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Klien · {customer.legacy_code ?? '—'}</div>
          <h2>{customer.name}</h2>
        </div>
      </div>

      <div className="form-card">
        <CustomerForm action={updateCustomer} customer={customer} />
      </div>

      <div className="danger-zone">
        <h3>Hapus klien</h3>
        {hasQuotations ? (
          <p>
            Klien ini punya {quotationCount!.toLocaleString('id-ID')} penawaran, jadi
            <strong> tidak bisa dihapus</strong>. Sistem lama menghapusnya begitu saja
            dan meninggalkan penawaran yang merujuk klien tidak ada — di dashboard ia
            muncul sebagai kode mentah, bukan nama. Hapus atau pindahkan penawarannya
            lebih dulu bila memang perlu.
          </p>
        ) : (
          <p>Klien ini belum punya penawaran, sehingga aman dihapus.</p>
        )}
        {hasQuotations ? null : (
          <DeleteForm
            action={deleteCustomer}
            id={customer.id}
            label="Hapus klien ini"
            confirmMessage={`Hapus "${customer.name}"? Tindakan ini tidak bisa dibatalkan.`}
          />
        )}
      </div>
    </>
  );
}
