-- =====================================================================
-- Sweet House — Phase 2: expenses, suppliers & purchases, inventory,
-- payroll (advances, bonuses, commissions) and reports.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------
create table public.expense_categories (
  id         uuid primary key default gen_random_uuid(),
  name_ar    text not null,
  name_fr    text not null,
  icon       text,
  color      text not null default '#475569',
  sort       int not null default 0,
  deleted_at timestamptz
);

create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid references public.expense_categories(id),
  amount      bigint not null check (amount > 0),
  spent_on    date not null default current_date,
  paid_from   text not null default 'bank' check (paid_from in ('drawer', 'bank', 'owner')),
  shift_id    uuid references public.shifts(id),
  note        text,
  employee_id uuid references public.employees(id),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index expenses_date_idx on public.expenses (spent_on desc);

insert into public.expense_categories (name_ar, name_fr, icon, color, sort) values
  ('الكراء', 'Loyer', 'landmark', '#0F172A', 1),
  ('الكهرباء والماء', 'Électricité & eau', 'sparkles', '#D97706', 2),
  ('الإنترنت والهاتف', 'Internet & téléphone', 'scan-line', '#2563EB', 3),
  ('الورق والحبر', 'Papier & encre', 'printer', '#FF6B35', 4),
  ('الصيانة', 'Maintenance', 'scissors', '#7C3AED', 5),
  ('الضرائب والرسوم', 'Impôts & taxes', 'receipt', '#DC2626', 6),
  ('مصاريف أخرى', 'Autres', 'package', '#475569', 7);

-- ---------------------------------------------------------------------
-- Suppliers & purchases
-- ---------------------------------------------------------------------
create table public.suppliers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text,
  email      text,
  ice        text,
  address    text,
  notes      text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.purchases (
  id          uuid primary key default gen_random_uuid(),
  number      text not null unique,
  supplier_id uuid references public.suppliers(id),
  invoice_ref text,
  purchased_on date not null default current_date,
  total       bigint not null default 0,
  note        text,
  employee_id uuid references public.employees(id),
  created_at  timestamptz not null default now()
);

create table public.purchase_items (
  id          uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  variant_id  uuid not null references public.product_variants(id),
  qty         numeric(12,3) not null check (qty > 0),
  unit_cost   bigint not null check (unit_cost >= 0),
  total       bigint not null
);

-- + purchase (we owe), − payment
create table public.supplier_ledger (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  type        text not null check (type in ('purchase', 'payment', 'adjustment')),
  amount      bigint not null,
  method      text check (method in ('drawer', 'bank', 'owner')),
  purchase_id uuid references public.purchases(id),
  shift_id    uuid references public.shifts(id),
  note        text,
  employee_id uuid references public.employees(id),
  created_at  timestamptz not null default now()
);

create or replace view public.supplier_balances with (security_invoker = true) as
  select s.id, s.name, s.phone, coalesce(sum(l.amount), 0)::bigint as balance,
         (select count(*) from purchases p where p.supplier_id = s.id) as purchases_count
    from public.suppliers s left join public.supplier_ledger l on l.supplier_id = s.id
   where s.deleted_at is null group by s.id;

-- ---------------------------------------------------------------------
-- Inventory counts
-- ---------------------------------------------------------------------
create table public.inventory_counts (
  id          uuid primary key default gen_random_uuid(),
  status      text not null default 'draft' check (status in ('draft', 'applied', 'cancelled')),
  note        text,
  category_id uuid references public.categories(id),
  created_by  uuid references public.employees(id),
  created_at  timestamptz not null default now(),
  applied_at  timestamptz,
  applied_by  uuid references public.employees(id)
);
create table public.inventory_count_items (
  id           uuid primary key default gen_random_uuid(),
  count_id     uuid not null references public.inventory_counts(id) on delete cascade,
  variant_id   uuid not null references public.product_variants(id),
  expected_qty numeric(12,3) not null,
  counted_qty  numeric(12,3),
  unique (count_id, variant_id)
);

-- ---------------------------------------------------------------------
-- Payroll
-- ---------------------------------------------------------------------
create table public.salary_advances (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  amount      bigint not null check (amount > 0),
  given_on    date not null default current_date,
  paid_from   text not null default 'drawer' check (paid_from in ('drawer', 'bank', 'owner')),
  shift_id    uuid references public.shifts(id),
  payroll_id  uuid,
  note        text,
  created_by  uuid references public.employees(id),
  created_at  timestamptz not null default now()
);

