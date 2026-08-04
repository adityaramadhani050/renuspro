-- ============================================================================
-- RenusPro — 10. Fungsi Invoice
-- ----------------------------------------------------------------------------
-- Dua hal yang harus atomik dan tidak boleh dihitung di browser:
--
--   create_invoice()              menentukan DPP dan memvalidasinya terhadap
--                                 SISA kontrak yang masih boleh ditagih
--   set_invoice_payment_status()  melunasi invoice + menerbitkan kwitansi
--
-- Keduanya SECURITY INVOKER: RLS `can_manage_finance()` yang menentukan siapa
-- boleh memakainya, bukan pengecekan di frontend.
--
-- Kenapa sisa kontrak tidak boleh dihitung di klien: dua orang finance yang
-- membuka form bersamaan akan sama-sama melihat sisa yang sama, lalu keduanya
-- menerbitkan invoice — dan kontrak jadi tertagih melebihi nilainya. Di sini
-- perhitungan sisa dan penyisipan invoice terjadi dalam satu transaksi.
-- ============================================================================

create or replace function create_invoice(p_payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_wo_id       uuid := nullif(p_payload ->> 'work_order_id', '')::uuid;
  v_quot_id     uuid := nullif(p_payload ->> 'quotation_id', '')::uuid;
  v_issue_date  date := coalesce(nullif(p_payload ->> 'issue_date', '')::date, current_date);
  v_type        invoice_type := coalesce(nullif(p_payload ->> 'type', ''), 'Penuh')::invoice_type;
  v_input_mode  invoice_input_mode :=
                  coalesce(nullif(p_payload ->> 'input_mode', ''), 'persen')::invoice_input_mode;

  v_contract    numeric;   -- nilai kontrak (DPP, belum PPN)
  v_vat_pct     numeric;
  v_billed      numeric;   -- DPP yang sudah ditagih
  v_remaining   numeric;

  v_dpp         numeric;
  v_percent     numeric;
  v_vat         numeric;
  v_total       numeric;

  v_customer_id uuid;
  v_snapshot    jsonb;
  v_number      text;
  v_invoice_id  uuid;
  v_scope       text := nullif(p_payload ->> 'scope', '');
begin
  if v_wo_id is null and v_quot_id is null then
    raise exception 'Invoice harus menempel pada Work Order atau penawaran.';
  end if;

  -- ── Ambil nilai kontrak dari revisi TERKINI penawaran terkait ────────────
  if v_wo_id is not null then
    select q.customer_id,
           r.contract_value,
           case when r.contract_value > 0
                then round(r.tax_amount / r.contract_value * 100)
                else 0 end,
           jsonb_build_object('name', c.name, 'project', q.project_name,
                              'company', c.company, 'address', c.address)
      into v_customer_id, v_contract, v_vat_pct, v_snapshot
      from work_orders w
      join quotations q on q.id = w.quotation_id
      join customers  c on c.id = q.customer_id
      join quotation_revisions r on r.id = q.current_revision_id
     where w.id = v_wo_id;

    if not found then
      raise exception 'Work Order tidak ditemukan.';
    end if;

    select coalesce(sum(i.dpp), 0) into v_billed
      from invoices i where i.work_order_id = v_wo_id;

  else
    -- Invoice pre-deal: menempel langsung ke penawaran yang belum Deal.
    -- Invoice.gs:275 membatasinya hanya jenis DP; constraint database
    -- menegakkan hal yang sama.
    if v_type <> 'DP' then
      raise exception 'Invoice pre-deal hanya boleh jenis DP.';
    end if;

    select q.customer_id,
           r.contract_value,
           case when r.contract_value > 0
                then round(r.tax_amount / r.contract_value * 100)
                else 0 end,
           jsonb_build_object('name', c.name, 'project', q.project_name,
                              'company', c.company, 'address', c.address)
      into v_customer_id, v_contract, v_vat_pct, v_snapshot
      from quotations q
      join customers  c on c.id = q.customer_id
      join quotation_revisions r on r.id = q.current_revision_id
     where q.id = v_quot_id;

    if not found then
      raise exception 'Penawaran tidak ditemukan.';
    end if;

    select coalesce(sum(i.dpp), 0) into v_billed
      from invoices i
     where i.quotation_id = v_quot_id and i.work_order_id is null;
  end if;

  v_remaining := greatest(v_contract - v_billed, 0);

  -- ── Tentukan DPP menurut jenis tagihan (Invoice.gs:296-308) ──────────────
  if v_type = 'Pelunasan' then
    v_dpp     := v_remaining;
    v_percent := 0;
  elsif v_type = 'Penuh' then
    v_dpp     := v_contract;
    v_percent := 100;
  elsif v_input_mode = 'nominal' then
    v_dpp     := round(coalesce((p_payload ->> 'dpp')::numeric, 0));
    v_percent := case when v_contract > 0 then round(v_dpp / v_contract * 100) else 0 end;
  else
    v_percent := coalesce((p_payload ->> 'percent')::numeric, 0);
    v_dpp     := round(v_percent / 100 * v_contract);
  end if;

  if v_dpp <= 0 then
    raise exception 'Nilai tagihan harus lebih dari 0.';
  end if;

  -- Toleransi 1 rupiah untuk pembulatan, sama seperti Invoice.gs:317.
  if v_dpp > v_remaining + 1 then
    raise exception
      'Nilai tagihan (Rp %) melebihi sisa kontrak yang bisa ditagih (Rp %).',
      to_char(v_dpp, 'FM999,999,999,999'),
      to_char(v_remaining, 'FM999,999,999,999');
  end if;

  v_vat   := round(v_dpp * v_vat_pct / 100);
  v_total := v_dpp + v_vat;

  v_number := next_invoice_number(v_issue_date);

  insert into invoices (
    invoice_number, work_order_id, quotation_id, issue_date, type, percent,
    po_number, po_date, customer_id, customer_snapshot,
    dpp, vat_percent, vat_amount, total,
    notes, created_by, bank_account_id,
    scope, contract_value, input_mode
  )
  values (
    v_number, v_wo_id, v_quot_id, v_issue_date, v_type, v_percent,
    nullif(p_payload ->> 'po_number', ''),
    nullif(p_payload ->> 'po_date', '')::date,
    v_customer_id, v_snapshot,
    v_dpp, v_vat_pct, v_vat, v_total,
    nullif(p_payload ->> 'notes', ''),
    auth.uid(),
    nullif(p_payload ->> 'bank_account_id', '')::uuid,
    v_scope, v_contract, v_input_mode
  )
  returning id into v_invoice_id;

  return jsonb_build_object(
    'invoice_id',     v_invoice_id,
    'invoice_number', v_number,
    'dpp',            v_dpp,
    'vat_amount',     v_vat,
    'total',          v_total,
    'remaining_after', v_remaining - v_dpp
  );
end;
$$;

comment on function create_invoice(jsonb) is
  'Menerbitkan invoice. Sisa kontrak dihitung dan divalidasi di dalam transaksi '
  'yang sama dengan penyisipannya, sehingga dua penerbitan bersamaan tidak bisa '
  'membuat kontrak tertagih melebihi nilainya.';


-- ============================================================================
-- Pelunasan + kwitansi otomatis
-- ----------------------------------------------------------------------------
-- Menggantikan updateStatusBayarInvoice() (Invoice.gs:502) yang harus memegang
-- ScriptLock lalu memanggil catatTanggalBayar() dan _appendKwitansiRow() secara
-- terpisah — kalau salah satunya gagal, invoice tercatat lunas tanpa kwitansi.
--
-- Tanggal bayar TIDAK diisi di sini: trigger invoices_handle_payment_status
-- yang mengurusnya, sehingga kolom itu tetap konsisten dari jalur mana pun.
-- ============================================================================

create or replace function set_invoice_payment_status(
  p_invoice_id uuid,
  p_status     payment_status
)
returns jsonb
language plpgsql
as $$
declare
  v_inv          record;
  v_receipt_no   text;
  v_receipt_new  boolean := false;
begin
  update invoices set payment_status = p_status where id = p_invoice_id;

  if not found then
    raise exception 'Invoice tidak ditemukan atau Anda tidak berwenang mengubahnya.';
  end if;

  select i.*, coalesce(i.customer_snapshot ->> 'name', c.name) as customer_name,
         coalesce(i.customer_snapshot ->> 'project', q.project_name) as project_name
    into v_inv
    from invoices i
    left join customers  c on c.id = i.customer_id
    left join work_orders w on w.id = i.work_order_id
    left join quotations q on q.id = coalesce(i.quotation_id, w.quotation_id)
   where i.id = p_invoice_id;

  if p_status = 'Lunas' then
    select r.receipt_number into v_receipt_no
      from receipts r
     where r.invoice_id = p_invoice_id
     order by r.receipt_number
     limit 1;

    if v_receipt_no is null then
      v_receipt_no := next_receipt_number(current_date);

      insert into receipts (
        receipt_number, invoice_id, work_order_id, issue_date,
        received_from, amount, purpose, method, created_by
      )
      values (
        v_receipt_no, p_invoice_id, v_inv.work_order_id, current_date,
        coalesce(v_inv.customer_name, '-'),
        v_inv.total,
        -- Format keterangan sama seperti Invoice.gs:535
        'Pembayaran ' || v_inv.type::text
          || case when v_inv.percent > 0 then ' ' || trim(to_char(v_inv.percent, 'FM999')) || '%' else '' end
          || ' - ' || coalesce(v_inv.project_name, ''),
        'Transfer',
        auth.uid()
      );
      v_receipt_new := true;
    end if;
  end if;

  return jsonb_build_object(
    'payment_status', p_status,
    'receipt_number', v_receipt_no,
    'receipt_created', v_receipt_new
  );
end;
$$;

comment on function set_invoice_payment_status(uuid, payment_status) is
  'Mengubah status bayar dan menerbitkan kwitansi saat lunas, dalam satu '
  'transaksi. Kwitansi tidak digandakan bila invoice dilunasi ulang.';


grant execute on function create_invoice(jsonb) to authenticated;
grant execute on function set_invoice_payment_status(uuid, payment_status) to authenticated;
