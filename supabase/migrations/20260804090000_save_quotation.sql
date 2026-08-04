-- ============================================================================
-- RenusPro — 09. save_quotation()
-- ----------------------------------------------------------------------------
-- Menyimpan penawaran menyentuh EMPAT tabel: quotations, quotation_revisions,
-- quotation_item_groups, quotation_items. PostgREST tidak bisa menulis keempatnya
-- dalam satu transaksi, jadi kalau dilakukan sebagai empat panggilan terpisah,
-- kegagalan di tengah meninggalkan penawaran tanpa item atau revisi yatim.
-- Karena itu seluruhnya dikerjakan satu fungsi.
--
-- SECURITY INVOKER (default) — DISENGAJA. Fungsi ini berjalan dengan hak
-- pemanggil, sehingga kebijakan RLS tetap berlaku: sales hanya bisa menyimpan
-- penawarannya sendiri. Menjadikannya SECURITY DEFINER akan melubangi itu.
--
-- Seluruh nilai uang DIHITUNG ULANG di sini dari item, bukan diterima dari
-- klien. Sistem lama menyimpan apa pun yang dikirim browser
-- (JS_Form_Penawaran.html:271 → Penawaran.gs:475), sehingga angka di database
-- hanya sebaik JavaScript yang mengirimnya.
--
-- Rumusnya mengikuti persis perhitungan lama (JS_Form_Penawaran.html:256-271):
--   subtotal   = Σ (qty × harga)
--   netto      = max(0, subtotal − diskon)
--   PPN        = round(netto × persen / 100)
--   grand total= round(netto + PPN)
--   total HPP  = Σ (qty × hpp)
--   keuntungan = netto − total HPP
--   margin %   = netto > 0 ? keuntungan / netto × 100 : 0
-- ============================================================================

