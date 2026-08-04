/* =============================================================================
 *  RenusPro — Proxy Vercel  (Fase 1 migrasi)
 *  Endpoint same-origin `/api/gs` yang meneruskan request frontend ke router
 *  Apps Script LAMA (server-to-server → tidak kena CORS).
 *
 *  Taruh sebagai:  api/gs.js  di project Vercel.
 *  Set env var:    APPS_SCRIPT_EXEC_URL = https://script.google.com/macros/s/XXX/exec
 *
 *  Frontend (shim) POST { fn, args } ke /api/gs → proxy teruskan → kembalikan JSON.
 * ========================================================================== */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Hanya POST.' });
    return;
  }
  const url = process.env.APPS_SCRIPT_EXEC_URL;
  if (!url) {
    res.status(500).json({ success: false, message: 'APPS_SCRIPT_EXEC_URL belum di-set.' });
    return;
  }

  try {
    // req.body sudah objek (Vercel Node runtime mem-parse JSON otomatis).
    const payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});

    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      redirect: 'follow' // Apps Script /exec me-redirect ke googleusercontent
    });

    const text = await upstream.text();
    res.status(200).setHeader('Content-Type', 'application/json').send(text || 'null');
  } catch (err) {
    res.status(502).json({ success: false, message: 'Proxy gagal: ' + (err?.message || String(err)) });
  }
}

// Opsional: teruskan token auth ke Apps Script bila nanti diperlukan —
// baca req.headers['authorization'] dan sertakan di header upstream.