create table public.bonuses (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  amount      bigint not null,
  month       date not null,
  note        text,
  created_by  uuid references public.employees(id),
  created_at  timestamptz not null default now()
);

create table public.commission_rules (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id),      -- null = everyone
  scope       text not null check (scope in ('all', 'category', 'product', 'service')),
  category_id uuid references public.categories(id),
  product_id  uuid references public.products(id),
  service_id  uuid references public.services(id),
  kind        text not null check (kind in ('percent', 'per_unit')),
  value       numeric(12,2) not null check (value >= 0),  -- % or centimes per unit
  is_active   boolean not null default true,
  note        text,
  created_at  timestamptz not null default now()
);

create table public.payroll_runs (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id),
  month        date not null,
  base_salary  bigint not null,
  commissions  bigint not null,
  bonuses      bigint not null,
  advances     bigint not null,
  net          bigint not null,
  paid_from    text not null default 'bank' check (paid_from in ('drawer', 'bank', 'owner')),
  paid_at      timestamptz not null default now(),
  created_by   uuid references public.employees(id),
  unique (employee_id, month)
);
alter table public.salary_advances add constraint advances_payroll_fk foreign key (payroll_id) references public.payroll_runs(id);

-- ---------------------------------------------------------------------
-- Audit + RLS
-- ---------------------------------------------------------------------
create trigger audit_expenses after insert or update or delete on public.expenses for each row execute function public.audit_row();
create trigger audit_suppliers after insert or update or delete on public.suppliers for each row execute function public.audit_row();
create trigger audit_commission_rules after insert or update or delete on public.commission_rules for each row execute function public.audit_row();
create trigger audit_bonuses after insert or update or delete on public.bonuses for each row execute function public.audit_row();

alter table public.expense_categories    enable row level security;
alter table public.expenses              enable row level security;
alter table public.suppliers             enable row level security;
alter table public.purchases             enable row level security;
alter table public.purchase_items        enable row level security;
alter table public.supplier_ledger       enable row level security;
alter table public.inventory_counts      enable row level security;
alter table public.inventory_count_items enable row level security;
alter table public.salary_advances       enable row level security;
alter table public.bonuses               enable row level security;
alter table public.commission_rules      enable row level security;
alter table public.payroll_runs          enable row level security;

create policy expense_categories_read on public.expense_categories for select using (public.is_staff());
create policy expense_categories_write on public.expense_categories for all using (public.has_perm('expenses.manage')) with check (public.has_perm('expenses.manage'));
create policy expenses_read on public.expenses for select using (public.has_perm('expenses.manage') or public.has_perm('reports.profit'));
create policy expenses_update on public.expenses for update using (public.has_perm('expenses.manage')) with check (public.has_perm('expenses.manage'));

create policy suppliers_read on public.suppliers for select using (public.has_perm('purchases.manage') or public.has_perm('suppliers.pay'));
create policy suppliers_write on public.suppliers for all using (public.has_perm('purchases.manage')) with check (public.has_perm('purchases.manage'));
create policy purchases_read on public.purchases for select using (public.has_perm('purchases.manage') or public.has_perm('suppliers.pay'));
create policy purchase_items_read on public.purchase_items for select using (public.has_perm('purchases.manage'));
create policy supplier_ledger_read on public.supplier_ledger for select using (public.has_perm('purchases.manage') or public.has_perm('suppliers.pay'));

create policy inventory_read on public.inventory_counts for select using (public.has_perm('stock.inventory'));
create policy inventory_items_read on public.inventory_count_items for select using (public.has_perm('stock.inventory'));

create policy advances_read on public.salary_advances for select using (public.has_perm('employees.manage') or employee_id = public.current_employee_id());
create policy bonuses_read on public.bonuses for select using (public.has_perm('employees.manage') or employee_id = public.current_employee_id());
create policy bonuses_write on public.bonuses for all using (public.has_perm('employees.manage')) with check (public.has_perm('employees.manage'));
create policy rules_read on public.commission_rules for select using (public.has_perm('employees.manage'));
create policy rules_write on public.commission_rules for all using (public.has_perm('employees.manage')) with check (public.has_perm('employees.manage'));
create policy payroll_read on public.payroll_runs for select using (public.has_perm('employees.manage') or employee_id = public.current_employee_id());

