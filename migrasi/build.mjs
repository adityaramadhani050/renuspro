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
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
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

const HAS_OVERRIDES = existsSync(join(ROOT, 'migrasi', 'supabase-overrides.js'));
const HAS_CONFIG = existsSync(join(ROOT, 'migrasi', 'config.local.js'));

function injectShim(html) {
  let tag = '<script src="./gs-run-shim.js"></script>\n';
  // Override Supabase (Milestone 4) — inert sampai dikonfigurasi di config.local.js.
  if (HAS_OVERRIDES) {
    // config.local.js (window.__SUPA_CFG__) WAJIB dimuat SEBELUM overrides.
    if (HAS_CONFIG) tag += '<script src="./config.local.js"></script>\n';
    tag += '<script src="./supabase-overrides.js"></script>\n';
  }
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

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'index.html'), html, 'utf8');
copyFileSync(join(ROOT, 'migrasi', 'gs-run-shim.js'), join(OUT_DIR, 'gs-run-shim.js'));
if (HAS_OVERRIDES) copyFileSync(join(ROOT, 'migrasi', 'supabase-overrides.js'), join(OUT_DIR, 'supabase-overrides.js'));
if (HAS_CONFIG) copyFileSync(join(ROOT, 'migrasi', 'config.local.js'), join(OUT_DIR, 'config.local.js'));

console.log(`[build] ✔ dist/index.html (${(html.length / 1024).toFixed(0)} KB) + dist/gs-run-shim.js`);
if (!HAS_CONFIG) console.warn('[build] ⚠ migrasi/config.local.js belum ada → override Supabase inert. Salin dari config.local.example.js.');
console.log('[build]   Deploy folder dist/ ke Vercel (Output Directory = dist).');
