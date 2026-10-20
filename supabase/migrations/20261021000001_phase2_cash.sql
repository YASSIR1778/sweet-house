-- =====================================================================
-- Sweet House — Phase 2: shifts, cash movements, Riyad, customer debts,
-- refunds. Every cash effect outside a sale is a signed cash_movement so
-- the expected drawer amount is always auditable.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Shifts
-- ---------------------------------------------------------------------
create table public.shifts (
  id                     uuid primary key default gen_random_uuid(),
  number                 bigint generated always as identity,
  device_id              uuid references public.devices(id),
  employee_id            uuid not null references public.employees(id),
  status                 text not null default 'open' check (status in ('open', 'closed')),
  opened_at              timestamptz not null default now(),
  opening_float          bigint not null default 0,
  closed_at              timestamptz,
  closed_by              uuid references public.employees(id),
  counted_cash           bigint,
  expected_cash          bigint,
  difference             bigint,
  handed_over            bigint not null default 0,   -- cash taken out at close (to the owner / bank)
  riyad_in               bigint not null default 0,   -- cash received for Riyad operations
  riyad_out              bigint not null default 0,   -- cash paid out for Riyad operations
  riyad_balance_reported bigint,
  riyad_balance_expected bigint,
  notes                  text
);
create unique index shifts_one_open_per_device on public.shifts (device_id) where status = 'open';
create index shifts_opened_idx on public.shifts (opened_at desc);

alter table public.sales add constraint sales_shift_fk foreign key (shift_id) references public.shifts(id);
create index sales_shift_idx on public.sales (shift_id);

-- ---------------------------------------------------------------------
-- Cash movements (signed: + into the drawer, − out of the drawer)
-- ---------------------------------------------------------------------
create table public.cash_movements (
  id          uuid primary key default gen_random_uuid(),
  shift_id    uuid references public.shifts(id),
  type        text not null check (type in ('expense', 'owner_withdrawal', 'owner_deposit', 'debt_payment',
                                            'riyad_credit', 'refund', 'supplier_payment', 'salary_advance', 'adjustment')),
  amount      bigint not null,  -- signed
  ref_id      uuid,
  customer_id uuid references public.customers(id),
  note        text,
  employee_id uuid references public.employees(id),
  created_at  timestamptz not null default now()
);
create index cash_movements_shift_idx on public.cash_movements (shift_id);

-- ---------------------------------------------------------------------
-- Customer ledger (debt). + charge increases debt, − payment reduces it
-- ---------------------------------------------------------------------
create table public.customer_ledger (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  type        text not null check (type in ('sale_credit', 'riyad_credit', 'manual_charge', 'payment', 'adjustment')),
  amount      bigint not null,  -- signed: + debt, − payment
  method      text check (method in ('cash', 'card', 'transfer')),
  sale_id     uuid references public.sales(id),
  shift_id    uuid references public.shifts(id),
  note        text,
  employee_id uuid references public.employees(id),
  created_at  timestamptz not null default now()
);
create index customer_ledger_customer_idx on public.customer_ledger (customer_id, created_at desc);

create or replace view public.customer_balances with (security_invoker = true) as
  select c.id, c.full_name, c.phone, c.company_name,
         coalesce(sum(l.amount), 0)::bigint as balance,
         max(l.created_at) filter (where l.amount > 0) as last_charge_at,
         max(l.created_at) filter (where l.amount < 0) as last_payment_at
    from public.customers c
    left join public.customer_ledger l on l.customer_id = c.id
   where c.deleted_at is null
   group by c.id;

-- ---------------------------------------------------------------------
-- Riyad (Chaabi Cash) ledger. Platform balance = sum(effect).
-- ---------------------------------------------------------------------
create table public.riyad_ledger (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('opening', 'recharge', 'shift_in', 'shift_out', 'commission', 'adjustment', 'withdrawal')),
  amount      bigint not null,          -- positive amount as entered
  effect      bigint not null default 0, -- signed effect on the platform balance
  shift_id    uuid references public.shifts(id),
  period      date,                     -- month for commissions
  note        text,
  employee_id uuid references public.employees(id),
  created_at  timestamptz not null default now()
);
create index riyad_ledger_created_idx on public.riyad_ledger (created_at desc);

create or replace function public.riyad_balance()
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(effect), 0)::bigint from riyad_ledger
$$;

-- ---------------------------------------------------------------------
-- Refunds
-- ---------------------------------------------------------------------
create table public.refunds (
  id          uuid primary key default gen_random_uuid(),
  sale_id     uuid not null references public.sales(id),
  shift_id    uuid references public.shifts(id),
  total       bigint not null,
  method      text not null check (method in ('cash', 'card', 'credit')),
  reason      text not null,
  employee_id uuid not null references public.employees(id),
  created_at  timestamptz not null default now()
);
create table public.refund_items (
  id           uuid primary key default gen_random_uuid(),
  refund_id    uuid not null references public.refunds(id) on delete cascade,
  sale_item_id uuid not null references public.sale_items(id),
  qty          numeric(12,3) not null check (qty > 0),
  amount       bigint not null
);

