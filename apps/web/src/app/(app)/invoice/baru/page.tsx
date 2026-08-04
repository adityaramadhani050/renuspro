import { redirect } from 'next/navigation';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { InvoiceForm, type BillingSource, type BankOption } from '../InvoiceForm';
import type { WorkOrderRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

type PredealRow = {
  id: string;
  quote_number: string;
  project_name: string;
  customer_name: string;
  contract_value: number;
  tax_amount: number;
};

const rp = (n: number) => new Intl.NumberFormat('id-ID').format(Math.round(n));

export default async function InvoiceBaruPage({
  searchParams,
}: {
  searchParams: Promise<{ wo?: string; quot?: string }>;
}) {
  const { wo, quot } = await searchParams;

  const profile = await getCurrentProfile();
  // Sales meminta lewat halaman Work Order; penerbitannya hak finance & admin,
  // dan RLS menegakkannya di database.
  if (!profile || !['admin', 'finance'].includes(profile.role)) redirect('/invoice');

  const supabase = await createClient();

  const [{ data: workOrders }, { data: predeal }, { data: banks }] = await Promise.all([
    supabase
      .from('v_work_orders')
      .select(
        'id, wo_number, project_name, customer_name, contract_value, tax_amount, ' +
          'billed_dpp, remaining_dpp'
      )
      .gt('remaining_dpp', 0)
      .order('wo_number', { ascending: false })
      .returns<WorkOrderRow[]>(),

    // Penawaran belum Deal — hanya boleh ditagih DP (Invoice.gs:275)
    supabase
      .from('v_quotations')
      .select('id, quote_number, project_name, customer_name, contract_value, tax_amount')
      .neq('status', 'Deal')
      .order('quote_number', { ascending: false })
      .returns<PredealRow[]>(),

    supabase
      .from('bank_accounts')
      .select('id, bank_name, account_no, account_name')
      .eq('is_active', true)
      .order('sort_order'),
  ]);

  // DPP pre-deal yang sudah ditagih, untuk menghitung sisanya.
  const { data: predealBilling } = await supabase
    .from('v_predeal_billing')
    .select('quotation_id, billed_dpp')
    .returns<{ quotation_id: string; billed_dpp: number }[]>();

  const billedByQuotation = new Map(
    (predealBilling ?? []).map((r) => [r.quotation_id, r.billed_dpp])
  );

  const vatPercentOf = (contract: number, tax: number) =>
    contract > 0 ? Math.round((tax / contract) * 100) : 0;

  const sources: BillingSource[] = [
    ...(workOrders ?? []).map((w) => ({
      value: `wo:${w.id}`,
      label: `WO ${w.wo_number} — ${w.project_name} (sisa Rp ${rp(w.remaining_dpp)})`,
      customerName: w.customer_name,
      projectName: w.project_name,
      contractValue: w.contract_value,
      billedDpp: w.billed_dpp,
      remainingDpp: w.remaining_dpp,
      vatPercent: vatPercentOf(w.contract_value, w.tax_amount),
      isPredeal: false,
    })),
    ...(predeal ?? []).map((q) => {
      const billed = billedByQuotation.get(q.id) ?? 0;
      return {
        value: `quot:${q.id}`,
        label: `Pre-deal ${q.quote_number} — ${q.project_name}`,
        customerName: q.customer_name,
        projectName: q.project_name,
        contractValue: q.contract_value,
        billedDpp: billed,
        remainingDpp: Math.max(q.contract_value - billed, 0),
        vatPercent: vatPercentOf(q.contract_value, q.tax_amount),
        isPredeal: true,
      };
    }),
  ];

  const bankOptions: BankOption[] = (banks ?? []).map((b) => ({
    id: b.id,
    label: `${b.bank_name} ${b.account_no} — ${b.account_name}`,
  }));

  const defaultSource = wo ? `wo:${wo}` : quot ? `quot:${quot}` : '';

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Invoice</div>
          <h2>Terbitkan Invoice</h2>
        </div>
      </div>

      {sources.length === 0 ? (
        <div className="card">
          <div className="empty">
            Tidak ada Work Order dengan sisa kontrak, dan tidak ada penawaran
            pre-deal yang bisa ditagih.
          </div>
        </div>
      ) : (
        <InvoiceForm
          sources={sources}
          banks={bankOptions}
          defaultSource={defaultSource}
          today={new Date().toISOString().slice(0, 10)}
        />
      )}
    </>
  );
}
