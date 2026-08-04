import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

type CookiesToSet = { name: string; value: string; options: CookieOptions }[];

/**
 * Klien Supabase untuk Server Component & Server Action.
 *
 * Selalu memakai anon key, tidak pernah service role: seluruh otorisasi
 * ditegakkan oleh RLS di database (migrasi 08). Kalau halaman ini memakai
 * service role, semua kebijakan RLS jadi tidak ada artinya.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Dipanggil dari Server Component — penyegaran sesi ditangani
            // middleware, jadi aman diabaikan di sini.
          }
        },
      },
    }
  );
}

/** Profil user yang sedang login, atau null. */
export async function getCurrentProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, username, role, is_active')
    .eq('id', user.id)
    .single();

  return data;
}

/**
 * Apakah pengguna masih memakai password awal yang dibagikan saat cutover?
 *
 * Jawabannya dibaca langsung dari password yang tersimpan (migrasi 17), bukan
 * dari kolom penanda. Bedanya terasa saat admin mengembalikan password
 * seseorang ke default: dengan penanda, pagarnya harus diingat untuk
 * dinyalakan ulang — dan yang harus diingat pada akhirnya terlupa.
 *
 * Bila pemeriksaannya gagal, jawabannya `true`. Menahan pengguna di layar
 * ganti password saat ragu jauh lebih murah daripada membuka seluruh data
 * karena satu panggilan RPC gagal.
 */
export async function pakaiPasswordDefault() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('sedang_pakai_password_default');

  if (error) return true;
  return data === true;
}
