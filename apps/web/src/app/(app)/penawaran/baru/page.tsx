import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/supabase/server';
import { QuotationForm } from '../QuotationForm';
import { loadQuotationFormOptions, today, defaultValidUntil } from '../formData';
import { canWriteQuotations } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export default async function PenawaranBaruPage() {
  const profile = await getCurrentProfile();
  // Finance tidak membuat penawaran; RLS juga menolaknya, ini hanya agar
  // pengguna tidak dibiarkan mengisi form yang pasti gagal disimpan.
  if (!profile || !canWriteQuotations(profile.role)) redirect('/penawaran');

  const { customers, products, templates } = await loadQuotationFormOptions();

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Penawaran</div>
          <h2>Buat Penawaran</h2>
        </div>
      </div>

      <QuotationForm
        customers={customers}
        products={products}
        templates={templates}
        initial={{
          quotation_id: null,
          customer_id: '',
          project_name: '',
          issue_date: today(),
          valid_until: defaultValidUntil(),
          discount: 0,
          tax_percent: 11,
          terms: {},
          groups: [],
        }}
      />
    </>
  );
}
