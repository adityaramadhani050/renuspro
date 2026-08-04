'use client';

import Link from 'next/link';
import { useMemo, useState, useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createInvoice, type CreateInvoiceResult } from './actions';

export type BillingSource = {
  value: string; // "wo:<uuid>" atau "quot:<uuid>"
  label: string;
  customerName: string;
  projectName: string;
  contractValue: number; // DPP
  billedDpp: number;
  remainingDpp: number;
  vatPercent: number;
  isPredeal: boolean;
};

export type BankOption = { id: string; label: string };

const rp = (n: number) =>
  new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.round(n));

function parseId(value: string): number {
  let s = value.replace(/[Rp\s]/gi, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Form penerbitan invoice.
 *
 * Angka di sini hanya pratinjau. DPP final dan pemeriksaan terhadap sisa
 * kontrak dilakukan database di dalam transaksi yang sama dengan penyisipan
 * invoice — supaya dua orang finance yang menerbitkan bersamaan tidak bisa
 * membuat kontrak tertagih melebihi nilainya.
 */
export function InvoiceForm({
  sources,
  banks,
  defaultSource,
  today,
}: {
  sources: BillingSource[];
  banks: BankOption[];
  defaultSource: string;
  today: string;
}) {
  const [state, formAction] = useActionState<CreateInvoiceResult | null, FormData>(
    createInvoice,
    null
  );

  const [sourceValue, setSourceValue] = useState(defaultSource);
  const [type, setType] = useState('DP');
  const [inputMode, setInputMode] = useState<'persen' | 'nominal'>('persen');
  const [percent, setPercent] = useState('30');
  const [dppInput, setDppInput] = useState('0');

  const source = sources.find((s) => s.value === sourceValue);

  // Pelunasan & Penuh menentukan nilainya sendiri — input persen/nominal
  // tidak berlaku, sama seperti Invoice.gs:296-302.
  const amountIsDerived = type === 'Pelunasan' || type === 'Penuh';

  const preview = useMemo(() => {
    if (!source) return null;

    let dpp: number;
    if (type === 'Pelunasan') dpp = source.remainingDpp;
    else if (type === 'Penuh') dpp = source.contractValue;
    else if (inputMode === 'nominal') dpp = Math.round(parseId(dppInput));
    else dpp = Math.round((parseId(percent) / 100) * source.contractValue);

    const vat = Math.round((dpp * source.vatPercent) / 100);
    return {
      dpp,
      vat,
      total: dpp + vat,
      exceeds: dpp > source.remainingDpp + 1,
      remainingAfter: source.remainingDpp - dpp,
    };
  }, [source, type, inputMode, percent, dppInput]);

  if (state?.ok) {
    return (
      <div className="card">
        <div className="card-head">
          <h2>Invoice terbit</h2>
        </div>
        <div style={{ padding: 20 }}>
          <div className="ok-msg">
            Invoice <strong>{state.invoice_number}</strong> berhasil diterbitkan.
          </div>
          <div className="filters">
            <Link className="btn btn-primary" href="/invoice">
              Lihat daftar invoice
            </Link>
            <Link className="btn" href="/invoice/baru">
              Terbitkan lagi
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction}>
      {state && !state.ok ? <div className="error">{state.error}</div> : null}

      <div className="detail-grid">
        <div className="card">
          <div className="card-head">
            <h2>Data Tagihan</h2>
          </div>
          <div style={{ padding: 16 }}>
            <div className="field">
              <label htmlFor="source">Work Order / Penawaran</label>
              <select
                id="source"
                name="source"
                value={sourceValue}
                onChange={(e) => {
                  setSourceValue(e.target.value);
                  const s = sources.find((x) => x.value === e.target.value);
                  if (s?.isPredeal) setType('DP');
                }}
                required
                style={{ width: '100%' }}
              >
                <option value="">— pilih sumber tagihan —</option>
                {sources.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              {source ? (
                <div className="field-hint">
                  {source.customerName} · {source.projectName}
                </div>
              ) : (
                <div className="field-hint">
                  Hanya Work Order yang masih punya sisa kontrak, dan penawaran
                  belum Deal yang bisa ditagih DP.
                </div>
              )}
            </div>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="type">Jenis Tagihan</label>
                <select
                  id="type"
                  name="type"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="DP">DP</option>
                  {/* Invoice pre-deal hanya boleh DP — dibatasi juga di database */}
                  {source?.isPredeal ? null : (
                    <>
                      <option value="Termin">Termin</option>
                      <option value="Pelunasan">Pelunasan</option>
                      <option value="Penuh">Penuh</option>
                    </>
                  )}
                </select>
              </div>

              <div className="field">
                <label htmlFor="issue_date">Tanggal Invoice</label>
                <input id="issue_date" type="date" name="issue_date" defaultValue={today} required />
              </div>
            </div>

            {amountIsDerived ? (
              <p className="field-hint" style={{ marginBottom: 14 }}>
                {type === 'Pelunasan'
                  ? 'Pelunasan menagih tepat sisa kontrak yang belum tertagih.'
                  : 'Jenis "Penuh" menagih seluruh nilai kontrak sekaligus.'}
              </p>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="input_mode">Cara Menentukan Nilai</label>
                  <select
                    id="input_mode"
                    name="input_mode"
                    value={inputMode}
                    onChange={(e) => setInputMode(e.target.value as 'persen' | 'nominal')}
                    style={{ width: '100%' }}
                  >
                    <option value="persen">Persentase dari nilai kontrak</option>
                    <option value="nominal">Nominal langsung</option>
                  </select>
                </div>

                {inputMode === 'persen' ? (
                  <div className="field">
                    <label htmlFor="percent">Persentase (%)</label>
                    <input
                      id="percent"
                      name="percent"
                      type="text"
                      inputMode="decimal"
                      value={percent}
                      onChange={(e) => setPercent(e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="field">
                    <label htmlFor="dpp">Nominal DPP</label>
                    <input
                      id="dpp"
                      name="dpp"
                      type="text"
                      inputMode="numeric"
                      value={dppInput}
                      onChange={(e) => setDppInput(e.target.value)}
                    />
                    <div className="field-hint">Boleh diketik 20.000.000</div>
                  </div>
                )}
              </>
            )}

            <div className="form-grid">
              <div className="field">
                <label htmlFor="po_number">No. PO</label>
                <input id="po_number" name="po_number" type="text" />
              </div>
              <div className="field">
                <label htmlFor="po_date">Tanggal PO</label>
                <input id="po_date" name="po_date" type="date" />
              </div>
            </div>

            {banks.length ? (
              <div className="field">
                <label htmlFor="bank_account_id">Rekening Tujuan</label>
                <select id="bank_account_id" name="bank_account_id" style={{ width: '100%' }}>
                  <option value="">— tidak ditentukan —</option>
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="notes">Catatan</label>
              <input id="notes" name="notes" type="text" />
            </div>
          </div>
        </div>

        {/* ── Pratinjau ── */}
        <div className="card">
          <div className="card-head">
            <h2>Pratinjau</h2>
          </div>

          {!source ? (
            <div className="empty">Pilih sumber tagihan lebih dulu.</div>
          ) : (
            <div className="totals">
              <div className="line">
                <span>Nilai kontrak (DPP)</span>
                <span>Rp {rp(source.contractValue)}</span>
              </div>
              <div className="line">
                <span>Sudah ditagih</span>
                <span>Rp {rp(source.billedDpp)}</span>
              </div>
              <div className="line">
                <span>Sisa boleh ditagih</span>
                <span>Rp {rp(source.remainingDpp)}</span>
              </div>

              <div className="internal-box">
                <div className="line">
                  <span>DPP tagihan ini</span>
                  <span>Rp {rp(preview?.dpp ?? 0)}</span>
                </div>
                <div className="line">
                  <span>PPN ({source.vatPercent}%)</span>
                  <span>Rp {rp(preview?.vat ?? 0)}</span>
                </div>
                <div className="line grand">
                  <span>Total Tagihan</span>
                  <span>Rp {rp(preview?.total ?? 0)}</span>
                </div>
                <div className="line internal">
                  <span>Sisa setelah tagihan ini</span>
                  <span>Rp {rp(Math.max(preview?.remainingAfter ?? 0, 0))}</span>
                </div>
              </div>

              {preview?.exceeds ? (
                <div className="error" style={{ margin: '12px 16px 0' }}>
                  Nilai tagihan melebihi sisa kontrak. Database akan menolaknya.
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="form-actions">
        <SubmitButton disabled={!source || !!preview?.exceeds} />
        <Link className="btn" href="/invoice">
          Batal
        </Link>
        <span className="muted" style={{ fontSize: 12 }}>
          Nomor invoice dan nilai akhir ditentukan server saat disimpan.
        </span>
      </div>
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending || disabled}>
      {pending ? 'Menerbitkan…' : 'Terbitkan Invoice'}
    </button>
  );
}