-- ---------------------------------------------------------------------
-- Notifications for the owner / managers
-- ---------------------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  type       text not null,
  severity   text not null default 'info' check (severity in ('info', 'success', 'warning', 'danger')),
  title_ar   text not null,
  title_fr   text not null,
  body       text,
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_created_idx on public.notifications (created_at desc);

create or replace function public.notify(p_type text, p_severity text, p_ar text, p_fr text, p_body text default null, p_link text default null)
returns void language sql security definer set search_path = public as $$
  insert into notifications (type, severity, title_ar, title_fr, body, link) values (p_type, p_severity, p_ar, p_fr, p_body, p_link);
$$;
revoke execute on function public.notify(text, text, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.shifts          enable row level security;
alter table public.cash_movements  enable row level security;
alter table public.customer_ledger enable row level security;
alter table public.riyad_ledger    enable row level security;
alter table public.refunds         enable row level security;
alter table public.refund_items    enable row level security;
alter table public.notifications   enable row level security;

create policy shifts_read on public.shifts for select
  using (employee_id = public.current_employee_id() or public.has_perm('reports.shifts'));
create policy cash_movements_read on public.cash_movements for select
  using (employee_id = public.current_employee_id() or public.has_perm('reports.shifts'));
create policy customer_ledger_read on public.customer_ledger for select using (public.is_staff());
create policy riyad_read on public.riyad_ledger for select using (public.has_perm('riyad.view_balance') or public.has_perm('riyad.manage'));
create policy refunds_read on public.refunds for select using (public.is_staff());
create policy refund_items_read on public.refund_items for select using (public.is_staff());
create policy notifications_read on public.notifications for select using (public.has_perm('reports.sales') or public.is_owner());
create policy notifications_update on public.notifications for update using (public.has_perm('reports.sales') or public.is_owner());

revoke insert, update, delete on public.shifts, public.cash_movements, public.customer_ledger,
  public.riyad_ledger, public.refunds, public.refund_items from anon, authenticated;
grant select on public.customer_balances to authenticated;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.current_shift(p_device uuid)
returns shifts language sql stable security definer set search_path = public as $$
  select * from shifts where device_id = p_device and status = 'open' limit 1
$$;

create or replace function public.require_open_shift(p_device uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid;
begin
  select id into v_id from shifts where device_id = p_device and status = 'open';
  if v_id is null then raise exception 'no_open_shift'; end if;
  return v_id;
end $$;

create or replace function public.shift_totals(p_shift uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with s as (select * from shifts where id = p_shift),
  sales_agg as (
    select count(*) filter (where status = 'completed') cnt,
           coalesce(sum(total) filter (where status = 'completed'), 0) total,
           coalesce(sum(paid_cash) filter (where status = 'completed'), 0) cash,
           coalesce(sum(paid_card) filter (where status = 'completed'), 0) card,
           coalesce(sum(paid_credit) filter (where status = 'completed'), 0) credit,
           coalesce(sum(discount_total) filter (where status = 'completed'), 0) discounts,
           count(*) filter (where status = 'voided') voided
      from sales where shift_id = p_shift),
  riyad_fees as (
    select coalesce(sum(i.total), 0) fees
      from sale_items i join sales x on x.id = i.sale_id join services sv on sv.id = i.service_id
     where x.shift_id = p_shift and x.status = 'completed' and sv.system_key = 'riyad_fee'),
  mv as (
    select type, coalesce(sum(amount), 0) amt, count(*) n from cash_movements where shift_id = p_shift group by type)
  select jsonb_build_object(
    'sales_count', a.cnt, 'sales_total', a.total, 'sales_cash', a.cash, 'sales_card', a.card,
    'sales_credit', a.credit, 'discounts', a.discounts, 'voided', a.voided, 'riyad_fees', f.fees,
    'movements', coalesce((select jsonb_object_agg(type, jsonb_build_object('amount', amt, 'count', n)) from mv), '{}'),
    'movements_total', coalesce((select sum(amt) from mv), 0),
    'expected_before_riyad', s.opening_float + a.cash + coalesce((select sum(amt) from mv), 0)
  )
  from s, sales_agg a, riyad_fees f
$$;

-- ---------------------------------------------------------------------
-- Open / close shift
-- ---------------------------------------------------------------------
create or replace function public.shift_status(p_device uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_s shifts;
  v_last shifts;
  v_cash jsonb;
  v_blind boolean;
  v_float bigint;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  select value into v_cash from settings where key = 'cash';
  v_blind := coalesce((v_cash->>'blind_count')::boolean, true);
  v_float := coalesce((v_cash->>'opening_float')::bigint, 100000);
  select * into v_s from shifts where device_id = p_device and status = 'open';
  if found then
    return jsonb_build_object(
      'open', true, 'shift', to_jsonb(v_s) - 'expected_cash' - 'difference',
      'employee_name', (select full_name from employees where id = v_s.employee_id),
      'mine', v_s.employee_id = public.current_employee_id(),
      'blind', v_blind and not public.has_perm('cash.view_expected'),
      'totals', case when v_blind and not public.has_perm('cash.view_expected')
                     then public.shift_totals(v_s.id) - 'expected_before_riyad'
                     else public.shift_totals(v_s.id) end);
  end if;
  select * into v_last from shifts where device_id = p_device and status = 'closed' order by closed_at desc limit 1;
  return jsonb_build_object(
    'open', false,
    'suggested_float', case when v_last.id is null then v_float else coalesce(v_last.counted_cash, 0) - v_last.handed_over end,
    'default_float', v_float,
    'last_closed_at', v_last.closed_at);
end $$;

create or replace function public.open_shift(p_device uuid, p_float bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.has_perm('cash.shift') then raise exception 'forbidden'; end if;
  if exists (select 1 from shifts where device_id = p_device and status = 'open') then raise exception 'shift_already_open'; end if;
  insert into shifts (device_id, employee_id, opening_float) values (p_device, public.current_employee_id(), greatest(p_float, 0))
  returning id into v_id;
  perform public.log_activity('custom', 'shifts', v_id::text, null, jsonb_build_object('opened', true, 'float', p_float));
  return public.shift_status(p_device);
end $$;

create or replace function public.close_shift(p_shift uuid, p_counted bigint, p_riyad_in bigint, p_riyad_out bigint,
                                              p_riyad_balance bigint, p_handed_over bigint, p_notes text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_s shifts;
  v_tot jsonb;
  v_expected bigint;
  v_rexp bigint;
  v_alert bigint;
  v_emp text;
begin
  if not public.has_perm('cash.shift') then raise exception 'forbidden'; end if;
  select * into v_s from shifts where id = p_shift for update;
  if not found or v_s.status <> 'open' then raise exception 'shift_not_open'; end if;
  if p_counted is null or p_counted < 0 then raise exception 'counted_required'; end if;
  if coalesce(p_handed_over, 0) > p_counted then raise exception 'handover_exceeds_cash'; end if;

  v_tot := public.shift_totals(p_shift);
  v_expected := (v_tot->>'expected_before_riyad')::bigint + coalesce(p_riyad_in, 0) - coalesce(p_riyad_out, 0);

  -- Riyad platform: cash in for Riyad means the platform balance went down, and vice versa.
  if coalesce(p_riyad_in, 0) > 0 then
    insert into riyad_ledger (type, amount, effect, shift_id, employee_id) values ('shift_in', p_riyad_in, -p_riyad_in, p_shift, public.current_employee_id());
  end if;
  if coalesce(p_riyad_out, 0) > 0 then
    insert into riyad_ledger (type, amount, effect, shift_id, employee_id) values ('shift_out', p_riyad_out, p_riyad_out, p_shift, public.current_employee_id());
  end if;
  v_rexp := public.riyad_balance();

  update shifts set
    status = 'closed', closed_at = now(), closed_by = public.current_employee_id(),
    counted_cash = p_counted, expected_cash = v_expected, difference = p_counted - v_expected,
    handed_over = coalesce(p_handed_over, 0), riyad_in = coalesce(p_riyad_in, 0), riyad_out = coalesce(p_riyad_out, 0),
    riyad_balance_reported = p_riyad_balance, riyad_balance_expected = v_rexp, notes = p_notes
  where id = p_shift;

  select full_name into v_emp from employees where id = v_s.employee_id;
  select coalesce((value->>'diff_alert')::bigint, 2000) into v_alert from settings where key = 'cash';
  if abs(p_counted - v_expected) > v_alert then
    perform public.notify('cash_difference', 'danger', 'فرق في الصندوق: ' || v_emp, 'Écart de caisse : ' || v_emp,
      round((p_counted - v_expected) / 100.0, 2)::text || ' DH', '/shifts');
  end if;
  if p_riyad_balance is not null and p_riyad_balance <> v_rexp then
    perform public.notify('riyad_difference', 'warning', 'فرق في رصيد رياض', 'Écart de solde Riyad',
      round((p_riyad_balance - v_rexp) / 100.0, 2)::text || ' DH', '/riyad');
  end if;
  if v_rexp < (select coalesce((value->>'low_balance_alert')::bigint, 200000) from settings where key = 'riyad') then
    perform public.notify('riyad_low', 'warning', 'رصيد رياض منخفض', 'Solde Riyad bas', round(v_rexp / 100.0, 2)::text || ' DH', '/riyad');
  end if;

  perform public.log_activity('custom', 'shifts', p_shift::text, v_emp,
    jsonb_build_object('closed', true, 'counted', p_counted, 'expected', v_expected, 'difference', p_counted - v_expected));
  return jsonb_build_object('expected', v_expected, 'counted', p_counted, 'difference', p_counted - v_expected,
                            'totals', v_tot, 'riyad_expected', v_rexp, 'riyad_reported', p_riyad_balance);
end $$;

-- ---------------------------------------------------------------------
-- Cash movement from the POS (expense, owner withdrawal/deposit)
-- ---------------------------------------------------------------------
create or replace function public.add_cash_movement(p_device uuid, p_type text, p_amount bigint, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_shift uuid := public.require_open_shift(p_device);
  v_id uuid;
  v_signed bigint;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if p_type = 'expense' and not public.has_perm('cash.expense') then raise exception 'forbidden'; end if;
  if p_type in ('owner_withdrawal', 'owner_deposit') and not public.has_perm('cash.owner_withdrawal') then raise exception 'forbidden'; end if;
  if p_type not in ('expense', 'owner_withdrawal', 'owner_deposit') then raise exception 'invalid_type'; end if;
  v_signed := case when p_type = 'owner_deposit' then p_amount else -p_amount end;
  insert into cash_movements (shift_id, type, amount, note, employee_id)
  values (v_shift, p_type, v_signed, p_note, public.current_employee_id()) returning id into v_id;
  perform public.log_activity('custom', 'cash', v_id::text, p_type, jsonb_build_object('amount', v_signed, 'note', p_note));
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Riyad on credit: the employee gave Riyad service to a customer who
-- did not pay → customer debt, and the drawer is short by that amount.
-- ---------------------------------------------------------------------
create or replace function public.riyad_credit(p_device uuid, p_customer uuid, p_amount bigint, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_shift uuid := public.require_open_shift(p_device);
  v_id uuid;
begin
  if not public.has_perm('riyad.credit') then raise exception 'forbidden'; end if;
  if p_customer is null then raise exception 'customer_required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  insert into cash_movements (shift_id, type, amount, customer_id, note, employee_id)
  values (v_shift, 'riyad_credit', -p_amount, p_customer, p_note, public.current_employee_id()) returning id into v_id;
  insert into customer_ledger (customer_id, type, amount, shift_id, note, employee_id)
  values (p_customer, 'riyad_credit', p_amount, v_shift, p_note, public.current_employee_id());
  perform public.log_activity('custom', 'riyad', v_id::text, (select full_name from customers where id = p_customer),
    jsonb_build_object('credit', p_amount, 'note', p_note));
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Debt payment by a customer (cash goes to the drawer, card does not)
-- ---------------------------------------------------------------------
create or replace function public.pay_debt(p_device uuid, p_customer uuid, p_amount bigint, p_method text, p_note text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_shift uuid;
begin
  if not public.has_perm('debts.collect') then raise exception 'forbidden'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if p_method not in ('cash', 'card', 'transfer') then raise exception 'invalid_method'; end if;
  if p_method = 'cash' then
    v_shift := public.require_open_shift(p_device);
    insert into cash_movements (shift_id, type, amount, customer_id, note, employee_id)
    values (v_shift, 'debt_payment', p_amount, p_customer, p_note, public.current_employee_id());
  else
    select id into v_shift from shifts where device_id = p_device and status = 'open';
  end if;
  insert into customer_ledger (customer_id, type, amount, method, shift_id, note, employee_id)
  values (p_customer, 'payment', -p_amount, p_method, v_shift, p_note, public.current_employee_id());
  perform public.log_activity('custom', 'debts', p_customer::text, (select full_name from customers where id = p_customer),
    jsonb_build_object('payment', p_amount, 'method', p_method));
  return (select coalesce(sum(amount), 0) from customer_ledger where customer_id = p_customer);
end $$;

-- Manual debt adjustment from the dashboard (e.g. opening balance of an old customer)
create or replace function public.adjust_debt(p_customer uuid, p_amount bigint, p_note text)
returns bigint language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('customers.manage') then raise exception 'forbidden'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'reason_required'; end if;
  insert into customer_ledger (customer_id, type, amount, note, employee_id)
  values (p_customer, case when p_amount > 0 then 'manual_charge' else 'adjustment' end, p_amount, p_note, public.current_employee_id());
  perform public.log_activity('custom', 'debts', p_customer::text, (select full_name from customers where id = p_customer),
    jsonb_build_object('adjust', p_amount, 'note', p_note));
  return (select coalesce(sum(amount), 0) from customer_ledger where customer_id = p_customer);
end $$;

create or replace function public.customer_statement(p_customer uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'customer', (select to_jsonb(c) from customers c where c.id = p_customer),
    'balance', (select coalesce(sum(amount), 0) from customer_ledger where customer_id = p_customer),
    'entries', coalesce((select jsonb_agg(jsonb_build_object(
        'id', l.id, 'type', l.type, 'amount', l.amount, 'method', l.method, 'note', l.note, 'created_at', l.created_at,
        'sale_number', s.number, 'employee_name', e.full_name) order by l.created_at desc)
      from customer_ledger l left join sales s on s.id = l.sale_id left join employees e on e.id = l.employee_id
      where l.customer_id = p_customer), '[]'))
  where public.is_staff()
$$;

-- ---------------------------------------------------------------------
-- Riyad management (dashboard)
-- ---------------------------------------------------------------------
create or replace function public.riyad_entry(p_type text, p_amount bigint, p_note text, p_period date default null, p_affects boolean default true)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_effect bigint;
begin
  if not public.has_perm('riyad.manage') then raise exception 'forbidden'; end if;
  if p_type not in ('opening', 'recharge', 'commission', 'adjustment', 'withdrawal') then raise exception 'invalid_type'; end if;
  if p_type <> 'adjustment' and (p_amount is null or p_amount <= 0) then raise exception 'invalid_amount'; end if;
  v_effect := case p_type
    when 'opening' then p_amount
    when 'recharge' then p_amount
    when 'withdrawal' then -p_amount
    when 'adjustment' then p_amount
    when 'commission' then case when p_affects then p_amount else 0 end end;
  insert into riyad_ledger (type, amount, effect, period, note, employee_id)
  values (p_type, abs(p_amount), v_effect, p_period, p_note, public.current_employee_id());
  perform public.log_activity('custom', 'riyad', null, p_type, jsonb_build_object('amount', p_amount, 'note', p_note));
  return public.riyad_balance();
end $$;

create or replace function public.riyad_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.has_perm('riyad.view_balance') or public.has_perm('riyad.manage')) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'balance', public.riyad_balance(),
    'low_alert', (select coalesce((value->>'low_balance_alert')::bigint, 200000) from settings where key = 'riyad'),
    'last_report', (select jsonb_build_object('reported', riyad_balance_reported, 'expected', riyad_balance_expected, 'at', closed_at)
                      from shifts where riyad_balance_reported is not null order by closed_at desc limit 1),
    'month', (select jsonb_build_object(
        'in', coalesce(sum(amount) filter (where type = 'shift_in'), 0),
        'out', coalesce(sum(amount) filter (where type = 'shift_out'), 0),
        'recharges', coalesce(sum(amount) filter (where type = 'recharge'), 0),
        'commissions', coalesce(sum(amount) filter (where type = 'commission'), 0))
      from riyad_ledger where created_at >= date_trunc('month', now())),
    'fees_month', (select coalesce(sum(i.total), 0) from sale_items i join sales s on s.id = i.sale_id join services sv on sv.id = i.service_id
                    where sv.system_key = 'riyad_fee' and s.status = 'completed' and s.created_at >= date_trunc('month', now())),
    'credit_open', (select coalesce(sum(amount), 0) from customer_ledger where type = 'riyad_credit'),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'balance', b) order by d), '[]') from (
        select d::date d, (select coalesce(sum(effect), 0) from riyad_ledger where created_at < d + interval '1 day') b
          from generate_series(current_date - 29, current_date, interval '1 day') d) t),
    'entries', (select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]') from (
        select jsonb_build_object('id', l.id, 'type', l.type, 'amount', l.amount, 'effect', l.effect, 'note', l.note,
                                  'period', l.period, 'created_at', l.created_at, 'employee_name', e.full_name) x
          from riyad_ledger l left join employees e on e.id = l.employee_id order by l.created_at desc limit 200) t)
  );
end $$;

-- ---------------------------------------------------------------------
-- Refund (partial or full) of a completed sale
-- p_items = [{sale_item_id, qty}]
-- ---------------------------------------------------------------------
create or replace function public.refund_sale(p_device uuid, p_sale uuid, p_items jsonb, p_method text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_s sales;
  v_it jsonb;
  v_li sale_items;
  v_qty numeric;
  v_done numeric;
  v_amt bigint;
  v_total bigint := 0;
  v_ref uuid := gen_random_uuid();
  v_shift uuid;
begin
  if not public.has_perm('pos.refund') then raise exception 'forbidden'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if p_method not in ('cash', 'card', 'credit') then raise exception 'invalid_method'; end if;
  select * into v_s from sales where id = p_sale;
  if not found or v_s.status <> 'completed' then raise exception 'sale_not_found'; end if;
  if p_method = 'credit' and v_s.customer_id is null then raise exception 'customer_required'; end if;
  select id into v_shift from shifts where device_id = p_device and status = 'open';
  if p_method = 'cash' and v_shift is null then raise exception 'no_open_shift'; end if;

  insert into refunds (id, sale_id, shift_id, total, method, reason, employee_id)
  values (v_ref, p_sale, v_shift, 0, p_method, p_reason, public.current_employee_id());

  for v_it in select * from jsonb_array_elements(p_items) loop
    select * into v_li from sale_items where id = (v_it->>'sale_item_id')::uuid and sale_id = p_sale;
    if not found then raise exception 'item_not_found'; end if;
    v_qty := (v_it->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then continue; end if;
    select coalesce(sum(ri.qty), 0) into v_done from refund_items ri where ri.sale_item_id = v_li.id;
    if v_qty > v_li.qty - v_done then raise exception 'refund_exceeds_sold'; end if;
    v_amt := round(v_li.total * v_qty / v_li.qty)::bigint;
    -- order-level discount is shared proportionally
    if v_s.total < (select sum(total) from sale_items where sale_id = p_sale) then
      v_amt := round(v_amt * v_s.total::numeric / (select sum(total) from sale_items where sale_id = p_sale))::bigint;
    end if;
    insert into refund_items (refund_id, sale_item_id, qty, amount) values (v_ref, v_li.id, v_qty, v_amt);
    v_total := v_total + v_amt;
    if v_li.item_type = 'product' and exists (select 1 from products where id = v_li.product_id and track_stock) then
      insert into stock_movements (variant_id, qty_change, reason, ref_id, employee_id)
      values (v_li.variant_id, v_qty * (v_li.base_qty / v_li.qty), 'refund', v_ref, public.current_employee_id());
    end if;
  end loop;

  if v_total = 0 then raise exception 'nothing_to_refund'; end if;
  update refunds set total = v_total where id = v_ref;

  if p_method = 'cash' then
    insert into cash_movements (shift_id, type, amount, ref_id, customer_id, note, employee_id)
    values (v_shift, 'refund', -v_total, v_ref, v_s.customer_id, p_reason, public.current_employee_id());
  elsif p_method = 'credit' then
    insert into customer_ledger (customer_id, type, amount, sale_id, shift_id, note, employee_id)
    values (v_s.customer_id, 'adjustment', -v_total, p_sale, v_shift, p_reason, public.current_employee_id());
  end if;

  perform public.log_activity('custom', 'sales', p_sale::text, v_s.number,
    jsonb_build_object('refund', v_total, 'method', p_method, 'reason', p_reason));
  return jsonb_build_object('refund_id', v_ref, 'total', v_total);
end $$;

-- ---------------------------------------------------------------------
-- create_sale v2: attaches the open shift and supports credit payments
-- ---------------------------------------------------------------------
create or replace function public.create_sale(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid := public.current_employee_id();
  v_sid uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
  v_device uuid := nullif(p->>'device_id', '')::uuid;
  v_shift uuid;
  v_customer uuid := nullif(p->>'customer_id', '')::uuid;
  v_it jsonb;
  v_ln int := 0;
  v_var product_variants; v_pr products; v_pk product_packs; v_sv services;
  v_qty numeric; v_factor numeric; v_expected bigint; v_unit bigint; v_ldisc bigint; v_ltotal bigint;
  v_name_ar text; v_name_fr text; v_rate numeric; v_cost bigint;
  v_subtotal bigint := 0; v_line_net bigint := 0;
  v_order_disc bigint := greatest(coalesce((p->>'discount')::bigint, 0), 0);
  v_total bigint;
  v_cash bigint := greatest(coalesce((p->'payments'->>'cash')::bigint, 0), 0);
  v_card bigint := greatest(coalesce((p->'payments'->>'card')::bigint, 0), 0);
  v_credit bigint := greatest(coalesce((p->'payments'->>'credit')::bigint, 0), 0);
  v_change bigint := 0;
  v_num text;
  v_tax numeric;
  v_any_disc boolean := v_order_disc > 0;
  v_low record;
begin
  if v_emp is null or not public.has_perm('pos.sell') then raise exception 'forbidden'; end if;
  if exists (select 1 from sales where id = v_sid) then return public.get_sale(v_sid); end if;
  if jsonb_array_length(coalesce(p->'items', '[]')) = 0 then raise exception 'empty_sale'; end if;
  if v_device is not null then
    select id into v_shift from shifts where device_id = v_device and status = 'open';
  end if;

  v_num := public.next_doc_number('receipt');
  insert into sales (id, number, customer_id, employee_id, device_id, shift_id, note)
  values (v_sid, v_num, v_customer, v_emp, v_device, v_shift, p->>'note');

  for v_it in select * from jsonb_array_elements(p->'items') loop
    v_ln := v_ln + 1;
    v_qty := (v_it->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'invalid_qty'; end if;
    v_ldisc := greatest(coalesce((v_it->>'discount')::bigint, 0), 0);
    if v_ldisc > 0 then v_any_disc := true; end if;
    v_pk := null; v_var := null; v_pr := null; v_sv := null;

    if v_it->>'type' = 'product' then
      select * into v_var from product_variants where id = (v_it->>'variant_id')::uuid and deleted_at is null;
      if not found then raise exception 'variant_not_found'; end if;
      select * into v_pr from products where id = v_var.product_id;
      v_factor := 1; v_expected := v_var.price;
      v_name_ar := v_pr.name_ar || coalesce(' - ' || v_var.name_ar, '');
      v_name_fr := v_pr.name_fr || coalesce(' - ' || v_var.name_fr, '');
      if nullif(v_it->>'pack_id', '') is not null then
        select * into v_pk from product_packs
         where id = (v_it->>'pack_id')::uuid and variant_id = v_var.id and deleted_at is null;
        if not found then raise exception 'pack_not_found'; end if;
        v_factor := v_pk.factor; v_expected := v_pk.price;
        v_name_ar := v_name_ar || ' (' || v_pk.name_ar || ')';
        v_name_fr := v_name_fr || ' (' || v_pk.name_fr || ')';
      end if;
      v_rate := v_pr.tax_rate;
      v_cost := round(coalesce((select c.cost from product_costs c where c.variant_id = v_var.id), 0) * v_factor)::bigint;
    elsif v_it->>'type' = 'service' then
      select * into v_sv from services where id = (v_it->>'service_id')::uuid and deleted_at is null and is_active;
      if not found then raise exception 'service_not_found'; end if;
      if v_sv.system_key = 'riyad_fee' and not public.has_perm('riyad.fee') then raise exception 'forbidden'; end if;
      v_factor := 1;
      v_expected := case when v_sv.pricing_mode = 'open' then null else public.service_unit_price(v_sv.id, v_qty) end;
      v_name_ar := v_sv.name_ar; v_name_fr := v_sv.name_fr; v_rate := v_sv.tax_rate; v_cost := 0;
    else
      raise exception 'invalid_item_type';
    end if;

    v_unit := coalesce((v_it->>'unit_price')::bigint, v_expected);
    if v_unit is null or v_unit < 0 then raise exception 'invalid_price'; end if;
    if v_sv.pricing_mode = 'open' and v_unit = 0 then raise exception 'invalid_price'; end if;
    if v_expected is not null and v_unit <> v_expected and not public.has_perm('pos.price_override') then
      raise exception 'price_override_forbidden';
    end if;

    v_ltotal := round(v_unit * v_qty)::bigint - v_ldisc;
    if v_ltotal < 0 then raise exception 'discount_exceeds_line'; end if;
    v_subtotal := v_subtotal + round(coalesce(v_expected, v_unit) * v_qty)::bigint;
    v_line_net := v_line_net + v_ltotal;

    insert into sale_items (sale_id, line_no, item_type, product_id, variant_id, pack_id, service_id,
                            name_ar, name_fr, qty, base_qty, unit_price, original_unit_price, discount,
                            total, tax_rate, unit_cost)
    values (v_sid, v_ln, v_it->>'type', v_pr.id, v_var.id, v_pk.id, v_sv.id,
            v_name_ar, v_name_fr, v_qty, v_qty * v_factor, v_unit, coalesce(v_expected, v_unit), v_ldisc,
            v_ltotal, v_rate, v_cost);

    if v_it->>'type' = 'product' and v_pr.track_stock then
      insert into stock_movements (variant_id, qty_change, reason, ref_id, employee_id)
      values (v_var.id, -(v_qty * v_factor), 'sale', v_sid, v_emp);
    end if;
  end loop;

  if v_order_disc > v_line_net then raise exception 'discount_exceeds_total'; end if;
  v_total := v_line_net - v_order_disc;

  if v_any_disc then
    if not public.has_perm('pos.discount') then raise exception 'discount_forbidden'; end if;
    if v_subtotal > 0 and (v_subtotal - v_total) * 100.0 / v_subtotal > public.my_max_discount() + 0.001 then
      raise exception 'discount_above_limit';
    end if;
  end if;

  if v_credit > 0 then
    if not public.has_perm('pos.credit_sale') then raise exception 'credit_forbidden'; end if;
    if v_customer is null then raise exception 'customer_required'; end if;
  end if;
  if v_card + v_credit > v_total then raise exception 'card_exceeds_total'; end if;
  if v_cash + v_card + v_credit < v_total then raise exception 'insufficient_payment'; end if;
  v_change := v_cash + v_card + v_credit - v_total;

  select coalesce(sum(i.total * i.tax_rate / (100 + i.tax_rate)), 0) into v_tax from sale_items i where i.sale_id = v_sid;
  if v_line_net > 0 then v_tax := v_tax * v_total / v_line_net; end if;

  update sales s set
    subtotal = v_subtotal, discount_total = v_subtotal - v_total, total = v_total,
    tax_total = round(v_tax), cash_received = v_cash, change_given = v_change,
    paid_cash = v_cash - v_change, paid_card = v_card, paid_credit = v_credit
  where s.id = v_sid;

  if v_credit > 0 then
    insert into customer_ledger (customer_id, type, amount, sale_id, shift_id, employee_id)
    values (v_customer, 'sale_credit', v_credit, v_sid, v_shift, v_emp);
  end if;

  -- low stock notifications (once when crossing the threshold)
  for v_low in
    select p.name_ar, p.name_fr, v.stock_qty, p.low_stock_alert, i.base_qty
      from sale_items i join product_variants v on v.id = i.variant_id join products p on p.id = v.product_id
     where i.sale_id = v_sid and p.track_stock and v.stock_qty <= p.low_stock_alert and v.stock_qty + i.base_qty > p.low_stock_alert
  loop
    perform public.notify('low_stock', 'warning', 'مخزون منخفض: ' || v_low.name_ar, 'Stock faible : ' || v_low.name_fr,
      v_low.stock_qty::text, '/products');
  end loop;

  perform public.log_activity('insert', 'sales', v_sid::text, v_num, jsonb_build_object('total', v_total));
  return public.get_sale(v_sid);
end $$;

-- get_sale v2: includes refunds
create or replace function public.get_sale(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(s) || jsonb_build_object(
    'employee_name', e.full_name,
    'customer', case when c.id is null then null
                else jsonb_build_object('id', c.id, 'full_name', c.full_name, 'phone', c.phone) end,
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'line_no', i.line_no, 'item_type', i.item_type, 'name_ar', i.name_ar, 'name_fr', i.name_fr,
        'qty', i.qty, 'unit_price', i.unit_price, 'original_unit_price', i.original_unit_price,
        'discount', i.discount, 'total', i.total, 'tax_rate', i.tax_rate,
        'variant_id', i.variant_id, 'pack_id', i.pack_id, 'service_id', i.service_id,
        'refunded_qty', (select coalesce(sum(ri.qty), 0) from refund_items ri where ri.sale_item_id = i.id)
      ) order by i.line_no), '[]') from sale_items i where i.sale_id = s.id),
    'refunds', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'total', r.total, 'method', r.method,
        'reason', r.reason, 'created_at', r.created_at) order by r.created_at), '[]') from refunds r where r.sale_id = s.id))
  from sales s
  join employees e on e.id = s.employee_id
  left join customers c on c.id = s.customer_id
  where s.id = p_id
    and (s.employee_id = public.current_employee_id()
         or public.has_perm('reports.sales') or public.has_perm('pos.reprint'))
