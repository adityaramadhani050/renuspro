// Header CORS bersama untuk semua Edge Function RenusPro.
// Frontend (Vercel) memanggil dari domain berbeda, jadi WAJIB izinkan CORS.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Balikan JSON + CORS dalam satu tempat.
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
