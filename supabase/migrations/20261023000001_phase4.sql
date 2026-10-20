-- =====================================================================
-- Sweet House — Phase 4: invoices & credit notes, storage usage,
-- document cleanup, full backup export.
-- Invoices are never deleted: a credit note (avoir) cancels them.
-- =====================================================================

create table public.invoices (
  id                  uuid primary key default gen_random_uuid(),
  number              text not null unique,
  kind                text not null default 'invoice' check (kind in ('invoice', 'credit_note')),
  status              text not null default 'issued' check (status in ('issued', 'credited')),
  sale_id             uuid references public.sales(id),
  original_invoice_id uuid references public.invoices(id),
  customer_id         uuid references public.customers(id),
  client_name         text not null,
  client_ice          text,
  client_address      text,
  client_city         text,
  issued_on           date not null default current_date,
  subtotal_ht         bigint not null default 0,
  tax_total           bigint not null default 0,
  total_ttc           bigint not null default 0,
  payment_method      text,
  notes               text,
  reason              text,
  employee_id         uuid references public.employees(id),
  created_at          timestamptz not null default now()
);
create unique index invoices_one_per_sale on public.invoices (sale_id) where kind = 'invoice' and status = 'issued';

create table public.invoice_items (
  id             uuid primary key default gen_random_uuid(),
  invoice_id     uuid not null references public.invoices(id) on delete cascade,
  line_no        int not null,
  description_ar text not null,
  description_fr text not null,
  qty            numeric(12,3) not null,
  unit_price_ttc bigint not null,
  tax_rate       numeric(5,2) not null,
  total_ttc      bigint not null,
  total_ht       bigint not null,
  tax            bigint not null
);

alter table public.invoices      enable row level security;
alter table public.invoice_items enable row level security;
create policy invoices_read on public.invoices for select using (public.has_perm('pos.invoice') or public.has_perm('reports.sales'));
create policy invoice_items_read on public.invoice_items for select using (public.has_perm('pos.invoice') or public.has_perm('reports.sales'));
revoke insert, update, delete on public.invoices, public.invoice_items from anon, authenticated;

