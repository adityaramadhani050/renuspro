/**
 * Kapabilitas per peran — cerminan fungsi yang sama di database.
 *
 * Definisi yang mengikat tetap ada di
 * `supabase/migrations/20260804160000_scope_to_sales_modules.sql`; berkas ini hanya
 * dipakai untuk menyembunyikan tombol yang pasti gagal, supaya pengguna tidak
 * dibiarkan mengisi form lalu ditolak di akhir.
 *
 * Kalau keduanya sampai berbeda, YANG BERLAKU ADALAH DATABASE. Itu disengaja:
 * pengecekan di sini bisa dilewati siapa pun yang membuka DevTools, sedangkan
 * RLS tidak.
 */

export type UserRole =
  | 'admin'
  | 'owner'
  | 'finance'
  | 'sales'
  | 'leadsales'
  | 'warehouse'
  | 'procurement'
  | 'siteengineer'
  | 'leadengineer'
  | 'projectcoordinator';

/**
 * Peran yang modulnya SUDAH ada di sistem ini.
 *
 * Modul yang sudah dimigrasi — penawaran, Work Order, invoice, kwitansi —
 * seluruhnya sisi penjualan dan keuangan. Warehouse, procurement, dan ketiga
 * peran teknik punya modulnya sendiri yang masih dilayani sistem lama; akun
 * mereka tetap bisa masuk, tapi belum melihat data apa pun di sini.
 */
const SALES_MODULE: UserRole[] = ['admin', 'owner', 'finance', 'sales', 'leadsales'];

const SUPERUSER: UserRole[] = ['admin', 'owner'];
const SEE_ALL_QUOTATIONS: UserRole[] = ['admin', 'owner', 'finance', 'leadsales'];
const WRITE_QUOTATIONS: UserRole[] = ['admin', 'owner', 'sales', 'leadsales'];
const MANAGE_MASTER: UserRole[] = ['admin', 'owner', 'sales', 'leadsales'];

/** Menulis catatan progres pada Work Order. */
const WRITE_WO_NOTES: UserRole[] = ['admin', 'owner', 'finance'];

/** Meminta finance menerbitkan invoice. */
const REQUEST_INVOICE: UserRole[] = ['admin', 'owner', 'sales', 'leadsales'];
const MANAGE_FINANCE: UserRole[] = ['admin', 'owner', 'finance'];

const has = (list: UserRole[], role: string) => list.includes(role as UserRole);

/** Modul penjualan & keuangan — satu-satunya yang sudah pindah ke sistem ini. */
export const hasSalesModuleAccess = (role: string) => has(SALES_MODULE, role);

/** Wewenang tertinggi: kelola pengguna, rekening bank, pengaturan. */
export const isSuperuser = (role: string) => has(SUPERUSER, role);

/** Melihat seluruh penawaran, bukan hanya milik sendiri. */
export const canSeeAllQuotations = (role: string) => has(SEE_ALL_QUOTATIONS, role);

/** Membuat dan merevisi penawaran. */
export const canWriteQuotations = (role: string) => has(WRITE_QUOTATIONS, role);

/** Mengelola klien, produk, dan template paket. */
export const canManageMaster = (role: string) => has(MANAGE_MASTER, role);

/** Menerbitkan invoice dan kwitansi. */
export const canManageFinance = (role: string) => has(MANAGE_FINANCE, role);

/** Menulis catatan progres pada Work Order. */
export const canWriteWoNotes = (role: string) => has(WRITE_WO_NOTES, role);

/** Meminta penerbitan invoice. */
export const canRequestInvoice = (role: string) => has(REQUEST_INVOICE, role);

const LABEL: Record<string, string> = {
  admin: 'Administrator',
  owner: 'Owner',
  finance: 'Finance',
  sales: 'Sales',
  leadsales: 'Lead Sales',
  warehouse: 'Gudang',
  procurement: 'Pengadaan',
  siteengineer: 'Site Engineer',
  leadengineer: 'Lead Engineer',
  projectcoordinator: 'Koordinator Proyek',
};

export const roleLabel = (role: string) => LABEL[role] ?? role;
