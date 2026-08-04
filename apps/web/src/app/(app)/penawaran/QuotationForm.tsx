'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { saveQuotation, type QuotationPayload } from './actions';

/**
 * Form buat/revisi penawaran.
 *
 * Angka yang dihitung di sini hanya untuk DITAMPILKAN. Yang tersimpan adalah
 * hasil hitungan ulang oleh database (save_quotation), sehingga nilai kontrak
 * tidak bisa dipengaruhi dari browser. Rumusnya tetap dibuat sama persis
 * dengan versi lama (JS_Form_Penawaran.html:256-271) supaya angka di layar
 * cocok dengan yang tersimpan.
 */

export type ProductOption = {
  id: string;
  name: string;
  unit: string;
  price: number;
  cost: number;
};

export type CustomerOption = { id: string; name: string; company: string | null };

export type TemplateOption = {
  id: string;
  name: string;
  items: {
    product_id: string | null;
    description: string;
    qty: number;
    unit: string;
    price: number;
    cost: number;
  }[];
};

type ItemState = {
  key: string;
  product_id: string;
  description: string;
  qty: string;
  unit: string;
  price: string;
  cost: string;
};

type GroupState = { key: string; name: string; items: ItemState[] };

export type QuotationFormInitial = {
  quotation_id: string | null;
  quote_number?: string;
  next_rev?: number;
  customer_id: string;
  project_name: string;
  issue_date: string;
  valid_until: string;
  discount: number;
  tax_percent: number;
  terms: Record<string, string>;
  groups: { name: string; items: Omit<ItemState, 'key'>[] }[];
};

const GROUP_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const TERM_FIELDS = [
  { key: 'pembayaran', label: 'Termin Pembayaran', placeholder: 'DP 30%, pelunasan setelah komisioning' },
  { key: 'pengiriman', label: 'Waktu Pengiriman', placeholder: '4–6 minggu setelah PO' },
  { key: 'garansi', label: 'Garansi', placeholder: 'Panel 12 tahun, inverter 5 tahun' },
  { key: 'catatan', label: 'Catatan', placeholder: 'Catatan tambahan' },
] as const;

let keyCounter = 0;
const nextKey = () => `k${++keyCounter}`;