revoke insert, update, delete on public.expenses, public.purchases, public.purchase_items, public.supplier_ledger,
  public.inventory_counts, public.inventory_count_items, public.salary_advances, public.payroll_runs from anon, authenticated;
grant update on public.expenses to authenticated;
grant select on public.supplier_balances to authenticated;

-- ---------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------
create or replace function public.add_expense(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_shift uuid;
  v_from text := coalesce(p->>'paid_from', 'bank');
  v_amount bigint := (p->>'amount')::bigint;
begin
  if not (public.has_perm('expenses.manage') or (v_from = 'drawer' and public.has_perm('cash.expense'))) then raise exception 'forbidden'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'invalid_amount'; end if;
  if v_from = 'drawer' then v_shift := public.require_open_shift(nullif(p->>'device_id', '')::uuid); end if;
  insert into expenses (category_id, amount, spent_on, paid_from, shift_id, note, employee_id)
  values (nullif(p->>'category_id', '')::uuid, v_amount, coalesce(nullif(p->>'spent_on', '')::date, current_date), v_from, v_shift,
          p->>'note', public.current_employee_id())
  returning id into v_id;
  if v_from = 'drawer' then
    insert into cash_movements (shift_id, type, amount, ref_id, note, employee_id)
    values (v_shift, 'expense', -v_amount, v_id, p->>'note', public.current_employee_id());
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Purchases: stock in, update cost (last cost), supplier debt, optional payment
-- p = {supplier_id, invoice_ref, purchased_on, note, items:[{variant_id, qty, unit_cost}],
--      payment:{amount, method, device_id}}
-- ---------------------------------------------------------------------
create or replace function public.create_purchase(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid();
  v_it jsonb;
  v_total bigint := 0;
  v_line bigint;
  v_supplier uuid := nullif(p->>'supplier_id', '')::uuid;
  v_pay bigint := coalesce((p->'payment'->>'amount')::bigint, 0);
  v_method text := coalesce(p->'payment'->>'method', 'bank');
  v_shift uuid;
begin
  if not public.has_perm('purchases.manage') then raise exception 'forbidden'; end if;
  if jsonb_array_length(coalesce(p->'items', '[]')) = 0 then raise exception 'empty_purchase'; end if;
  insert into purchases (id, number, supplier_id, invoice_ref, purchased_on, note, employee_id)
  values (v_id, public.next_doc_number('purchase'), v_supplier, p->>'invoice_ref',
          coalesce(nullif(p->>'purchased_on', '')::date, current_date), p->>'note', public.current_employee_id());

  for v_it in select * from jsonb_array_elements(p->'items') loop
    v_line := round((v_it->>'qty')::numeric * (v_it->>'unit_cost')::bigint)::bigint;
    insert into purchase_items (purchase_id, variant_id, qty, unit_cost, total)
    values (v_id, (v_it->>'variant_id')::uuid, (v_it->>'qty')::numeric, (v_it->>'unit_cost')::bigint, v_line);
    insert into stock_movements (variant_id, qty_change, reason, ref_id, employee_id)
    values ((v_it->>'variant_id')::uuid, (v_it->>'qty')::numeric, 'purchase', v_id, public.current_employee_id());
    insert into product_costs (variant_id, cost, updated_at) values ((v_it->>'variant_id')::uuid, (v_it->>'unit_cost')::bigint, now())
    on conflict (variant_id) do update set cost = excluded.cost, updated_at = now();
    v_total := v_total + v_line;
  end loop;
  update purchases set total = v_total where id = v_id;

  if v_supplier is not null then
    insert into supplier_ledger (supplier_id, type, amount, purchase_id, employee_id)
    values (v_supplier, 'purchase', v_total, v_id, public.current_employee_id());
  end if;
  if v_pay > 0 then
    if v_supplier is null then raise exception 'supplier_required'; end if;
    perform public.pay_supplier(v_supplier, v_pay, v_method, nullif(p->'payment'->>'device_id', '')::uuid, 'دفعة مع ' || (select number from purchases where id = v_id));
  end if;
  perform public.log_activity('insert', 'purchases', v_id::text, (select number from purchases where id = v_id), jsonb_build_object('total', v_total));
  return v_id;
end $$;

create or replace function public.pay_supplier(p_supplier uuid, p_amount bigint, p_method text, p_device uuid, p_note text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_shift uuid;
begin
  if not (public.has_perm('suppliers.pay') or public.has_perm('purchases.manage')) then raise exception 'forbidden'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if p_method = 'drawer' then
    v_shift := public.require_open_shift(p_device);
    insert into cash_movements (shift_id, type, amount, note, employee_id)
    values (v_shift, 'supplier_payment', -p_amount, p_note, public.current_employee_id());
  end if;
  insert into supplier_ledger (supplier_id, type, amount, method, shift_id, note, employee_id)
  values (p_supplier, 'payment', -p_amount, p_method, v_shift, p_note, public.current_employee_id());
  perform public.log_activity('custom', 'suppliers', p_supplier::text, (select name from suppliers where id = p_supplier),
    jsonb_build_object('payment', p_amount, 'method', p_method));
  return (select coalesce(sum(amount), 0) from supplier_ledger where supplier_id = p_supplier);
end $$;

create or replace function public.supplier_statement(p_supplier uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'supplier', (select to_jsonb(s) from suppliers s where s.id = p_supplier),
    'balance', (select coalesce(sum(amount), 0) from supplier_ledger where supplier_id = p_supplier),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'type', l.type, 'amount', l.amount, 'method', l.method,
        'note', l.note, 'created_at', l.created_at, 'purchase_number', p.number) order by l.created_at desc)
      from supplier_ledger l left join purchases p on p.id = l.purchase_id where l.supplier_id = p_supplier), '[]'))
  where public.has_perm('purchases.manage') or public.has_perm('suppliers.pay')
