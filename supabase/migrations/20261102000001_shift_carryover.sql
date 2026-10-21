-- =====================================================================
-- Shift hand-over with two cash places and Riyad carried over.
--  · Drawer (الدرج) always starts with the fixed float (settings.cash.opening_float, 1000 DH)
--  · Safe (الخزنة) holds the rest; its amount is carried from the last close
--  · Riyad balance is carried from the last close
-- At opening the employee sees the three amounts, confirms or corrects them
-- with a reason. At closing she counts drawer + safe ONCE (total); the system
-- tells her to leave the float in the drawer and put the rest in the safe.
-- A Riyad correction waits for the owner: once approved it is recorded in
-- the Riyad ledger (as a recharge when the reason is "owner recharge").
-- =====================================================================

alter table public.shifts
  add column opening_safe  bigint not null default 0,
  add column opening_riyad bigint,
  add column closing_drawer bigint,
  add column closing_safe   bigint;

alter table public.riyad_ledger add column correction_id uuid;

create table public.shift_corrections (
  id          uuid primary key default gen_random_uuid(),
  shift_id    uuid not null references public.shifts(id) on delete cascade,
  kind        text not null check (kind in ('cash', 'riyad')),
  expected    bigint not null,
  actual      bigint not null,
  reason      text not null check (reason in ('previous_count', 'owner_withdrawal', 'owner_recharge', 'missing_operation', 'other')),
  note        text,
  status      text not null default 'noted' check (status in ('noted', 'pending', 'approved', 'rejected')),
  employee_id uuid references public.employees(id),
  decided_by  uuid references public.employees(id),
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.shift_corrections enable row level security;
create policy shift_corrections_read on public.shift_corrections for select
  using (employee_id = public.current_employee_id() or public.has_perm('reports.shifts') or public.has_perm('riyad.manage'));

-- Employees see the expected amount from now on (owner's choice)
update public.settings set value = value || '{"blind_count": false}'::jsonb where key = 'cash';

-- What the next shift should find
create or replace function public.shift_carryover(p_device uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_last shifts;
  v_float bigint := coalesce((select (value->>'opening_float')::bigint from settings where key = 'cash'), 100000);
  v_safe bigint;
  v_riyad bigint;
begin
  select * into v_last from shifts where device_id = p_device and status = 'closed' order by closed_at desc limit 1;
  if v_last.id is null then
    v_safe := 0;
  else
    v_safe := coalesce(v_last.closing_safe, greatest(coalesce(v_last.counted_cash, 0) - v_last.handed_over - v_float, 0));
  end if;
  -- Riyad: what was reported at the last close (any shift, the platform is shared)
  -- plus what the owner recorded since (recharges, adjustments…)
  select * into v_last from shifts where status = 'closed' and riyad_balance_reported is not null order by closed_at desc limit 1;
  if v_last.id is null then
    v_riyad := public.riyad_balance();
  else
    v_riyad := v_last.riyad_balance_reported
             + coalesce((select sum(effect) from riyad_ledger where created_at > v_last.closed_at and shift_id is distinct from v_last.id and correction_id is null), 0);
  end if;
  return jsonb_build_object('drawer', v_float, 'safe', v_safe, 'riyad', v_riyad, 'float', v_float,
                            'last_closed_at', (select max(closed_at) from shifts where device_id = p_device and status = 'closed'),
                            'last_employee', (select e.full_name from shifts s join employees e on e.id = s.employee_id
                                               where s.device_id = p_device and s.status = 'closed' order by s.closed_at desc limit 1));
end $$;

-- Totals: expected cash is drawer + safe together
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
    'opening_drawer', s.opening_float, 'opening_safe', s.opening_safe, 'opening_riyad', s.opening_riyad,
    'expected_before_riyad', s.opening_float + s.opening_safe + a.cash + coalesce((select sum(amt) from mv), 0)
  )
  from s, sales_agg a, riyad_fees f
$$;

create or replace function public.shift_status(p_device uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_s shifts;
  v_cash jsonb;
  v_blind boolean;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  select value into v_cash from settings where key = 'cash';
  v_blind := coalesce((v_cash->>'blind_count')::boolean, false);
  select * into v_s from shifts where device_id = p_device and status = 'open';
  if found then
    return jsonb_build_object(
      'open', true, 'shift', to_jsonb(v_s) - 'expected_cash' - 'difference',
      'employee_name', (select full_name from employees where id = v_s.employee_id),
      'mine', v_s.employee_id = public.current_employee_id(),
      'blind', v_blind and not public.has_perm('cash.view_expected'),
      'float', coalesce((v_cash->>'opening_float')::bigint, 100000),
      'totals', case when v_blind and not public.has_perm('cash.view_expected')
                     then public.shift_totals(v_s.id) - 'expected_before_riyad'
                     else public.shift_totals(v_s.id) end);
  end if;
  return jsonb_build_object('open', false, 'carry', public.shift_carryover(p_device),
    'suggested_float', coalesce((v_cash->>'opening_float')::bigint, 100000),
    'default_float', coalesce((v_cash->>'opening_float')::bigint, 100000));
end $$;

-- Open with the amounts found. p_corrections: [{kind:'cash'|'riyad', reason, note}]
create or replace function public.open_shift_checked(p_device uuid, p_drawer bigint, p_safe bigint, p_riyad bigint, p_corrections jsonb default '[]')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_emp uuid := public.current_employee_id();
  c jsonb := public.shift_carryover(p_device);
  v_cash_exp bigint := (c->>'drawer')::bigint + (c->>'safe')::bigint;
  v_riyad_exp bigint := (c->>'riyad')::bigint;
  v_cc jsonb := (select x from jsonb_array_elements(coalesce(p_corrections, '[]')) x where x->>'kind' = 'cash' limit 1);
  v_rc jsonb := (select x from jsonb_array_elements(coalesce(p_corrections, '[]')) x where x->>'kind' = 'riyad' limit 1);
  v_name text;
  v_corr uuid;
begin
  if not public.has_perm('cash.shift') then raise exception 'forbidden'; end if;
  if exists (select 1 from shifts where device_id = p_device and status = 'open') then raise exception 'shift_already_open'; end if;
  if p_drawer < 0 or p_safe < 0 then raise exception 'invalid_amount'; end if;
  if p_drawer + p_safe <> v_cash_exp and coalesce(v_cc->>'reason', '') = '' then raise exception 'reason_required'; end if;
  if p_riyad is not null and p_riyad <> v_riyad_exp and coalesce(v_rc->>'reason', '') = '' then raise exception 'reason_required'; end if;

  insert into shifts (device_id, employee_id, opening_float, opening_safe, opening_riyad)
  values (p_device, v_emp, p_drawer, p_safe, coalesce(p_riyad, v_riyad_exp))
  returning id into v_id;
  select full_name into v_name from employees where id = v_emp;

  if p_drawer + p_safe <> v_cash_exp then
    insert into shift_corrections (shift_id, kind, expected, actual, reason, note, status, employee_id)
    values (v_id, 'cash', v_cash_exp, p_drawer + p_safe, v_cc->>'reason', nullif(trim(v_cc->>'note'), ''), 'noted', v_emp);
    perform public.notify('opening_cash_difference', 'danger', 'فرق في النقود عند استلام الوردية: ' || v_name,
      'Écart de caisse à l’ouverture : ' || v_name,
      'المتوقع ' || round(v_cash_exp / 100.0, 2) || ' · الموجود ' || round((p_drawer + p_safe) / 100.0, 2) || ' DH' || coalesce(' · ' || nullif(trim(v_cc->>'note'), ''), ''), '/shifts');
  end if;
  if p_riyad is not null and p_riyad <> v_riyad_exp then
    insert into shift_corrections (shift_id, kind, expected, actual, reason, note, status, employee_id)
    values (v_id, 'riyad', v_riyad_exp, p_riyad, v_rc->>'reason', nullif(trim(v_rc->>'note'), ''), 'pending', v_emp)
    returning id into v_corr;
    perform public.notify('riyad_correction', 'warning',
      case when v_rc->>'reason' = 'owner_recharge' then 'شحن رياض بانتظار تأكيدك: ' else 'تصحيح رصيد رياض بانتظار تأكيدك: ' end
        || round((p_riyad - v_riyad_exp) / 100.0, 2) || ' DH',
      'Correction Riyad à valider', v_name || coalesce(' · ' || nullif(trim(v_rc->>'note'), ''), ''), '/riyad');
  end if;
  perform public.log_activity('custom', 'shifts', v_id::text, v_name,
    jsonb_build_object('opened', true, 'drawer', p_drawer, 'safe', p_safe, 'riyad', p_riyad));
  return public.shift_status(p_device);
end $$;

-- Owner decides on a Riyad correction; approval writes it to the Riyad ledger
create or replace function public.decide_riyad_correction(p_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_c shift_corrections;
begin
  if not public.has_perm('riyad.manage') then raise exception 'forbidden'; end if;
  select * into v_c from shift_corrections where id = p_id and kind = 'riyad' and status = 'pending' for update;
  if not found then raise exception 'not_found'; end if;
  if p_approve then
    insert into riyad_ledger (type, amount, effect, note, employee_id, correction_id)
    values (case when v_c.reason = 'owner_recharge' and v_c.actual > v_c.expected then 'recharge' else 'adjustment' end,
            abs(v_c.actual - v_c.expected), v_c.actual - v_c.expected,
            case when v_c.reason = 'owner_recharge' then 'شحن الرصيد (أكدته عند استلام الوردية)' else 'تصحيح عند استلام الوردية' end
              || coalesce(' — ' || v_c.note, ''),
            public.current_employee_id(), v_c.id);
  end if;
  update shift_corrections set status = case when p_approve then 'approved' else 'rejected' end,
    decided_by = public.current_employee_id(), decided_at = now() where id = p_id;
end $$;

create or replace function public.riyad_corrections_pending()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'expected', c.expected, 'actual', c.actual, 'reason', c.reason, 'note', c.note,
           'created_at', c.created_at, 'employee', e.full_name, 'shift_number', s.number) order by c.created_at), '[]')
    from shift_corrections c join shifts s on s.id = c.shift_id left join employees e on e.id = c.employee_id
   where c.kind = 'riyad' and c.status = 'pending' and public.has_perm('riyad.manage')
$$;

-- Close: one count for drawer + safe; float stays in the drawer, rest goes to the safe
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
  v_float bigint := coalesce((select (value->>'opening_float')::bigint from settings where key = 'cash'), 100000);
  v_left bigint;
  v_drawer bigint;
  v_safe bigint;
begin
  if not public.has_perm('cash.shift') then raise exception 'forbidden'; end if;
  select * into v_s from shifts where id = p_shift for update;
  if not found or v_s.status <> 'open' then raise exception 'shift_not_open'; end if;
  if p_counted is null or p_counted < 0 then raise exception 'counted_required'; end if;
  if coalesce(p_handed_over, 0) > p_counted then raise exception 'handover_exceeds_cash'; end if;

  v_tot := public.shift_totals(p_shift);
  v_expected := (v_tot->>'expected_before_riyad')::bigint + coalesce(p_riyad_in, 0) - coalesce(p_riyad_out, 0);

  if coalesce(p_riyad_in, 0) > 0 then
    insert into riyad_ledger (type, amount, effect, shift_id, employee_id) values ('shift_in', p_riyad_in, -p_riyad_in, p_shift, public.current_employee_id());
  end if;
  if coalesce(p_riyad_out, 0) > 0 then
    insert into riyad_ledger (type, amount, effect, shift_id, employee_id) values ('shift_out', p_riyad_out, p_riyad_out, p_shift, public.current_employee_id());
  end if;
  -- Expected platform balance for THIS shift: what she found at opening, plus the
  -- shift's operations and anything the owner recorded meanwhile (not corrections).
  if v_s.opening_riyad is null then
    v_rexp := public.riyad_balance();
  else
    v_rexp := v_s.opening_riyad
            + coalesce((select sum(effect) from riyad_ledger where shift_id = p_shift), 0)
            + coalesce((select sum(effect) from riyad_ledger where shift_id is null and correction_id is null and created_at >= v_s.opened_at), 0);
  end if;

  v_left := p_counted - coalesce(p_handed_over, 0);
  v_drawer := least(v_float, v_left);
  v_safe := v_left - v_drawer;

  update shifts set
    status = 'closed', closed_at = now(), closed_by = public.current_employee_id(),
    counted_cash = p_counted, expected_cash = v_expected, difference = p_counted - v_expected,
    handed_over = coalesce(p_handed_over, 0), riyad_in = coalesce(p_riyad_in, 0), riyad_out = coalesce(p_riyad_out, 0),
    riyad_balance_reported = p_riyad_balance, riyad_balance_expected = v_rexp, notes = p_notes,
    closing_drawer = v_drawer, closing_safe = v_safe
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
  if coalesce(p_riyad_balance, v_rexp) < (select coalesce((value->>'low_balance_alert')::bigint, 200000) from settings where key = 'riyad') then
    perform public.notify('riyad_low', 'warning', 'رصيد رياض منخفض', 'Solde Riyad bas', round(coalesce(p_riyad_balance, v_rexp) / 100.0, 2)::text || ' DH', '/riyad');
  end if;

  perform public.log_activity('custom', 'shifts', p_shift::text, v_emp,
    jsonb_build_object('closed', true, 'counted', p_counted, 'expected', v_expected, 'difference', p_counted - v_expected, 'drawer', v_drawer, 'safe', v_safe));
  return jsonb_build_object('expected', v_expected, 'counted', p_counted, 'difference', p_counted - v_expected,
                            'totals', v_tot, 'riyad_expected', v_rexp, 'riyad_reported', p_riyad_balance,
                            'drawer', v_drawer, 'safe', v_safe, 'handed_over', coalesce(p_handed_over, 0), 'float', v_float);
end $$;

-- Current safe amount (last close of each device, or opening of an open shift)
create or replace function public.safe_balance()
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(x), 0)::bigint from (
    select distinct on (device_id) case when status = 'open' then opening_safe else coalesce(closing_safe, 0) end x
      from shifts where device_id is not null order by device_id, opened_at desc) t
  where public.has_perm('reports.shifts')
$$;
