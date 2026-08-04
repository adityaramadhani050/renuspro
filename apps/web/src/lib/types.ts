/**
 * Tipe baris database.
 *
 * Ditulis tangan, bukan hasil `supabase gen types`, karena proyek Supabase-nya
 * belum ada saat kode ini dibuat. Begitu proyeknya tersedia, ganti berkas ini
 * dengan hasil generate supaya tipe tidak bisa lagi menyimpang dari skema:
 *
 *   npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts
 *
 * Sampai saat itu, tipe di sini adalah janji yang harus dijaga manual terhadap
 * `supabase/migrations/`.
 */

export type QuotationStatus = 'On-Progress' | 'Deal' | 'Fail';
export type UserRole = 'admin' | 'sales' | 'finance';

/** Satu baris view v_quotations. */
export type QuotationView = {
  id: string;
  quote_number: string;
  status: QuotationStatus;
  project_name: string;
  deal_date: string | null;
  owner_id: string | null;
  owner_name: string | null;
  customer_id: string;
  customer_name: string;
  customer_company: string | null;
  revision_id: string | null;
  rev: number;
  issue_date: string | null;
  valid_until: string | null;
  subtotal: number;
  discount: number;
  tax_amount: number;
  grand_total: number;
  total_cost: number;
  est_profit: number;
  margin_pct: number;
  contract_value: number;
  contract_value_gross: number;
  work_order_id: string | null;
  wo_number: string | null;
  revision_count: number;
};

export type QuotationRevision = {
  id: string;
  rev: number;
  issue_date: string;
  grand_total: number;
  total_cost: number;
  est_profit: number;
  margin_pct: number;
};

export type QuotationItem = {
  id: string;
  description: string;
  qty: number;
  unit: string;
  price: number;
  cost: number;
  line_total: number;
  sort_order: number;
};

export type QuotationItemGroup = {
  id: string;
  code: string | null;
  name: string;
  subtotal: number;
  sort_order: number;
  quotation_items: QuotationItem[];
};

export type Product = {
  id: string;
  legacy_code: string | null;
  name: string;
  unit: string;
  price: number;
  cost: number;
  is_active: boolean;
};

export type Customer = {
  id: string;
  legacy_code: string | null;
  name: string;
  company: string | null;
  address: string | null;
  phone: string | null;
};

export type DashboardSummary = {
  total_quotations: number;
  total_deal: number;
  total_fail: number;
  total_progress: number;
  revenue: number;
  pipeline_value: number;
  total_cost: number;
  est_profit: number;
  avg_margin_pct: number;
  win_rate_pct: number;
};

/**
 * Subset kolom yang benar-benar di-select tiap halaman.
 *
 * Sengaja dipersempit dengan Pick, bukan memakai QuotationView utuh: menyatakan
 * tipe yang lebih luas daripada kolom yang diminta membuat type checker
 * menjanjikan field yang nilainya undefined saat dijalankan.
 */
export type QuotationListRow = Pick<
  QuotationView,
  | 'id'
  | 'quote_number'
  | 'rev'
  | 'status'
  | 'project_name'
  | 'customer_name'
  | 'owner_name'
  | 'issue_date'
  | 'grand_total'
  | 'wo_number'
  | 'revision_count'
>;

export type QuotationDetail = Pick<
  QuotationView,
  | 'id'
  | 'quote_number'
  | 'status'
  | 'project_name'
  | 'deal_date'
  | 'owner_id'
  | 'owner_name'
  | 'customer_name'
  | 'customer_company'
  | 'revision_id'
  | 'rev'
  | 'issue_date'
  | 'valid_until'
  | 'subtotal'
  | 'discount'
  | 'tax_amount'
  | 'grand_total'
  | 'total_cost'
  | 'est_profit'
  | 'margin_pct'
  | 'contract_value'
  | 'contract_value_gross'
  | 'work_order_id'
  | 'wo_number'
>;
