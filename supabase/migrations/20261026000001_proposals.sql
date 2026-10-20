-- =====================================================================
-- Owner proposals: product import, today's tasks, recurring expenses,
-- school list → POS sale.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Product import (from Excel). Each row is saved independently; the
-- result lists the rows that failed with their reason.
-- rows = [{name_ar, name_fr, category, brand, price, cost, barcode, sku, stock, tax_rate, low_stock_alert, online}]
-- ---------------------------------------------------------------------
create or replace function public.import_products(p_rows jsonb, p_update_existing boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  i int := 0;
  v_ok int := 0;
  v_upd int := 0;
  v_errors jsonb := '[]';
  v_cat uuid;
  v_pid uuid;
  v_vid uuid;
  v_bc text;
begin
  if not public.has_perm('products.manage') then raise exception 'forbidden'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    begin
      if coalesce(trim(r->>'name_ar'), '') = '' and coalesce(trim(r->>'name_fr'), '') = '' then raise exception 'name_required'; end if;
      v_cat := null;
      if coalesce(trim(r->>'category'), '') <> '' then
        select id into v_cat from categories where deleted_at is null and (name_ar = trim(r->>'category') or lower(name_fr) = lower(trim(r->>'category'))) limit 1;
        if v_cat is null then
          insert into categories (name_ar, name_fr, icon) values (trim(r->>'category'), trim(r->>'category'), 'tag') returning id into v_cat;
        end if;
      end if;
      v_bc := nullif(regexp_replace(coalesce(r->>'barcode', ''), '\s|\.0$', '', 'g'), '');
      v_pid := null; v_vid := null;
      if v_bc is not null and p_update_existing then
        select v.product_id, v.id into v_pid, v_vid from product_variants v where v.barcode = v_bc and v.deleted_at is null limit 1;
      end if;

      if v_vid is not null then
        update products set name_ar = coalesce(nullif(trim(r->>'name_ar'), ''), name_ar), name_fr = coalesce(nullif(trim(r->>'name_fr'), ''), name_fr),
               category_id = coalesce(v_cat, category_id), brand = coalesce(nullif(trim(r->>'brand'), ''), brand),
               tax_rate = coalesce(nullif(r->>'tax_rate', '')::numeric, tax_rate),
               is_online = coalesce(nullif(r->>'online', '')::boolean, is_online)
         where id = v_pid;
        update product_variants set price = coalesce(round(nullif(r->>'price', '')::numeric * 100)::bigint, price),
               sku = coalesce(nullif(trim(r->>'sku'), ''), sku) where id = v_vid;
        if public.has_perm('products.view_cost') and nullif(r->>'cost', '') is not null then
          insert into product_costs (variant_id, cost) values (v_vid, round((r->>'cost')::numeric * 100)::bigint)
          on conflict (variant_id) do update set cost = excluded.cost, updated_at = now();
        end if;
        v_upd := v_upd + 1;
      else
        perform public.save_product(jsonb_build_object(
          'category_id', v_cat,
          'name_ar', coalesce(nullif(trim(r->>'name_ar'), ''), trim(r->>'name_fr')),
          'name_fr', coalesce(nullif(trim(r->>'name_fr'), ''), trim(r->>'name_ar')),
          'brand', nullif(trim(r->>'brand'), ''),
          'tax_rate', coalesce(nullif(r->>'tax_rate', '')::numeric, (select (value->>'default_tax_rate')::numeric from settings where key = 'legal'), 20),
          'low_stock_alert', coalesce(nullif(r->>'low_stock_alert', '')::numeric, 5),
          'is_online', coalesce(nullif(r->>'online', '')::boolean, false),
          'variants', jsonb_build_array(jsonb_build_object(
            'price', round(coalesce(nullif(r->>'price', '')::numeric, 0) * 100)::bigint,
            'cost', round(coalesce(nullif(r->>'cost', '')::numeric, 0) * 100)::bigint,
            'barcode', v_bc, 'sku', nullif(trim(r->>'sku'), ''),
            'initial_stock', coalesce(nullif(r->>'stock', '')::numeric, 0), 'packs', '[]'::jsonb))));
        v_ok := v_ok + 1;
      end if;
    exception when others then
      v_errors := v_errors || jsonb_build_object('row', i, 'name', coalesce(r->>'name_ar', r->>'name_fr'), 'error', sqlerrm);
    end;
  end loop;
  perform public.log_activity('custom', 'products', null, 'import', jsonb_build_object('created', v_ok, 'updated', v_upd, 'errors', jsonb_array_length(v_errors)));
  return jsonb_build_object('created', v_ok, 'updated', v_upd, 'errors', v_errors);
end $$;

-- ---------------------------------------------------------------------
-- Recurring expenses (rent, electricity…) generated once per month
-- ---------------------------------------------------------------------
create table public.recurring_expenses (
  id              uuid primary key default gen_random_uuid(),
  category_id     uuid references public.expense_categories(id),
  amount          bigint not null check (amount > 0),
  day_of_month    int not null default 1 check (day_of_month between 1 and 28),
  paid_from       text not null default 'bank' check (paid_from in ('bank', 'owner')),
  note            text,
  is_active       boolean not null default true,
  last_generated  date,
  created_at      timestamptz not null default now()
);
alter table public.recurring_expenses enable row level security;
create policy recurring_read on public.recurring_expenses for select using (public.has_perm('expenses.manage'));
create policy recurring_write on public.recurring_expenses for all using (public.has_perm('expenses.manage')) with check (public.has_perm('expenses.manage'));

create or replace function public.generate_recurring_expenses()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_r recurring_expenses;
  v_n int := 0;
  v_month date := date_trunc('month', (now() at time zone 'Africa/Casablanca'))::date;
  v_today date := (now() at time zone 'Africa/Casablanca')::date;
begin
  if not public.is_staff() then return 0; end if;
  for v_r in select * from recurring_expenses
              where is_active and (last_generated is null or last_generated < v_month)
                and extract(day from v_today) >= day_of_month for update skip locked loop
    insert into expenses (category_id, amount, spent_on, paid_from, note)
    values (v_r.category_id, v_r.amount, v_month + (v_r.day_of_month - 1), v_r.paid_from, coalesce(v_r.note, '') || ' (تلقائي)');
    update recurring_expenses set last_generated = v_month where id = v_r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- Today's tasks for the dashboard home
-- ---------------------------------------------------------------------
create or replace function public.today_tasks()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'requests_new', case when public.has_perm('requests.manage') then (select count(*) from service_requests where status = 'received') end,
    'requests_docs', case when public.has_perm('requests.manage') then (select count(*) from jsonb_array_elements(public.requests_list(500)) x where (x->>'new_docs')::int > 0) end,
    'requests_ready_unpaid', case when public.has_perm('requests.manage') then
        (select count(*) from service_requests r join request_statuses s on s.key = r.status where s.allow_download and r.payment_status <> 'paid' and r.price > 0) end,
    'proofs', case when public.has_perm('payments.confirm_transfer') then
        (select count(*) from service_requests where payment_status = 'proof_uploaded') + (select count(*) from online_orders where payment_status = 'proof_uploaded') end,
    'orders_new', case when public.has_perm('orders.manage') then (select count(*) from online_orders where status = 'new') end,
    'orders_open', case when public.has_perm('orders.manage') then (select count(*) from online_orders where status in ('confirmed', 'preparing', 'shipped', 'ready')) end,
    'low_stock', case when public.has_perm('products.manage') then
        (select count(*) from product_variants v join products p on p.id = v.product_id where p.deleted_at is null and v.deleted_at is null and p.track_stock and v.stock_qty <= p.low_stock_alert) end,
    'debts_overdue', case when public.has_perm('customers.manage') then
        (select count(*) from (select customer_id, sum(amount) b, coalesce(max(created_at) filter (where amount < 0), min(created_at)) last_move
                                 from customer_ledger group by 1) t
          where t.b > 0 and t.last_move < now() - interval '30 days') end,
    'riyad_low', case when public.has_perm('riyad.view_balance') then
        public.riyad_balance() < (select coalesce((value->>'low_balance_alert')::bigint, 200000) from settings where key = 'riyad')
        and exists (select 1 from riyad_ledger) end,
    'backup_days', case when public.is_owner() then
        (select extract(day from now() - max(at))::int from activity_log where entity = 'backup') end)
  where public.is_staff()