$$;

create or replace function public.get_purchase(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(p) || jsonb_build_object('supplier_name', s.name, 'employee_name', e.full_name,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('qty', i.qty, 'unit_cost', i.unit_cost, 'total', i.total,
        'name_ar', pr.name_ar || coalesce(' - ' || v.name_ar, ''), 'name_fr', pr.name_fr || coalesce(' - ' || v.name_fr, ''))), '[]')
      from purchase_items i join product_variants v on v.id = i.variant_id join products pr on pr.id = v.product_id where i.purchase_id = p.id))
  from purchases p left join suppliers s on s.id = p.supplier_id left join employees e on e.id = p.employee_id
  where p.id = p_id and public.has_perm('purchases.manage')
$$;

-- ---------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------
create or replace function public.start_inventory(p_category uuid, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.has_perm('stock.inventory') then raise exception 'forbidden'; end if;
  insert into inventory_counts (category_id, note, created_by) values (p_category, p_note, public.current_employee_id()) returning id into v_id;
  insert into inventory_count_items (count_id, variant_id, expected_qty)
  select v_id, v.id, v.stock_qty from product_variants v join products p on p.id = v.product_id
   where v.deleted_at is null and p.deleted_at is null and p.track_stock and (p_category is null or p.category_id = p_category);
  return v_id;
end $$;

create or replace function public.set_inventory_count(p_item uuid, p_qty numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('stock.inventory') then raise exception 'forbidden'; end if;
  update inventory_count_items i set counted_qty = p_qty
   where i.id = p_item and exists (select 1 from inventory_counts c where c.id = i.count_id and c.status = 'draft');
end $$;

create or replace function public.apply_inventory(p_count uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_n int := 0;
  v_r record;
begin
  if not public.has_perm('stock.inventory') then raise exception 'forbidden'; end if;
  if not exists (select 1 from inventory_counts where id = p_count and status = 'draft') then raise exception 'inventory_not_draft'; end if;
  for v_r in
    select i.variant_id, i.counted_qty - v.stock_qty as diff
      from inventory_count_items i join product_variants v on v.id = i.variant_id
     where i.count_id = p_count and i.counted_qty is not null and i.counted_qty <> v.stock_qty
  loop
    insert into stock_movements (variant_id, qty_change, reason, ref_id, employee_id)
    values (v_r.variant_id, v_r.diff, 'inventory', p_count, public.current_employee_id());
    v_n := v_n + 1;
  end loop;
  update inventory_counts set status = 'applied', applied_at = now(), applied_by = public.current_employee_id() where id = p_count;
  perform public.log_activity('custom', 'stock', p_count::text, 'inventory', jsonb_build_object('adjusted', v_n));
  return jsonb_build_object('adjusted', v_n);
end $$;

create or replace function public.inventory_detail(p_count uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(c) || jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id, 'variant_id', i.variant_id, 'expected_qty', i.expected_qty, 'counted_qty', i.counted_qty,
      'current_qty', v.stock_qty, 'barcode', v.barcode,
      'name_ar', p.name_ar || coalesce(' - ' || v.name_ar, ''), 'name_fr', p.name_fr || coalesce(' - ' || v.name_fr, ''),
      'price', v.price) order by p.name_ar)
    from inventory_count_items i join product_variants v on v.id = i.variant_id join products p on p.id = v.product_id
    where i.count_id = c.id), '[]'))
  from inventory_counts c where c.id = p_count and public.has_perm('stock.inventory')
