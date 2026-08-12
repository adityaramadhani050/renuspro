/* =============================================================================
 *  RenusPro — Build concat  (Fase 1 migrasi ke Vercel)
 *  Menggabungkan Index.html + fragmen include() Apps Script menjadi satu
 *  file statis dist/index.html untuk di-deploy ke Vercel — TANPA mengubah UI.
 *
 *  Mengganti pola Apps Script:  <?!= include('NamaFile') ?>
 *  dengan isi file  NamaFile.html  (rekursif, mendukung include bersarang).
 *
 *  Tambahan:
 *   - Menyuntik <script src="gs-run-shim.js"> PALING AWAL di <head> (atau
 *     sebelum script pertama) agar google.script.run tersedia.
 *   - Memberi peringatan bila masih ada scriptlet <? ... ?> yang belum ditangani.
 *
 *  Jalankan dari root repo Apps Script:  node migrasi/build.mjs
 *  Output:  dist/index.html  +  dist/gs-run-shim.js
 * ========================================================================== */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); // root repo
const OUT_DIR = join(ROOT, 'dist');
const ENTRY = 'Index.html';

const INCLUDE_RE = /<\?!?=?\s*include\(\s*['"]([^'"]+)['"]\s*\)\s*;?\s*\?>/g;

function readFragment(name) {
  const p = join(ROOT, name.endsWith('.html') ? name : name + '.html');
  if (!existsSync(p)) {
    console.warn(`[build] ⚠ include tidak ditemukan: ${name} (dibiarkan kosong)`);
    return `<!-- MISSING INCLUDE: ${name} -->`;
  }
  return readFileSync(p, 'utf8');
}

function expand(html, depth = 0, seen = new Set()) {
  if (depth > 25) throw new Error('Include terlalu dalam / kemungkinan siklus.');
  return html.replace(INCLUDE_RE, (_m, name) => {
    if (seen.has(name)) {
      console.warn(`[build] ⚠ include berulang dilewati (anti-siklus): ${name}`);
      return '';
    }
    const next = new Set(seen); next.add(name);
    return expand(readFragment(name), depth + 1, next);
  });
}

// Override dipecah per-modul di migrasi/overrides/*.js (di-assemble sesuai urutan
// nama). Key Supabase tetap INLINE di 000-head.js (deploy-safe, tak butuh file
// eksternal). Fallback ke file tunggal migrasi/supabase-overrides.js bila ada.
const OVR_DIR = join(ROOT, 'migrasi', 'overrides');
const OVR_SINGLE = join(ROOT, 'migrasi', 'supabase-overrides.js');
const HAS_OVR_DIR = existsSync(join(OVR_DIR, '000-head.js'));
const HAS_OVERRIDES = HAS_OVR_DIR || existsSync(OVR_SINGLE);

function assembleOverrides() {
  if (HAS_OVR_DIR) {
    const parts = readdirSync(OVR_DIR).filter((f) => f.endsWith('.js')).sort();
    return parts.map((f) => readFileSync(join(OVR_DIR, f), 'utf8')).join('\n');
  }
  return readFileSync(OVR_SINGLE, 'utf8');
}

function injectShim(html) {
  let tag = '<script src="./gs-run-shim.js"></script>\n';
  // Override Supabase (Milestone 4) — inert sampai dikonfigurasi di file itu.
  if (HAS_OVERRIDES) tag += '<script src="./supabase-overrides.js"></script>\n';
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => m + '\n' + tag);
  }
  // fallback: sebelum <script pertama
  const i = html.indexOf('<script');
  return i >= 0 ? html.slice(0, i) + tag + html.slice(i) : tag + html;
}

// ── Jalankan ────────────────────────────────────────────────────────────────
let html = readFileSync(join(ROOT, ENTRY), 'utf8');
html = expand(html);
html = injectShim(html);

const leftover = html.match(/<\?[^>]*\?>/g);
if (leftover) {
  console.warn(`[build] ⚠ Masih ada ${leftover.length} scriptlet Apps Script yang belum ditangani (tangani manual):`);
  [...new Set(leftover)].slice(0, 20).forEach((s) => console.warn('   ' + s.slice(0, 80)));
}

// Sisipkan logo RENUS (assets/renus-logo.png) sebagai data URI ke token di
// JS_PdfClient. Bila file belum diupload, token dikosongkan → PDF pakai logo
// vektor fallback. Kirim/commit assets/renus-logo.png untuk logo asli.
{
  // Terima logo di assets/renus-logo.png ATAU renus-logo.png di root (lebih
  // mudah diupload lewat GitHub web).
  const LOGO_CANDIDATES = [join(ROOT, 'assets', 'renus-logo.png'), join(ROOT, 'renus-logo.png')];
  const LOGO_PATH = LOGO_CANDIDATES.filter((p) => existsSync(p))[0];
  let logoURI = '';
  if (LOGO_PATH) {
    logoURI = 'data:image/png;base64,' + readFileSync(LOGO_PATH).toString('base64');
    console.log('[build] ✔ Logo PDF di-embed dari ' + LOGO_PATH.replace(ROOT + '/', ''));
  } else {
    console.warn('[build] ⚠ renus-logo.png belum ada (root / assets/) — PDF pakai logo vektor fallback.');
  }
  html = html.split('__RENUS_LOGO_DATA_URI__').join(logoURI);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'index.html'), html, 'utf8');
copyFileSync(join(ROOT, 'migrasi', 'gs-run-shim.js'), join(OUT_DIR, 'gs-run-shim.js'));
if (HAS_OVERRIDES) {
  let ovr = assembleOverrides();
  // Suntik konfigurasi Supabase dari environment (di CI berasal dari GitHub
  // Secrets). Sumber (000-head.js) sengaja memakai placeholder ISI_* supaya
  // kunci tak ikut ter-commit; nilai asli hanya masuk saat build.
  const supaUrl  = process.env.SUPABASE_URL || '';
  const supaAnon = process.env.SUPABASE_ANON_KEY || '';
  if (supaUrl && supaAnon) {
    ovr = ovr
      .replace(/'ISI_PROJECT_URL'/g, JSON.stringify(supaUrl))
      .replace(/'ISI_ANON_KEY'/g, JSON.stringify(supaAnon));
    console.log('[build] ✔ Konfigurasi Supabase disuntik dari environment.');
  } else {
    // Tanpa config, overrides jadi inert → APLIKASI JATUH KE APPS SCRIPT/SHEET.
    console.warn('[build] ⚠ SUPABASE_URL / SUPABASE_ANON_KEY kosong — supabase-overrides.js memakai placeholder (app TIDAK akan pakai Supabase).');
  }
  writeFileSync(join(OUT_DIR, 'supabase-overrides.js'), ovr, 'utf8');
}

console.log(`[build] ✔ dist/index.html (${(html.length / 1024).toFixed(0)} KB) + dist/gs-run-shim.js`);
console.log('[build]   Deploy folder dist/ ke Vercel (Output Directory = dist).');