/** Angka bergaya Indonesia → number. "2.500.000" dan "2500000" sama-sama diterima. */
function parseId(value: string): number {
  let s = value.replace(/[Rp\s]/gi, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

const rp = (n: number) =>
  new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.round(n));

function emptyItem(): ItemState {
  return { key: nextKey(), product_id: '', description: '', qty: '1', unit: 'unit', price: '0', cost: '0' };
}

export function QuotationForm({
  customers,
  products,
  templates,
  initial,
}: {
  customers: CustomerOption[];
  products: ProductOption[];
  templates: TemplateOption[];
  initial: QuotationFormInitial;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState(initial.customer_id);
  const [projectName, setProjectName] = useState(initial.project_name);
  const [issueDate, setIssueDate] = useState(initial.issue_date);
  const [validUntil, setValidUntil] = useState(initial.valid_until);
  const [discount, setDiscount] = useState(String(initial.discount || 0));
  const [taxPercent, setTaxPercent] = useState(String(initial.tax_percent ?? 11));
  const [terms, setTerms] = useState<Record<string, string>>(initial.terms ?? {});

  const [groups, setGroups] = useState<GroupState[]>(() =>
    initial.groups.length
      ? initial.groups.map((g) => ({
          key: nextKey(),
          name: g.name,
          items: g.items.map((it) => ({ ...it, key: nextKey() })),
        }))
      : [{ key: nextKey(), name: '', items: [emptyItem()] }]
  );

  // ── Kalkulasi (tampilan saja) ─────────────────────────────────────────────
  const calc = useMemo(() => {
    let subtotal = 0;
    let totalCost = 0;
    const groupSubtotals: number[] = [];

    for (const g of groups) {
      let sub = 0;
      for (const it of g.items) {
        const qty = parseId(it.qty);
        sub += qty * parseId(it.price);
        totalCost += qty * parseId(it.cost);
      }
      groupSubtotals.push(sub);
      subtotal += sub;
    }

    const disc = parseId(discount);
    const net = Math.max(0, subtotal - disc);
    const tax = Math.round((net * parseId(taxPercent)) / 100);
    const grand = Math.round(net + tax);
    const profit = net - totalCost;
    const margin = net > 0 ? (profit / net) * 100 : 0;

    return { subtotal, groupSubtotals, disc, net, tax, grand, totalCost, profit, margin };
  }, [groups, discount, taxPercent]);

  // ── Mutasi state ──────────────────────────────────────────────────────────
  const patchItem = (gi: number, ii: number, patch: Partial<ItemState>) =>
    setGroups((prev) =>
      prev.map((g, i) =>
        i !== gi
          ? g
          : { ...g, items: g.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) }
      )
    );

  const onPickProduct = (gi: number, ii: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    patchItem(gi, ii, {
      product_id: productId,
      ...(p
        ? {
            description: p.name,
            unit: p.unit,
            price: String(p.price),
            cost: String(p.cost),
          }
        : {}),
    });
  };

  const onPickTemplate = (gi: number, templateId: string) => {
    const t = templates.find((x) => x.id === templateId);
    if (!t) return;
    setGroups((prev) =>
      prev.map((g, i) =>
        i !== gi
          ? g
          : {
              ...g,
              name: g.name || t.name,
              items: t.items.length
                ? t.items.map((it) => ({
                    key: nextKey(),
                    product_id: it.product_id ?? '',
                    description: it.description,
                    qty: String(it.qty),
                    unit: it.unit,
                    price: String(it.price),
                    cost: String(it.cost),
                  }))
                : [emptyItem()],
            }
      )
    );
  };

  // ── Simpan ────────────────────────────────────────────────────────────────
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload: QuotationPayload = {
      quotation_id: initial.quotation_id,
      customer_id: customerId,
      project_name: projectName.trim(),
      issue_date: issueDate,
      valid_until: validUntil || null,
      discount: parseId(discount),
      tax_percent: parseId(taxPercent),
      terms,
      groups: groups.map((g, gi) => ({
        code: GROUP_LETTERS[gi] ?? String(gi + 1),
        name: g.name.trim().toUpperCase(),
        items: g.items
          // Baris yang benar-benar kosong dibuang diam-diam; baris terakhir
          // yang belum diisi adalah hal biasa dan tidak perlu jadi error.
          .filter((it) => it.description.trim() || parseId(it.price) > 0)
          .map((it) => ({
            product_id: it.product_id || null,
            description: it.description.trim(),
            qty: parseId(it.qty),
            unit: it.unit.trim() || 'unit',
            price: parseId(it.price),
            cost: parseId(it.cost),
          })),
      })),
    };

    startTransition(async () => {
      const result = await saveQuotation(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/penawaran/${result.quotation_id}`);
      router.refresh();
    });
  }

  const isRevision = !!initial.quotation_id;

  return (
    <form onSubmit={onSubmit}>
      {error ? <div className="error">{error}</div> : null}

      {/* ── Header ── */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <h2>
            {isRevision
              ? `Revisi ${initial.quote_number} → Rev ${initial.next_rev}`
              : 'Penawaran Baru'}
          </h2>
          {isRevision ? (
            <span className="muted" style={{ fontSize: 13 }}>
              Nomor penawaran tidak berubah
            </span>
          ) : (
            <span className="muted" style={{ fontSize: 13 }}>
              Nomor terbit otomatis saat disimpan
            </span>
          )}
        </div>

        <div style={{ padding: '16px' }}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="customer">Klien</label>
              <select
                id="customer"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                required
                style={{ width: '100%' }}
              >
                <option value="">— pilih klien —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.company ? ` (${c.company})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="issue">Tanggal</label>
              <input
                id="issue"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="valid">Berlaku sampai</label>
              <input
                id="valid"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="project">Nama Project</label>
            <input
              id="project"
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              required
            />
          </div>
        </div>
      </div>

      {/* ── Sub-paket & item ── */}
      {groups.map((group, gi) => (
        <div className="card" key={group.key} style={{ marginBottom: 14 }}>
          <div className="card-head">
            <div className="group-title">
              <span className="group-letter">{GROUP_LETTERS[gi] ?? gi + 1}</span>
              <input
                type="text"
                value={group.name}
                placeholder="Nama sub-paket…"
                onChange={(e) =>
                  setGroups((prev) =>
                    prev.map((g, i) => (i === gi ? { ...g, name: e.target.value } : g))
                  )
                }
                style={{ minWidth: 240 }}
              />
            </div>

            <div className="filters">
              {templates.length ? (
                <select
                  defaultValue=""
                  onChange={(e) => {
                    onPickTemplate(gi, e.target.value);
                    e.target.value = '';
                  }}
                  aria-label="Muat dari template paket"
                >
                  <option value="">Muat template paket…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              ) : null}

              {groups.length > 1 ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setGroups((prev) => prev.filter((_, i) => i !== gi))}
                >
                  Hapus sub-paket
                </button>
              ) : null}
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="item-table">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>No</th>
                  <th style={{ minWidth: 180 }}>Produk/Jasa</th>
                  <th style={{ minWidth: 200 }}>Deskripsi</th>
                  <th style={{ width: 80 }}>Qty</th>
                  <th style={{ width: 80 }}>Unit</th>
                  <th style={{ width: 130 }}>Harga</th>
                  <th style={{ width: 130 }}>HPP</th>
                  <th className="num" style={{ width: 130 }}>Total</th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {group.items.map((item, ii) => {
                  const lineTotal = parseId(item.qty) * parseId(item.price);
                  return (
                    <tr key={item.key}>
                      <td className="muted">{ii + 1}</td>
                      <td>
                        <select
                          value={item.product_id}
                          onChange={(e) => onPickProduct(gi, ii, e.target.value)}
                          style={{ width: '100%' }}
                        >
                          <option value="">— manual —</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => patchItem(gi, ii, { description: e.target.value })}
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={item.qty}
                          onChange={(e) => patchItem(gi, ii, { qty: e.target.value })}
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={item.unit}
                          onChange={(e) => patchItem(gi, ii, { unit: e.target.value })}
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={item.price}
                          onChange={(e) => patchItem(gi, ii, { price: e.target.value })}
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={item.cost}
                          onChange={(e) => patchItem(gi, ii, { cost: e.target.value })}
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td className="num">{rp(lineTotal)}</td>
                      <td>
                        {group.items.length > 1 ? (
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label="Hapus baris"
                            onClick={() =>
                              setGroups((prev) =>
                                prev.map((g, i) =>
                                  i !== gi
                                    ? g
                                    : { ...g, items: g.items.filter((_, j) => j !== ii) }
                                )
                              )
                            }
                          >
                            ×
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="group-foot">
            <button
              type="button"
              className="btn"
              onClick={() =>
                setGroups((prev) =>
                  prev.map((g, i) => (i === gi ? { ...g, items: [...g.items, emptyItem()] } : g))
                )
              }
            >
              + Tambah item
            </button>
            <div>
              Sub-total {GROUP_LETTERS[gi] ?? gi + 1}:{' '}
              <strong>Rp {rp(calc.groupSubtotals[gi] ?? 0)}</strong>
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        className="btn"
        style={{ marginBottom: 18 }}
        onClick={() =>
          setGroups((prev) => [...prev, { key: nextKey(), name: '', items: [emptyItem()] }])
        }
      >
        + Tambah sub-paket
      </button>

      {/* ── Syarat & ketentuan + total ── */}
      <div className="detail-grid">
        <div className="card">
          <div className="card-head">
            <h2>Syarat &amp; Ketentuan</h2>
          </div>
          <div style={{ padding: 16 }}>
            {TERM_FIELDS.map((f) => (
              <div className="field" key={f.key}>
                <label htmlFor={`term-${f.key}`}>{f.label}</label>
                <input
                  id={`term-${f.key}`}
                  type="text"
                  value={terms[f.key] ?? ''}
                  placeholder={f.placeholder}
                  onChange={(e) => setTerms((prev) => ({ ...prev, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Nilai</h2>
          </div>
          <div className="totals">
            <div className="line">
              <span>Subtotal</span>
              <span>Rp {rp(calc.subtotal)}</span>
            </div>

            <div className="line">
              <span>Diskon</span>
              <input
                type="text"
                inputMode="numeric"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                style={{ width: 130, textAlign: 'right' }}
                aria-label="Diskon nominal"
              />
            </div>

            <div className="line">
              <span>PPN (%)</span>
              <input
                type="text"
                inputMode="decimal"
                value={taxPercent}
                onChange={(e) => setTaxPercent(e.target.value)}
                style={{ width: 130, textAlign: 'right' }}
                aria-label="Persen PPN"
              />
            </div>

            <div className="line">
              <span>PPN</span>
              <span>Rp {rp(calc.tax)}</span>
            </div>

            <div className="line grand">
              <span>Grand Total</span>
              <span>Rp {rp(calc.grand)}</span>
            </div>

            <div className="internal-box">
              <div className="line internal">
                <span>Total HPP</span>
                <span>Rp {rp(calc.totalCost)}</span>
              </div>
              <div className="line internal">
                <span>Estimasi Keuntungan</span>
                <span>Rp {rp(calc.profit)}</span>
              </div>
              <div className="line internal">
                <span>Margin</span>
                <span className={calc.margin < 25 ? 'margin-warn' : 'margin-ok'}>
                  {calc.margin.toFixed(1)}%
                </span>
              </div>
              {calc.margin < 25 ? (
                <p className="field-hint" style={{ padding: '0 16px 10px' }}>
                  Margin di bawah 25% — sama seperti peringatan di sistem lama.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Menyimpan…' : isRevision ? 'Simpan Revisi' : 'Simpan Penawaran'}
        </button>
        <Link
          className="btn"
          href={initial.quotation_id ? `/penawaran/${initial.quotation_id}` : '/penawaran'}
        >
          Batal
        </Link>
        <span className="muted" style={{ fontSize: 12 }}>
          Nilai akhir dihitung ulang oleh server saat disimpan.
        </span>
      </div>
    </form>
  );
}
