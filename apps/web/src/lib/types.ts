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
  product_id: string | null;
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

// ── Work Order & Invoice ────────────────────────────────────────────────────

/** Satu baris view v_work_orders. */
export type WorkOrderRow = {
  id: string;
  wo_number: string;
  notes: string | null;
  created_at: string;
  quotation_id: string;
  quote_number: string;
  project_name: string;
  deal_date: string | null;
  owner_id: string | null;
  owner_name: string | null;
  customer_id: string;
  customer_name: string;
  contract_value: number;
  tax_amount: number;
  contract_value_gross: number;
  billed_dpp: number;
  billed_total: number;
  paid_total: number;
  outstanding: number;
  invoice_count: number;
  remaining_dpp: number;
  uninvoiced_gross: number;
};

/** Satu baris view v_invoices. */
export type InvoiceRow = {
  id: string;
  invoice_number: string;
  issue_date: string;
  type: 'DP' | 'Termin' | 'Pelunasan' | 'Penuh';
  percent: number;
  po_number: string | null;
  po_date: string | null;
  dpp: number;
  vat_percent: number;
  vat_amount: number;
  total: number;
  payment_status: 'Belum Lunas' | 'Lunas';
  paid_at: string | null;
  notes: string | null;
  scope: string | null;
  contract_value: number;
  work_order_id: string | null;
  wo_number: string | null;
  quotation_id: string | null;
  quote_number: string | null;
  is_predeal: boolean;
  is_legacy: boolean;
  legacy_reference: string | null;
  customer_id: string | null;
  customer_name: string | null;
  project_name: string | null;
  created_by: string | null;
  created_by_name: string | null;
  bank_name: string | null;
  account_no: string | null;
  account_name: string | null;
  receipt_number: string | null;
  days_outstanding: number | null;
  aging_bucket: 'current' | 'gte30' | 'gte60' | 'gte90' | null;
};

/** Baris tunggal dari dashboard_kpi() — migrasi 19. */
export type DashboardKpi = {
  revenue_deal: number;
  revenue_prev: number;
  jumlah_penawaran: number;
  penawaran_prev: number;
  total_deal: number;
  deal_prev: number;
  pipeline_nilai: number;
  pipeline_jumlah: number;
  target_bulanan: number;
  realisasi_bulanan: number;
  target_setahun: number;
  realisasi_setahun: number;
  win_rate_pct: number;
  avg_nilai_deal: number;
  avg_margin_pct: number;
  avg_sales_cycle: number;
};

export type LeaderboardRow = {
  owner_id: string;
  nama_sales: string;
  penawaran: number;
  nilai_total: number;
  deal: number;
  revenue_deal: number;
  avg_margin_pct: number;
  win_rate_pct: number;
  target: number;
  capaian_pct: number;
};

export type PipelineHealth = {
  pipeline_nilai: number;
  pipeline_jumlah: number;
  sisa_target: number;
  coverage: number;
  umur_0_30_n: number;   umur_0_30_v: number;
  umur_31_60_n: number;  umur_31_60_v: number;
  umur_61_90_n: number;  umur_61_90_v: number;
  umur_90plus_n: number; umur_90plus_v: number;
};

export type StaleRow = {
  owner_id: string | null;
  nama_sales: string;
  quotation_id: string;
  quote_number: string;
  issue_date: string;
  customer: string;
  project: string;
  nilai: number;
  umur_hari: number;
};
