/**
 * Kapabilitas per peran — cerminan fungsi yang sama di database.
 *
 * Definisi yang mengikat tetap ada di
 * `supabase/migrations/20260804120000_role_capabilities.sql`; berkas ini hanya
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
  | 'procurement';

const SUPERUSER: UserRole[] = ['admin', 'owner'];
const SEE_ALL_QUOTATIONS: UserRole[] = [
  'admin', 'owner', 'finance', 'leadsales', 'warehouse', 'procurement',
];
const WRITE_QUOTATIONS: UserRole[] = ['admin', 'owner', 'sales', 'leadsales'];
const MANAGE_MASTER: UserRole[] = ['admin', 'owner', 'sales', 'leadsales', 'procurement'];
const MANAGE_FINANCE: UserRole[] = ['admin', 'owner', 'finance'];

const has = (list: UserRole[], role: string) => list.includes(role as UserRole);

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

const LABEL: Record<string, string> = {
  admin: 'Administrator',
  owner: 'Owner',
  finance: 'Finance',
  sales: 'Sales',
  leadsales: 'Lead Sales',
  warehouse: 'Gudang',
  procurement: 'Pengadaan',
};

export const roleLabel = (role: string) => LABEL[role] ?? role;
