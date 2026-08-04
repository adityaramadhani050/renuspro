import { createClient } from '@/lib/supabase/server';
import type { CustomerOption, ProductOption, TemplateOption } from './QuotationForm';

type TemplateRow = {
  id: string;
  name: string;
  package_template_items: {
    product_id: string | null;
    description: string;
    qty: number;
    unit: string;
    price: number;
    cost: number;
    sort_order: number;
  }[];
};

/**
 * Data pilihan untuk form penawaran: klien, produk aktif, dan template paket.
 *
 * Diambil sekaligus di server, bukan lewat beberapa panggilan dari browser
 * seperti getInitialData() (Penawaran.gs:145) yang membaca tiga sheet penuh
 * setiap kali form dibuka.
 */
export async function loadQuotationFormOptions(): Promise<{
  customers: CustomerOption[];
  products: ProductOption[];
  templates: TemplateOption[];
}> {
  const supabase = await createClient();

  const [customersRes, productsRes, templatesRes] = await Promise.all([
    supabase.from('customers').select('id, name, company').order('name'),
    supabase
      .from('products')
      .select('id, name, unit, price, cost')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('package_templates')
      .select(
        'id, name, package_template_items(product_id, description, qty, unit, price, cost, sort_order)'
      )
      .order('name')
      .returns<TemplateRow[]>(),
  ]);

  return {
    customers: (customersRes.data ?? []) as CustomerOption[],
    products: (productsRes.data ?? []) as ProductOption[],
    templates: (templatesRes.data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      items: [...(t.package_template_items ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(({ sort_order, ...item }) => item),
    })),
  };
}

/** Tanggal hari ini dalam format input[type=date]. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Tanggal berlaku default: 30 hari ke depan. */
export function defaultValidUntil(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}
