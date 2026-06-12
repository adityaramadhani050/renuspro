/**
 * Cache.gs — RenusPro
 * CacheService wrapper untuk mempercepat baca sheet yang sering diakses.
 * TTL default 8 menit (GAS max 10 menit, sisakan buffer).
 *
 * Sheet yang di-cache:
 *   Penawaran_Main  → kunci: cache_penawaran
 *   Master_Klien    → kunci: cache_klien
 *   Master_User     → kunci: cache_user
 *   Master_Produk   → kunci: cache_produk (hanya row count)
 *
 * Invalidasi dipanggil dari setiap fungsi write (simpan/edit/hapus).
 */

var CACHE_TTL = 480; // detik

// ── Baca data sheet dengan cache ─────────────────────────────────────────────

function _cacheGetSheet(key, sheetName) {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch(e) {}
  }
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues().map(function(row) {
    return row.map(function(cell) {
      // Konversi Date → ISO string agar bisa di-JSON
      return cell instanceof Date ? cell.toISOString() : cell;
    });
  });
  try {
    var json = JSON.stringify(data);
    // CacheService max 100KB per entry
    if (json.length < 95000) {
      cache.put(key, json, CACHE_TTL);
    }
  } catch(e) {}
  return data;
}

function _cachedPenawaran() { return _cacheGetSheet('cache_penawaran', 'Penawaran_Main'); }
function _cachedKlien()     { return _cacheGetSheet('cache_klien',     'Master_Klien');   }
function _cachedUser()      { return _cacheGetSheet('cache_user',      'Master_User');    }
function _cachedProduk()    { return _cacheGetSheet('cache_produk',    'Master_Produk'); }
function _cachedInvoice()   { return _cacheGetSheet('cache_invoice',   'Invoice_Main');  }
function _cachedKwitansi()  { return _cacheGetSheet('cache_kwitansi',  'Kwitansi_Main'); }
function _cachedTemplate()  { return _cacheGetSheet('cache_template',  'Template_Paket'); }
function _cachedSupplier()  { return _cacheGetSheet('cache_supplier',  'Supplier'); }
function _cachedPO()        { return _cacheGetSheet('cache_po',        'Purchase_Order'); }
function _cachedPembayaranPO() { return _cacheGetSheet('cache_pem_po', 'Pembayaran_PO'); }
function _cachedStok()       { return _cacheGetSheet('cache_stok',       'Stok'); }
function _cachedMutasiStok() { return _cacheGetSheet('cache_mutasi_stok','Mutasi_Stok'); }

// ── Invalidasi cache ─────────────────────────────────────────────────────────

function invalidateCache(keys) {
  var cache = CacheService.getScriptCache();
  var all = keys || ['cache_penawaran','cache_klien','cache_user','cache_produk',
                     'cache_invoice','cache_kwitansi','cache_template'];
  cache.removeAll(all);
}

function invalidatePenawaranCache()  { invalidateCache(['cache_penawaran']); }
function invalidateUserCache()       { invalidateCache(['cache_user']);      }
function invalidateKlienCache()      { invalidateCache(['cache_klien']);     }
function invalidateProdukCache()     { invalidateCache(['cache_produk']);    }
function invalidateInvoiceCache()    { invalidateCache(['cache_invoice']);   }
function invalidateKwitansiCache()   { invalidateCache(['cache_kwitansi']); }
function invalidateTemplateCache()   { invalidateCache(['cache_template']); }
function invalidateSupplierCache()   { invalidateCache(['cache_supplier']); }
function invalidatePOCache()         { invalidateCache(['cache_po', 'cache_po_item']); }
function invalidatePembayaranPOCache() { invalidateCache(['cache_pem_po']); }
function invalidateStokCache()         { invalidateCache(['cache_stok']); }
function invalidateMutasiStokCache()   { invalidateCache(['cache_mutasi_stok']); }

// ── Format tanggal dari cache (Date atau ISO string) → "dd/MM/yyyy" ──────────
function _fmtTgl(raw) {
  if (!raw) return '';
  if (raw instanceof Date) {
    return isNaN(raw) ? '' : Utilities.formatDate(raw, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  }
  var s = raw.toString();
  if (s.indexOf('T') > 0) { // ISO string dari cache
    var d = new Date(s);
    return isNaN(d) ? '' : Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  }
  return s; // sudah dalam format dd/MM/yyyy atau kosong
}