create or replace function save_quotation(p_payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_quotation_id uuid := nullif(p_payload ->> 'quotation_id', '')::uuid;
  v_customer_id  uuid := nullif(p_payload ->> 'customer_id', '')::uuid;
  v_project_name text := nullif(trim(p_payload ->> 'project_name'), '');
  v_issue_date   date := coalesce(nullif(p_payload ->> 'issue_date', '')::date, current_date);
  v_valid_until  date := nullif(p_payload ->> 'valid_until', '')::date;
  v_discount     numeric := greatest(coalesce((p_payload ->> 'discount')::numeric, 0), 0);
  v_tax_pct      numeric := greatest(coalesce((p_payload ->> 'tax_percent')::numeric, 0), 0);
  v_terms        jsonb := coalesce(p_payload -> 'terms', '{}'::jsonb);
  v_groups       jsonb := coalesce(p_payload -> 'groups', '[]'::jsonb);

  v_quote_number text;
  v_rev          int;
  v_revision_id  uuid;
  v_status       quotation_status;

  v_subtotal   numeric := 0;
  v_total_cost numeric := 0;
  v_net        numeric;
  v_tax        numeric;
  v_grand      numeric;
  v_profit     numeric;
  v_margin     numeric;

  v_group        record;
  v_item         record;
  v_group_id     uuid;
  v_group_sub    numeric;
  v_item_count   int := 0;
begin
  -- ── Validasi ──────────────────────────────────────────────────────────────
  if v_customer_id is null then
    raise exception 'Klien wajib dipilih.';
  end if;
  if v_project_name is null then
    raise exception 'Nama project wajib diisi.';
  end if;
  if jsonb_typeof(v_groups) <> 'array' or jsonb_array_length(v_groups) = 0 then
    raise exception 'Penawaran harus punya minimal satu sub-paket.';
  end if;

  -- ── Hitung total dari item ────────────────────────────────────────────────
  for v_group in
    select value as g from jsonb_array_elements(v_groups)
  loop
    for v_item in
      select value as it from jsonb_array_elements(coalesce(v_group.g -> 'items', '[]'::jsonb))
    loop
      v_subtotal := v_subtotal
        + coalesce((v_item.it ->> 'qty')::numeric, 0)
        * coalesce((v_item.it ->> 'price')::numeric, 0);
      v_total_cost := v_total_cost
        + coalesce((v_item.it ->> 'qty')::numeric, 0)
        * coalesce((v_item.it ->> 'cost')::numeric, 0);
      v_item_count := v_item_count + 1;
    end loop;
  end loop;

  if v_item_count = 0 then
    raise exception 'Penawaran harus punya minimal satu baris item.';
  end if;

  v_net    := greatest(v_subtotal - v_discount, 0);
  v_tax    := round(v_net * v_tax_pct / 100);
  v_grand  := round(v_net + v_tax);
  v_profit := v_net - v_total_cost;
  v_margin := case when v_net > 0 then round(v_profit / v_net * 100, 1) else 0 end;

  -- ── Penawaran baru ────────────────────────────────────────────────────────
  if v_quotation_id is null then
    v_quote_number := next_quotation_number(v_issue_date);
    v_rev := 0;

    insert into quotations (quote_number, customer_id, project_name, owner_id)
    values (v_quote_number, v_customer_id, v_project_name, auth.uid())
    returning id into v_quotation_id;

  -- ── Revisi atas penawaran yang sudah ada ──────────────────────────────────
  else
    select q.status, q.quote_number into v_status, v_quote_number
      from quotations q where q.id = v_quotation_id;

    -- RLS mengembalikan nol baris untuk penawaran milik orang lain, sehingga
    -- pesan ini sekaligus menutup kasus tidak berwenang tanpa membocorkan
    -- keberadaan dokumennya.
    if not found then
      raise exception 'Penawaran tidak ditemukan atau Anda tidak berwenang mengubahnya.';
    end if;

    -- Aturan bisnis dari Penawaran.gs:457. Penawaran yang sudah Deal biasanya
    -- sudah punya Work Order dan mungkin sudah ditagih; merevisi nilainya akan
    -- membuat invoice tidak lagi cocok dengan kontraknya.
    if v_status = 'Deal' then
      raise exception 'Penawaran berstatus Deal tidak dapat direvisi.';
    end if;

    select coalesce(max(r.rev), -1) + 1 into v_rev
      from quotation_revisions r where r.quotation_id = v_quotation_id;

    update quotations
       set customer_id  = v_customer_id,
           project_name = v_project_name
     where id = v_quotation_id;
  end if;

  -- ── Revisi ────────────────────────────────────────────────────────────────
  insert into quotation_revisions (
    quotation_id, rev, issue_date, valid_until,
    subtotal, discount, tax_amount, grand_total,
    total_cost, est_profit, margin_pct, terms, created_by
  )
  values (
    v_quotation_id, v_rev, v_issue_date, v_valid_until,
    v_subtotal, v_discount, v_tax, v_grand,
    v_total_cost, v_profit, v_margin, v_terms, auth.uid()
  )
  returning id into v_revision_id;

  -- ── Kelompok & item ───────────────────────────────────────────────────────
  for v_group in
    select value as g, (ordinality - 1)::int as idx
      from jsonb_array_elements(v_groups) with ordinality
  loop
    v_group_sub := 0;
    for v_item in
      select value as it from jsonb_array_elements(coalesce(v_group.g -> 'items', '[]'::jsonb))
    loop
      v_group_sub := v_group_sub
        + coalesce((v_item.it ->> 'qty')::numeric, 0)
        * coalesce((v_item.it ->> 'price')::numeric, 0);
    end loop;

    insert into quotation_item_groups (revision_id, code, name, subtotal, sort_order)
    values (
      v_revision_id,
      nullif(v_group.g ->> 'code', ''),
      coalesce(v_group.g ->> 'name', ''),
      v_group_sub,
      v_group.idx
    )
    returning id into v_group_id;

    insert into quotation_items (
      group_id, product_id, description, qty, unit, price, cost, line_total, sort_order
    )
    select
      v_group_id,
      nullif(t.it ->> 'product_id', '')::uuid,
      coalesce(nullif(trim(t.it ->> 'description'), ''), '(tanpa deskripsi)'),
      coalesce((t.it ->> 'qty')::numeric, 0),
      coalesce(nullif(t.it ->> 'unit', ''), 'unit'),
      coalesce((t.it ->> 'price')::numeric, 0),
      coalesce((t.it ->> 'cost')::numeric, 0),
      coalesce((t.it ->> 'qty')::numeric, 0) * coalesce((t.it ->> 'price')::numeric, 0),
      (t.ord - 1)::int
    from jsonb_array_elements(coalesce(v_group.g -> 'items', '[]'::jsonb))
         with ordinality as t(it, ord);
  end loop;

  return jsonb_build_object(
    'quotation_id', v_quotation_id,
    'quote_number', v_quote_number,
    'rev',          v_rev,
    'grand_total',  v_grand,
    'margin_pct',   v_margin
  );
end;
$$;

comment on function save_quotation(jsonb) is
  'Menyimpan penawaran (baru atau revisi) secara atomik. Seluruh nilai uang '
  'dihitung ulang dari item — angka dari klien tidak dipercaya.';

grant execute on function save_quotation(jsonb) to authenticated;