$$;

-- ---------------------------------------------------------------------
-- Stock movements list (dashboard)
-- ---------------------------------------------------------------------
create or replace function public.stock_history(p_limit int default 300)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]') from (
    select jsonb_build_object('id', m.id, 'qty_change', m.qty_change, 'reason', m.reason, 'note', m.note, 'created_at', m.created_at,
             'name_ar', p.name_ar || coalesce(' - ' || v.name_ar, ''), 'name_fr', p.name_fr || coalesce(' - ' || v.name_fr, ''),
             'employee_name', e.full_name, 'stock_qty', v.stock_qty) x
      from stock_movements m join product_variants v on v.id = m.variant_id join products p on p.id = v.product_id
      left join employees e on e.id = m.employee_id
     order by m.created_at desc limit p_limit) t
  where public.has_perm('products.manage') or public.has_perm('stock.adjust')
$$;

-- ---------------------------------------------------------------------
-- Payroll
-- ---------------------------------------------------------------------
create or replace function public.give_advance(p_employee uuid, p_amount bigint, p_from text, p_device uuid, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_shift uuid;
begin
  if not public.has_perm('employees.manage') then raise exception 'forbidden'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if p_from = 'drawer' then v_shift := public.require_open_shift(p_device); end if;
  insert into salary_advances (employee_id, amount, paid_from, shift_id, note, created_by)
  values (p_employee, p_amount, p_from, v_shift, p_note, public.current_employee_id()) returning id into v_id;
  if p_from = 'drawer' then
    insert into cash_movements (shift_id, type, amount, ref_id, note, employee_id)
    values (v_shift, 'salary_advance', -p_amount, v_id, p_note, public.current_employee_id());
  end if;
  perform public.log_activity('custom', 'payroll', p_employee::text, (select full_name from employees where id = p_employee),
    jsonb_build_object('advance', p_amount));
  return v_id;
end $$;

-- Commission earned by an employee in [from, to)
create or replace function public.employee_commission(p_employee uuid, p_from timestamptz, p_to timestamptz)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(case r.kind when 'percent' then i.total * r.value / 100 else i.qty * r.value end), 0)::bigint
    from sale_items i
    join sales s on s.id = i.sale_id
    left join products p on p.id = i.product_id
    join commission_rules r on r.is_active and (r.employee_id is null or r.employee_id = p_employee) and (
         r.scope = 'all'
      or (r.scope = 'category' and p.category_id = r.category_id)
      or (r.scope = 'product' and i.product_id = r.product_id)
      or (r.scope = 'service' and i.service_id = r.service_id))
   where s.employee_id = p_employee and s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to
$$;

create or replace function public.payroll_preview(p_month date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz := date_trunc('month', p_month::timestamp) at time zone 'Africa/Casablanca';
  v_to timestamptz := (date_trunc('month', p_month::timestamp) + interval '1 month') at time zone 'Africa/Casablanca';
  v_m date := date_trunc('month', p_month)::date;
begin
  if not public.has_perm('employees.manage') then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(x order by x->>'full_name') from (
    select jsonb_build_object(
      'employee_id', e.id, 'full_name', e.full_name, 'color', e.color, 'base_salary', e.monthly_salary,
      'sales', (select coalesce(sum(total), 0) from sales where employee_id = e.id and status = 'completed' and created_at >= v_from and created_at < v_to),
      'commissions', public.employee_commission(e.id, v_from, v_to),
      'bonuses', (select coalesce(sum(amount), 0) from bonuses where employee_id = e.id and month = v_m),
      'advances', (select coalesce(sum(amount), 0) from salary_advances where employee_id = e.id and payroll_id is null),
      'paid', (select to_jsonb(r) from payroll_runs r where r.employee_id = e.id and r.month = v_m)) x
    from employees e where e.deleted_at is null and e.is_active and not e.is_owner) t), '[]');
