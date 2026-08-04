import { notFound, redirect } from 'next/navigation';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { QuotationForm } from '../../QuotationForm';
import { loadQuotationFormOptions, today, defaultValidUntil } from '../../formData';
import type { QuotationItemGroup } from '@/lib/types';

export const dynamic = 'force-dynamic';

type QuotationHead = {
  id: string;
  quote_number: string;
  status: string;
  customer_id: string;
  project_name: string;
  owner_id: string | null;
  current_revision_id: string | null;
};

/**
 * Form revisi.
 *
 * Diisi awal dengan isi revisi TERKINI, lalu disimpan sebagai revisi baru —
 * revisi lama tidak pernah ditimpa. Ini yang membuat riwayat penawaran tetap
 * bisa ditelusuri utuh, termasuk itemnya.
 */
export default async function PenawaranRevisiPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const profile = await getCurrentProfile();
  if (!profile || !['admin', 'sales'].includes(profile.role)) redirect(`/penawaran/${id}`);

  const supabase = await createClient();

  const { data: quotation } = await supabase
    .from('quotations')
    .select('id, quote_number, status, customer_id, project_name, owner_id, current_revision_id')
    .eq('id', id)
    .single<QuotationHead>();

  if (!quotation) notFound();

  // Aturan yang sama ditegakkan database (save_quotation). Dicegat di sini
  // supaya pengguna tidak mengisi form panjang lalu ditolak di akhir.
  if (quotation.status === 'Deal') {
    redirect(`/penawaran/${id}?error=deal`);
  }

  const { data: revision } = await supabase
    .from('quotation_revisions')
    .select('id, rev, issue_date, valid_until, discount, subtotal, tax_amount, terms')
    .eq('id', quotation.current_revision_id ?? '')
    .maybeSingle<{
      id: string;
      rev: number;
      issue_date: string;
      valid_until: string | null;
      discount: number;
      subtotal: number;
      tax_amount: number;
      terms: Record<string, string>;
    }>();

  const { data: groups } = revision
    ? await supabase
        .from('quotation_item_groups')
        .select(
          'id, code, name, subtotal, sort_order, ' +
            'quotation_items(id, product_id, description, qty, unit, price, cost, line_total, sort_order)'
        )
        .eq('revision_id', revision.id)
        .order('sort_order')
        .returns<QuotationItemGroup[]>()
    : { data: [] as QuotationItemGroup[] };

  const { customers, products, templates } = await loadQuotationFormOptions();

  // PPN disimpan sebagai nominal; persennya diturunkan kembali dari netto —
  // rumus yang sama dipakai Invoice.gs:284 untuk menghitung ppnPersen.
  const net = Math.max(0, (revision?.subtotal ?? 0) - (revision?.discount ?? 0));
  const taxPercent =
    net > 0 && revision ? Math.round((revision.tax_amount / net) * 100) : 11;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Penawaran · {quotation.quote_number}</div>
          <h2>Buat Revisi</h2>
        </div>
      </div>

      <QuotationForm
        customers={customers}
        products={products}
        templates={templates}
        initial={{
          quotation_id: quotation.id,
          quote_number: quotation.quote_number,
          next_rev: (revision?.rev ?? -1) + 1,
          customer_id: quotation.customer_id,
          project_name: quotation.project_name,
          issue_date: today(),
          valid_until: revision?.valid_until ?? defaultValidUntil(),
          discount: revision?.discount ?? 0,
          tax_percent: taxPercent,
          terms: revision?.terms ?? {},
          groups: (groups ?? []).map((g) => ({
            name: g.name,
            items: [...(g.quotation_items ?? [])]
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((it) => ({
                product_id: it.product_id ?? '',
                description: it.description,
                qty: String(it.qty),
                unit: it.unit,
                price: String(it.price),
                cost: String(it.cost),
              })),
          })),
        }}
      />
    </>
  );
}