-- ---------------------------------------------------------------------
-- create_invoice
-- p = {sale_id?, client_name, client_ice, client_address, client_city, customer_id?,
--      issued_on?, notes?, payment_method?, items?:[{description_ar, description_fr, qty, unit_price_ttc, tax_rate}]}
-- From a sale the lines are copied (order discount spread proportionally).
-- ---------------------------------------------------------------------
create or replace function public.create_invoice(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid();
  v_sale sales;
  v_ratio numeric := 1;
  v_it record;
  v_j jsonb;
  v_ln int := 0;
  v_ttc bigint; v_ht bigint;
  v_customer uuid := nullif(p->>'customer_id', '')::uuid;
begin
  if not public.has_perm('pos.invoice') then raise exception 'forbidden'; end if;
  if length(trim(coalesce(p->>'client_name', ''))) < 2 then raise exception 'name_required'; end if;

  if nullif(p->>'sale_id', '') is not null then
    select * into v_sale from sales where id = (p->>'sale_id')::uuid;
    if not found or v_sale.status <> 'completed' then raise exception 'sale_not_found'; end if;
    if exists (select 1 from invoices where sale_id = v_sale.id and kind = 'invoice' and status = 'issued') then raise exception 'already_invoiced'; end if;
    v_customer := coalesce(v_customer, v_sale.customer_id);
    select case when sum(total) > 0 then v_sale.total::numeric / sum(total) else 1 end into v_ratio from sale_items where sale_id = v_sale.id;
  end if;

  insert into invoices (id, number, sale_id, customer_id, client_name, client_ice, client_address, client_city, issued_on,
                        payment_method, notes, employee_id)
  values (v_id, public.next_doc_number('invoice'), v_sale.id, v_customer, trim(p->>'client_name'), nullif(trim(p->>'client_ice'), ''),
          nullif(trim(p->>'client_address'), ''), nullif(trim(p->>'client_city'), ''),
          coalesce(nullif(p->>'issued_on', '')::date, current_date),
          coalesce(nullif(p->>'payment_method', ''), case when v_sale.paid_card > 0 then 'card' when v_sale.paid_credit > 0 then 'credit' when v_sale.id is not null then 'cash' end),
          nullif(trim(p->>'notes'), ''), public.current_employee_id());

  if v_sale.id is not null then
    for v_it in select * from sale_items where sale_id = v_sale.id order by line_no loop
      v_ln := v_ln + 1;
      v_ttc := round(v_it.total * v_ratio)::bigint;
      v_ht := round(v_ttc * 100 / (100 + v_it.tax_rate))::bigint;
      insert into invoice_items (invoice_id, line_no, description_ar, description_fr, qty, unit_price_ttc, tax_rate, total_ttc, total_ht, tax)
      values (v_id, v_ln, v_it.name_ar, v_it.name_fr, v_it.qty, round(v_ttc / v_it.qty)::bigint, v_it.tax_rate, v_ttc, v_ht, v_ttc - v_ht);
    end loop;
  else
    if jsonb_array_length(coalesce(p->'items', '[]')) = 0 then raise exception 'empty_sale'; end if;
    for v_j in select * from jsonb_array_elements(p->'items') loop
      v_ln := v_ln + 1;
      v_ttc := round((v_j->>'qty')::numeric * (v_j->>'unit_price_ttc')::bigint)::bigint;
      v_ht := round(v_ttc * 100 / (100 + coalesce((v_j->>'tax_rate')::numeric, 20)))::bigint;
      insert into invoice_items (invoice_id, line_no, description_ar, description_fr, qty, unit_price_ttc, tax_rate, total_ttc, total_ht, tax)
      values (v_id, v_ln, coalesce(nullif(v_j->>'description_ar', ''), v_j->>'description_fr'), coalesce(nullif(v_j->>'description_fr', ''), v_j->>'description_ar'),
              (v_j->>'qty')::numeric, (v_j->>'unit_price_ttc')::bigint, coalesce((v_j->>'tax_rate')::numeric, 20), v_ttc, v_ht, v_ttc - v_ht);
    end loop;
  end if;

  update invoices set
    total_ttc = (select coalesce(sum(total_ttc), 0) from invoice_items where invoice_id = v_id),
    subtotal_ht = (select coalesce(sum(total_ht), 0) from invoice_items where invoice_id = v_id),
    tax_total = (select coalesce(sum(tax), 0) from invoice_items where invoice_id = v_id)
  where id = v_id;

  if v_customer is not null and nullif(trim(p->>'client_ice'), '') is not null then
    update customers set ice = trim(p->>'client_ice'), company_name = coalesce(company_name, trim(p->>'client_name')) where id = v_customer and ice is null;
  end if;
  perform public.log_activity('insert', 'invoices', v_id::text, (select number from invoices where id = v_id), null);
  return v_id;
end $$;

create or replace function public.create_credit_note(p_invoice uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_inv invoices;
  v_id uuid := gen_random_uuid();
begin
  if not public.has_perm('pos.invoice') then raise exception 'forbidden'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select * into v_inv from invoices where id = p_invoice and kind = 'invoice' for update;
  if not found then raise exception 'not_found'; end if;
  if v_inv.status = 'credited' then raise exception 'already_credited'; end if;
  insert into invoices (id, number, kind, original_invoice_id, sale_id, customer_id, client_name, client_ice, client_address, client_city,
                        subtotal_ht, tax_total, total_ttc, payment_method, reason, employee_id)
  values (v_id, public.next_doc_number('credit_note'), 'credit_note', v_inv.id, null, v_inv.customer_id, v_inv.client_name, v_inv.client_ice,
          v_inv.client_address, v_inv.client_city, v_inv.subtotal_ht, v_inv.tax_total, v_inv.total_ttc, v_inv.payment_method, p_reason,
          public.current_employee_id());
  insert into invoice_items (invoice_id, line_no, description_ar, description_fr, qty, unit_price_ttc, tax_rate, total_ttc, total_ht, tax)
  select v_id, line_no, description_ar, description_fr, qty, unit_price_ttc, tax_rate, total_ttc, total_ht, tax from invoice_items where invoice_id = v_inv.id;
  update invoices set status = 'credited' where id = v_inv.id;
  perform public.log_activity('custom', 'invoices', v_inv.id::text, v_inv.number, jsonb_build_object('credit_note', (select number from invoices where id = v_id), 'reason', p_reason));
  return v_id;
end $$;

create or replace function public.invoice_detail(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(i) || jsonb_build_object(
    'items', (select coalesce(jsonb_agg(to_jsonb(x) order by x.line_no), '[]') from invoice_items x where x.invoice_id = i.id),
    'by_rate', (select coalesce(jsonb_agg(jsonb_build_object('rate', tax_rate, 'ht', ht, 'tax', tx, 'ttc', ttc) order by tax_rate), '[]')
                  from (select tax_rate, sum(total_ht) ht, sum(tax) tx, sum(total_ttc) ttc from invoice_items where invoice_id = i.id group by tax_rate) t),
    'original_number', (select number from invoices o where o.id = i.original_invoice_id),
    'credit_note_number', (select number from invoices c where c.original_invoice_id = i.id limit 1),
    'sale_number', (select number from sales s where s.id = i.sale_id),
    'employee_name', (select full_name from employees e where e.id = i.employee_id))
  from invoices i
  where i.id = p_id and (public.has_perm('pos.invoice') or public.has_perm('reports.sales'))
$$;

-- ---------------------------------------------------------------------
-- Storage usage & cleanup of old customer documents (owner)
-- ---------------------------------------------------------------------
create or replace function public.storage_usage()
returns jsonb language sql stable security definer set search_path = public, storage as $$
  select jsonb_build_object(
    'buckets', coalesce((select jsonb_agg(jsonb_build_object('bucket', bucket_id, 'bytes', b, 'count', n)) from (
        select bucket_id, sum(coalesce((metadata->>'size')::bigint, 0)) b, count(*) n from storage.objects group by bucket_id) t), '[]'),
    'total', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects),
    'limit', 1073741824,
    'database', pg_database_size(current_database()),
    'database_limit', 524288000)
  where public.has_perm('settings.manage')
$$;

create or replace function public.cleanup_candidates(p_days int)
returns jsonb language sql stable security definer set search_path = public, storage as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'path', f.path, 'name', f.name, 'size', o.metadata->>'size',
           'created_at', f.created_at, 'number', coalesce(r.number, oo.number))), '[]')
    from request_files f
    left join service_requests r on r.id = f.request_id
    left join request_statuses s on s.key = r.status
    left join online_orders oo on oo.id = f.order_id
    left join storage.objects o on o.bucket_id = 'customer-docs' and o.name = f.path
   where f.deleted_at is null and f.created_at < now() - make_interval(days => p_days)
     and (s.is_final or oo.status in ('delivered', 'cancelled'))
     and public.is_owner()
