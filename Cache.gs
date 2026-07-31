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

var CACHE_TTL   = 480;    // detik (GAS max 600, sisakan buffer)
var CACHE_CHUNK = 90000;  // ~90KB/key (batas CacheService 100KB per key)
var CACHE_MAXCH = 30;     // batas wajar jumlah chunk (~2.7MB); di atas ini jangan cache
var CACHE_VER   = 'v2';   // prefix versi format; naikkan bila struktur cache berubah

// ── Baca data sheet dengan cache (BER-CHUNK) ─────────────────────────────────
// Sebelumnya sheet dgn JSON > 95KB gagal ter-cache (jatuh ke full read tiap
// panggilan). Kini JSON dipecah ke beberapa key (<VER>_<key>_0..n) + meta,
// sehingga sheet besar (Penawaran/PO/Pengeluaran/Invoice) tetap ter-cache.
function _cacheChunkKeys(key, n) {
  var arr = [];
  for (var i = 0; i < n; i++) arr.push(CACHE_VER + '_' + key + '_' + i);
  return arr;
}

function _cacheGetSheet(key, sheetName, ttl) {
  ttl = ttl || CACHE_TTL;
  var cache = CacheService.getScriptCache();
  var metaKey = CACHE_VER + '_' + key + '_meta';
  // ── Coba cache-hit (gabung chunk) ──
  try {
    var meta = cache.get(metaKey);
    if (meta) {
      var n = parseInt(meta, 10) || 0;
      if (n > 0 && n <= CACHE_MAXCH) {
        var keys = _cacheChunkKeys(key, n);
        var parts = cache.getAll(keys);
        var joined = '', ok = true;
        for (var i = 0; i < n; i++) {
          var p = parts[keys[i]];
          if (p == null) { ok = false; break; }   // 1 chunk kedaluwarsa → miss
          joined += p;
        }
        if (ok) { try { return JSON.parse(joined); } catch (e) {} }
      }
    }
  } catch (e) {}
  // ── Miss → baca sheet ──
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues().map(function(row) {
    return row.map(function(cell) {
      return cell instanceof Date ? cell.toISOString() : cell;   // Date → ISO utk JSON
    });
  });
  // ── Simpan ber-chunk ──
  try {
    var json = JSON.stringify(data);
    var chunks = Math.ceil(json.length / CACHE_CHUNK) || 1;
    if (chunks <= CACHE_MAXCH) {
      var obj = {}, cKeys = _cacheChunkKeys(key, chunks);
      for (var c = 0; c < chunks; c++) obj[cKeys[c]] = json.substring(c * CACHE_CHUNK, (c + 1) * CACHE_CHUNK);
      obj[metaKey] = String(chunks);
      cache.putAll(obj, ttl);
    }
  } catch (e) {}
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
function _cachedStok()         { return _cacheGetSheet('cache_stok',         'Stok'); }
function _cachedMutasiStok()   { return _cacheGetSheet('cache_mutasi_stok',   'Mutasi_Stok'); }
function _cachedPengeluaran()  { return _cacheGetSheet('cache_pengeluaran',   'Pengeluaran'); }
function _cachedPemasukan()    { return _cacheGetSheet('cache_pemasukan',     'Pemasukan'); }
function _cachedPricelist()    { return _cacheGetSheet('cache_pricelist',     'Pricelist_Supplier'); }
// Sheet Engineering — sering berubah → TTL pendek (safety net di atas invalidation per-write).
var CACHE_TTL_ENG = 30;
function _cachedBOMItem()         { return _cacheGetSheet('cache_bom_item',    'BOM_Item',         CACHE_TTL_ENG); }
function _cachedBOMProject()      { return _cacheGetSheet('cache_bom_project', 'BOM_Project',      CACHE_TTL_ENG); }
function _cachedScheduleProject() { return _cacheGetSheet('cache_sch_proj',    'Schedule_Project', CACHE_TTL_ENG); }
function _cachedScheduleTask()    { return _cacheGetSheet('cache_sch_task',    'Schedule_Task',    CACHE_TTL_ENG); }

// ── Invalidasi cache ─────────────────────────────────────────────────────────

function invalidateCache(keys) {
  var cache = CacheService.getScriptCache();
  var all = keys || ['cache_penawaran','cache_klien','cache_user','cache_produk',
                     'cache_invoice','cache_kwitansi','cache_template'];
  var toRemove = [];
  for (var i = 0; i < all.length; i++) {
    var k = all[i], metaKey = CACHE_VER + '_' + k + '_meta';
    toRemove.push(metaKey);
    var n = 0;
    try { var meta = cache.get(metaKey); if (meta) n = parseInt(meta, 10) || 0; } catch (e) {}
    var cap = (n > 0 && n <= CACHE_MAXCH) ? n : CACHE_MAXCH;   // meta hilang → hapus jaga2
    for (var j = 0; j < cap; j++) toRemove.push(CACHE_VER + '_' + k + '_' + j);
  }
  try { cache.removeAll(toRemove); } catch (e) {}
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
function invalidatePengeluaranCache()  { invalidateCache(['cache_pengeluaran']); }
function invalidatePemasukanCache()    { invalidateCache(['cache_pemasukan']); }
function invalidatePricelistCache()    { invalidateCache(['cache_pricelist']); }
function invalidateBOMCache()          { invalidateCache(['cache_bom_item','cache_bom_project']); }
function invalidateScheduleCache()     { invalidateCache(['cache_sch_proj','cache_sch_task']); }

// ── Format tanggal dari cache (Date atau ISO string) → "dd/MM/yyyy" ──────────
function _fmtTgl(raw) {
  if (!raw) return '';
  if (raw instanceof Date) {
    return isNaN(raw) ? '' : Utilities.formatDate(raw, _tz(), 'dd/MM/yyyy');
  }
  var s = raw.toString();
  if (s.indexOf('T') > 0) { // ISO string dari cache
    var d = new Date(s);
    return isNaN(d) ? '' : Utilities.formatDate(d, _tz(), 'dd/MM/yyyy');
  }
  return s; // sudah dalam format dd/MM/yyyy atau kosong
}

// ════════════════════════════════════════════════════════════════════════════
//  Helper bersama (dedup logika berulang lintas fitur) — memakai layer cache.
//  Tiap eksekusi Apps Script fresh, jadi var top-level = memo per-request.
// ════════════════════════════════════════════════════════════════════════════
var _TZ_MEMO = null;
function _tz() { if (_TZ_MEMO == null) _TZ_MEMO = Session.getScriptTimeZone(); return _TZ_MEMO; }

// Peta klienId → nama (dari Master_Klien cached). Ganti implementasi inline yg
// ditulis ulang di getPenawaranList/Dashboard/SalesReport/Pengeluaran/PO.
function _klienMap() {
  var map = {}, arr = _cachedKlien();
  for (var i = 1; i < arr.length; i++) {
    if (arr[i][0]) map[arr[i][0].toString()] = (arr[i][1] != null ? arr[i][1].toString() : '');
  }
  return map;
}

// Dedup penawaran → revisi terakhir per No. filterFn(row) opsional (mis. filter
// pembuat). Kembalikan map: no → { rev, row } (raw row dari Penawaran_Main).
function _penawaranLatestRev(filterFn) {
  var data = _cachedPenawaran(), latest = {};
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    if (filterFn && !filterFn(row)) continue;
    var no = row[0].toString(), rev = parseInt(row[1]) || 0;
    if (!latest[no] || rev > latest[no].rev) latest[no] = { rev: rev, row: row };
  }
  return latest;
}

// Ambil 1 baris WO (bentuk sama dgn item getWorkOrderList) tanpa membangun ulang
// daftar penuh berkali-kali: daftar di-memo per-request.
var _WO_LIST_MEMO = null;
function _woListMemo() {
  if (_WO_LIST_MEMO == null) { try { _WO_LIST_MEMO = getWorkOrderList() || []; } catch (e) { _WO_LIST_MEMO = []; } }
  return _WO_LIST_MEMO;
}
function _woRow(noWO) {
  noWO = (noWO || '').toString().trim();
  if (!noWO) return null;
  var list = _woListMemo();
  for (var i = 0; i < list.length; i++) if (list[i].noWO === noWO) return list[i];
  return null;
}