$$;

-- ---------------------------------------------------------------------
-- School list prepared at the POS: the sale settles the request
-- ---------------------------------------------------------------------
alter table public.service_requests add column paid_via_sale uuid references public.sales(id);

create or replace function public.close_request_with_sale(p_request uuid, p_sale uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_s sales;
begin
  if not public.has_perm('requests.manage') then raise exception 'forbidden'; end if;
  select * into v_s from sales where id = p_sale and status = 'completed';
  if not found then raise exception 'sale_not_found'; end if;
  update service_requests set price = v_s.total, payment_status = 'paid', paid_at = now(), paid_by = public.current_employee_id(),
         paid_via_sale = p_sale, status = 'delivered'
   where id = p_request;
  insert into request_history (request_id, status, note, employee_id) values (p_request, 'delivered', 'sale:' || v_s.number, public.current_employee_id());
end $$;

-- Requests paid through a POS sale are already counted in sales revenue.
create or replace function public.online_summary(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'orders_count', (select count(*) from online_orders where created_at >= p_from and created_at < p_to),
    'orders_paid', (select coalesce(sum(total), 0) from online_orders where payment_status = 'paid' and paid_at >= p_from and paid_at < p_to),
    'orders_cogs', (select coalesce(sum(i.unit_cost * i.qty), 0)::bigint from online_order_items i join online_orders o on o.id = i.order_id
                     where o.payment_status = 'paid' and o.paid_at >= p_from and o.paid_at < p_to),
    'requests_count', (select count(*) from service_requests where created_at >= p_from and created_at < p_to),
    'requests_paid', (select coalesce(sum(price), 0) from service_requests where payment_status = 'paid' and paid_via_sale is null and paid_at >= p_from and paid_at < p_to),
    'by_service', (select coalesce(jsonb_agg(t order by t.count desc), '[]') from (
        select service_name_ar name_ar, service_name_fr name_fr, count(*) count, coalesce(sum(price) filter (where payment_status = 'paid'), 0) paid
          from service_requests where created_at >= p_from and created_at < p_to group by 1, 2 limit 15) t))
  where public.has_perm('reports.sales')
$$;
