/**
 * Settings.gs — Master data untuk Syarat & Ketentuan dan Bank Account
 * Disimpan di Script Properties:
 *   TC_OPTIONS    : JSON { material_status:[], dp_status:[], term_pay:[], final_pay:[],
 *                          delivery_time:[], delivery_cond:[], warranty:[], bonus:[] }
 *   BANK_ACCOUNTS : JSON [ { id, label, detail }, ... ]
 */

var _TC_FIELDS = [
  { key: 'material_status', label: 'Status Material' },
  { key: 'dp_status',       label: 'Down Payment' },
  { key: 'term_pay',        label: 'Term 2 Payment' },
  { key: 'final_pay',       label: 'Final Payment' },
  { key: 'delivery_time',   label: 'Pengiriman' },
  { key: 'delivery_cond',   label: 'Kondisi Pengiriman' },
  { key: 'warranty',        label: 'Garansi Material' },
  { key: 'bonus',           label: 'Paket Bonus' }
];

var _TC_DEFAULTS = {
  material_status: ['Ready Stock', 'Indent', '-'],
  dp_status:       ['30% From PO', '50% From PO', 'Cover GIRO 30 days', '-'],
  term_pay:        ['50% Material On Site', '50% Before Shipping', '-'],
  final_pay:       ['After BAST', '100% Before Shipping', '70% Before Shipping', '-'],
  delivery_time:   ['10-14 Days After PO', '4-6 Weeks After PO', '-'],
  delivery_cond:   ['Franco SBY/JKT', 'DDP Site', '-'],
  warranty:        ['Back to Back from Manufacture', 'Exclude', '-'],
  bonus:           ['-', 'Free Packing', 'Free Shipping Cost']
};

// ── TC Options ───────────────────────────────────────────────────────────────

function getTCOptions() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('TC_OPTIONS');
    var opts = raw ? JSON.parse(raw) : _TC_DEFAULTS;
    // Pastikan semua field ada
    _TC_FIELDS.forEach(function(f) {
      if (!opts[f.key]) opts[f.key] = _TC_DEFAULTS[f.key] || ['-'];
    });
    return { success: true, fields: _TC_FIELDS, options: opts };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

function saveTCOptions(payload) {
  try {
    PropertiesService.getScriptProperties().setProperty('TC_OPTIONS', JSON.stringify(payload));
    return { success: true, message: 'Syarat & Ketentuan berhasil disimpan.' };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

// ── Bank Accounts ─────────────────────────────────────────────────────────────

function getBankAccounts() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('BANK_ACCOUNTS');
    var list = raw ? JSON.parse(raw) : [
      { id: '1', label: 'Bank BSI', detail: 'Bank BSI 7336418717\nA/N. PT. Renus Global Indonesia' }
    ];
    return { success: true, accounts: list };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

function saveBankAccounts(payload) {
  try {
    PropertiesService.getScriptProperties().setProperty('BANK_ACCOUNTS', JSON.stringify(payload));
    return { success: true, message: 'Bank Account berhasil disimpan.' };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}