end $$;

create or replace function public.pay_payroll(p_employee uuid, p_month date, p_from text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_m date := date_trunc('month', p_month)::date;
  v_row jsonb;
  v_id uuid;
  v_net bigint;
begin
  if not public.has_perm('employees.manage') then raise exception 'forbidden'; end if;
  if exists (select 1 from payroll_runs where employee_id = p_employee and month = v_m) then raise exception 'already_paid'; end if;
  select x into v_row from jsonb_array_elements(public.payroll_preview(p_month)) x where (x->>'employee_id')::uuid = p_employee;
  if v_row is null then raise exception 'employee_not_found'; end if;
  v_net := (v_row->>'base_salary')::bigint + (v_row->>'commissions')::bigint + (v_row->>'bonuses')::bigint - (v_row->>'advances')::bigint;
  insert into payroll_runs (employee_id, month, base_salary, commissions, bonuses, advances, net, paid_from, created_by)
  values (p_employee, v_m, (v_row->>'base_salary')::bigint, (v_row->>'commissions')::bigint, (v_row->>'bonuses')::bigint,
          (v_row->>'advances')::bigint, v_net, p_from, public.current_employee_id())
  returning id into v_id;
  update salary_advances set payroll_id = v_id where employee_id = p_employee and payroll_id is null;
  perform public.log_activity('custom', 'payroll', p_employee::text, v_row->>'full_name', jsonb_build_object('month', v_m, 'net', v_net));
  return jsonb_build_object('id', v_id, 'net', v_net);
end $$;

-- ---------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------
create or replace function public.report(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_profit boolean := public.has_perm('reports.profit');
  v_res jsonb;
  v_revenue bigint; v_cogs bigint; v_refunds bigint; v_exp bigint; v_sal bigint; v_comm bigint;
begin
  if not public.has_perm('reports.sales') then raise exception 'forbidden'; end if;
  select coalesce(sum(total), 0) into v_revenue from sales where status = 'completed' and created_at >= p_from and created_at < p_to;
  select coalesce(sum(total), 0) into v_refunds from refunds where created_at >= p_from and created_at < p_to;
  select coalesce(sum(i.unit_cost * i.qty), 0)::bigint into v_cogs from sale_items i join sales s on s.id = i.sale_id
   where s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to;

  v_res := jsonb_build_object(
    'revenue', v_revenue,
    'refunds', v_refunds,
    'net_revenue', v_revenue - v_refunds,
    'sales_count', (select count(*) from sales where status = 'completed' and created_at >= p_from and created_at < p_to),
    'payments', (select jsonb_build_object('cash', coalesce(sum(paid_cash), 0), 'card', coalesce(sum(paid_card), 0), 'credit', coalesce(sum(paid_credit), 0))
                   from sales where status = 'completed' and created_at >= p_from and created_at < p_to),
    'tax', (select coalesce(sum(tax_total), 0) from sales where status = 'completed' and created_at >= p_from and created_at < p_to),
    'discounts', (select coalesce(sum(discount_total), 0) from sales where status = 'completed' and created_at >= p_from and created_at < p_to),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'revenue', r, 'count', c) order by d), '[]') from (
        select (created_at at time zone 'Africa/Casablanca')::date d, sum(total) r, count(*) c from sales
         where status = 'completed' and created_at >= p_from and created_at < p_to group by 1) t),
    'by_hour', (select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'revenue', r) order by h), '[]') from (
        select extract(hour from created_at at time zone 'Africa/Casablanca')::int h, sum(total) r from sales
         where status = 'completed' and created_at >= p_from and created_at < p_to group by 1) t),
    'by_category', (select coalesce(jsonb_agg(t order by t.revenue desc), '[]') from (
        select coalesce(c.name_ar, case when i.item_type = 'service' then 'الخدمات' else 'بدون فئة' end) name_ar,
               coalesce(c.name_fr, case when i.item_type = 'service' then 'Services' else 'Sans catégorie' end) name_fr,
               coalesce(c.color, '#475569') color, sum(i.total) revenue, sum(i.qty) qty
          from sale_items i join sales s on s.id = i.sale_id left join products p on p.id = i.product_id left join categories c on c.id = p.category_id
         where s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to
         group by 1, 2, 3) t),
    'top_items', (select coalesce(jsonb_agg(t order by t.revenue desc), '[]') from (
        select i.name_ar, i.name_fr, sum(i.qty) qty, sum(i.total) revenue,
               case when v_profit then sum(i.total - i.unit_cost * i.qty) end profit
          from sale_items i join sales s on s.id = i.sale_id
         where s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to
         group by i.name_ar, i.name_fr order by sum(i.total) desc limit 20) t),
    'by_employee', (select coalesce(jsonb_agg(t order by t.revenue desc), '[]') from (
        select e.full_name, e.color, count(*) count, sum(s.total) revenue
          from sales s join employees e on e.id = s.employee_id
         where s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to group by e.full_name, e.color) t),
    'riyad_fees', (select coalesce(sum(i.total), 0) from sale_items i join sales s on s.id = i.sale_id join services sv on sv.id = i.service_id
                    where sv.system_key = 'riyad_fee' and s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to),
    'shifts', (select jsonb_build_object('count', count(*), 'difference', coalesce(sum(difference), 0))
                 from shifts where status = 'closed' and closed_at >= p_from and closed_at < p_to)
  );

  if v_profit then
    select coalesce(sum(amount), 0) into v_exp from expenses where deleted_at is null and spent_on >= (p_from at time zone 'Africa/Casablanca')::date and spent_on < (p_to at time zone 'Africa/Casablanca')::date;
    select coalesce(sum(net + advances), 0) into v_sal from payroll_runs where paid_at >= p_from and paid_at < p_to;
    select coalesce(sum(amount), 0) into v_comm from riyad_ledger where type = 'commission' and created_at >= p_from and created_at < p_to;
    v_res := v_res || jsonb_build_object(
      'cogs', v_cogs,
      'gross_profit', v_revenue - v_refunds - v_cogs,
      'expenses', v_exp,
      'salaries', v_sal,
      'riyad_commissions', v_comm,
      'net_profit', v_revenue - v_refunds - v_cogs - v_exp - v_sal + v_comm,
      'expenses_by_category', (select coalesce(jsonb_agg(t order by t.amount desc), '[]') from (
          select coalesce(c.name_ar, 'أخرى') name_ar, coalesce(c.name_fr, 'Autres') name_fr, coalesce(c.color, '#475569') color, sum(x.amount) amount
            from expenses x left join expense_categories c on c.id = x.category_id
           where x.deleted_at is null and x.spent_on >= (p_from at time zone 'Africa/Casablanca')::date and x.spent_on < (p_to at time zone 'Africa/Casablanca')::date
           group by 1, 2, 3) t));
  end if;

  return v_res || jsonb_build_object(
    'debts_total', (select coalesce(sum(amount), 0) from customer_ledger),
    'suppliers_total', (select coalesce(sum(amount), 0) from supplier_ledger),
    'riyad_balance', case when public.has_perm('riyad.view_balance') then public.riyad_balance() end);
end $$;

-- Dashboard summary v2: adds debts, Riyad and live drawer
create or replace function public.dashboard_extras()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'debts_total', (select coalesce(sum(amount), 0) from customer_ledger),
    'debtors', (select count(*) from (select customer_id from customer_ledger group by 1 having sum(amount) > 0) t),
    'suppliers_total', case when public.has_perm('purchases.manage') then (select coalesce(sum(amount), 0) from supplier_ledger) end,
    'riyad_balance', case when public.has_perm('riyad.view_balance') then public.riyad_balance() end,
    'riyad_low', (select coalesce((value->>'low_balance_alert')::bigint, 200000) from settings where key = 'riyad'),
    'open_shifts', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'employee_name', e.full_name, 'color', e.color,
        'opened_at', s.opened_at, 'device_name', d.name,
        'drawer', case when public.has_perm('cash.view_expected') then (public.shift_totals(s.id)->>'expected_before_riyad')::bigint end)), '[]')
      from shifts s join employees e on e.id = s.employee_id left join devices d on d.id = s.device_id where s.status = 'open'),
    'unread', (select count(*) from notifications where read_at is null)
  )
  where public.is_staff()
$$;
