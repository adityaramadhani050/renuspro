# Starter Kit Migrasi — Fase 1 (Frontend ke Vercel, backend LAMA)

Artefak untuk memindahkan **frontend apa adanya** ke Vercel sambil tetap memakai
backend Apps Script + Sheets yang sekarang. Tujuan: buktikan UI identik & berfungsi
penuh **sebelum** menyentuh database. (Lihat rencana lengkap di
`../00-migrasi-supabase-vercel.md`.)

## Isi
| File | Peran |
|---|---|
| `gs-run-shim.js` | Pengganti `google.script.run` di browser → `fetch()`. Punya tabel routing per-fungsi. **Dimuat paling awal.** |
| `build.mjs` | Gabungkan `Index.html` + semua `include()` jadi `dist/index.html` (statis) + suntik shim. |
| `apps-script-router.gs` | `doPost` router + allowlist 219 fungsi. **Tempel ke Apps Script lama.** |
| `vercel-proxy.js` | `api/gs.js` di Vercel — teruskan ke Apps Script (hindari CORS). |

## Alur (Fase 1)
```
Browser (Vercel, dist/index.html + shim)
   └─ google.script.run.foo(args)           ← kode UI TIDAK berubah
        └─ shim: POST /api/gs {fn:'foo', args}
             └─ vercel-proxy (api/gs.js)     ← same-origin, no CORS
                  └─ Apps Script /exec doPost ← router dispatch by name
                       └─ foo(args) → {success,...}  (kontrak sama)
```

## Langkah setup
1. **Apps Script lama**: tempel `apps-script-router.gs` → Deploy sebagai Web App
   (Execute as: **Me**, Access: **Anyone**). Salin URL `/exec`.
2. **Build frontend**: dari root repo → `node migrasi/build.mjs` → hasil di `dist/`.
3. **Vercel project**:
   - Taruh isi `dist/` sebagai output statis; taruh `vercel-proxy.js` sebagai `api/gs.js`.
   - Env var `APPS_SCRIPT_EXEC_URL` = URL `/exec` dari langkah 1.
4. **Deploy** → buka aplikasi. UI harus identik & data dari Sheets lama.

## Saat mulai migrasi modul (Fase 3)
Alihkan fungsi satu per satu ke backend baru tanpa menyentuh UI:
```js
// Setelah endpoint Supabase/Vercel untuk WO siap:
gsRoute('getWorkOrderDashboard', { mode: 'api', url: '/api/wo/dashboard' });
gsRoute('getWorkOrderList',      { mode: 'api', url: '/api/wo/list' });
// atau panggil supabase-js langsung:
gsRoute('getProdukList', { mode: 'fn', handler: async () => {
  const { data } = await supabase.from('produk').select('*');
  return { success: true, list: data };   // ← bentuk return HARUS sama seperti .gs lama
}});
```
Fungsi yang belum di-route tetap jalan lewat proxy Apps Script lama. Begitu semua
pindah, matikan proxy & pensiunkan Apps Script (Fase 5).

## Catatan
- **Auth**: shim mengirim `Authorization: Bearer <token>` bila `gsConfig.getAuthToken()`
  mengembalikan token. Fase 1 boleh kosong (Apps Script lama pakai sesi sendiri).
- **CORS**: jangan panggil `/exec` langsung dari browser — selalu lewat `/api/gs`.
- **Upload file**: fungsi upload (foto QC/DED, bukti) kirim base64 seperti sekarang;
  di Fase 3 dialihkan ke Supabase Storage.
- **PDF**: `exportXDariTemplate` tetap jalan via proxy di Fase 1; dipindah ke jsPDF
  client / serverless di Fase 4.