$$;

create or replace function public.mark_files_deleted(p_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  if not public.is_owner() then raise exception 'forbidden'; end if;
  update request_files set deleted_at = now() where id = any(p_ids) and deleted_at is null;
  get diagnostics v_n = row_count;
  perform public.log_activity('custom', 'storage', null, 'cleanup', jsonb_build_object('files', v_n));
  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- Full backup (owner): every business table as JSON
-- ---------------------------------------------------------------------
create or replace function public.full_backup()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_res jsonb := jsonb_build_object('generated_at', now(), 'version', 4);
  v_t text;
  v_rows jsonb;
begin
  if not public.is_owner() then raise exception 'forbidden'; end if;
  foreach v_t in array array['settings', 'roles', 'employees', 'devices', 'categories', 'products', 'product_variants', 'product_packs',
    'product_costs', 'service_categories', 'services', 'service_price_tiers', 'customers', 'sales', 'sale_items', 'stock_movements',
    'shifts', 'cash_movements', 'customer_ledger', 'riyad_ledger', 'refunds', 'refund_items', 'expense_categories', 'expenses',
    'suppliers', 'purchases', 'purchase_items', 'supplier_ledger', 'inventory_counts', 'inventory_count_items', 'salary_advances',
    'bonuses', 'commission_rules', 'payroll_runs', 'request_statuses', 'service_requests', 'request_history', 'request_files',
    'online_orders', 'online_order_items', 'order_history', 'invoices', 'invoice_items', 'document_sequences', 'activity_log']
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]'') from public.%I t', v_t) into v_rows;
    v_res := v_res || jsonb_build_object(v_t, v_rows);
  end loop;
  perform public.log_activity('custom', 'backup', null, 'full_backup', null);
  return v_res;
end $$;