$$;

-- Void now also reverses customer credit and refuses refunded sales
create or replace function public.void_sale(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s sales;
begin
  if not public.has_perm('pos.void') then raise exception 'forbidden'; end if;
  select * into s from sales where id = p_id for update;
  if not found then raise exception 'sale_not_found'; end if;
  if s.status = 'voided' then raise exception 'already_voided'; end if;
  if exists (select 1 from refunds where sale_id = p_id) then raise exception 'sale_has_refunds'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  update sales set status = 'voided', voided_at = now(), voided_by = public.current_employee_id(), void_reason = p_reason
   where id = p_id;
  insert into stock_movements (variant_id, qty_change, reason, ref_id, employee_id)
  select i.variant_id, i.base_qty, 'void', p_id, public.current_employee_id()
    from sale_items i join products pr on pr.id = i.product_id
   where i.sale_id = p_id and i.item_type = 'product' and pr.track_stock;
  if s.paid_credit > 0 then
    insert into customer_ledger (customer_id, type, amount, sale_id, note, employee_id)
    values (s.customer_id, 'adjustment', -s.paid_credit, p_id, 'إلغاء ' || s.number, public.current_employee_id());
  end if;
  perform public.log_activity('custom', 'sales', p_id::text, s.number,
    jsonb_build_object('voided', true, 'reason', p_reason, 'total', s.total));
  return public.get_sale(p_id);
end $$;

-- Shift report for the dashboard
create or replace function public.shift_report(p_shift uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(s) || jsonb_build_object(
    'employee_name', e.full_name, 'closed_by_name', cb.full_name, 'device_name', d.name,
    'totals', public.shift_totals(s.id),
    'movements', coalesce((select jsonb_agg(jsonb_build_object('type', m.type, 'amount', m.amount, 'note', m.note,
        'created_at', m.created_at, 'customer_name', c.full_name) order by m.created_at)
      from cash_movements m left join customers c on c.id = m.customer_id where m.shift_id = s.id), '[]'))
  from shifts s
  join employees e on e.id = s.employee_id
  left join employees cb on cb.id = s.closed_by
  left join devices d on d.id = s.device_id
  where s.id = p_shift and (s.employee_id = public.current_employee_id() or public.has_perm('reports.shifts'))
$$;
