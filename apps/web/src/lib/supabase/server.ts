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
