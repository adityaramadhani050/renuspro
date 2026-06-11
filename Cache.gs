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

// ── Invalidasi cache ─────────────────────────────────────────────────────────

function invalidateCache(keys) {
  var cache = CacheService.getScriptCache();
  var all = keys || ['cache_penawaran', 'cache_klien', 'cache_user', 'cache_produk'];
  cache.removeAll(all);
}

function invalidatePenawaranCache() { invalidateCache(['cache_penawaran']); }
function invalidateUserCache()      { invalidateCache(['cache_user']);      }
function invalidateKlienCache()     { invalidateCache(['cache_klien']);     }
