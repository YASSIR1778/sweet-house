-- =====================================================================
-- Shift statement at closing: every account shows where it started, what
-- moved during the shift and what is expected, before the employee types
-- her own numbers (cash counted, Riyad in / out and platform balance, and
-- now the card terminal total). Expected cash and differences are computed
-- exactly as before; they are only shown with their parts.
-- =====================================================================

alter table public.shifts add column if not exists card_terminal bigint; -- total printed by the card terminal at closing (optional)

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
    select type, coalesce(sum(amount), 0) amt, count(*) n from cash_movements where shift_id = p_shift group by type),
  card as (
    select coalesce((select sum(-amount) from customer_ledger where shift_id = p_shift and type = 'payment' and method = 'card'), 0) debts,
           coalesce((select sum(total) from refunds where shift_id = p_shift and method = 'card'), 0) refunds),
  -- Riyad lines the owner recorded since the shift opened (recharge, withdrawal…), and the shift's own lines (written at closing)
  rl as (
    select coalesce(sum(l.effect) filter (where l.shift_id is null and l.correction_id is null), 0) owner_effect,
           count(*) filter (where l.shift_id is null and l.correction_id is null) owner_count,
           coalesce(sum(l.effect) filter (where l.shift_id = s.id), 0) shift_effect
      from s left join riyad_ledger l on l.shift_id = s.id or (l.shift_id is null and l.created_at >= s.opened_at))
  select jsonb_build_object(
    'sales_count', a.cnt, 'sales_total', a.total, 'sales_cash', a.cash, 'sales_card', a.card,
    'sales_credit', a.credit, 'discounts', a.discounts, 'voided', a.voided, 'riyad_fees', f.fees,
    'movements', coalesce((select jsonb_object_agg(type, jsonb_build_object('amount', amt, 'count', n)) from mv), '{}'),
    'movements_total', coalesce((select sum(amt) from mv), 0),
    'opening_drawer', s.opening_float, 'opening_safe', s.opening_safe, 'opening_riyad', s.opening_riyad,
    'expected_before_riyad', s.opening_float + s.opening_safe + a.cash + coalesce((select sum(amt) from mv), 0),
    'card_debts', c.debts, 'card_refunds', c.refunds, 'card_expected', a.card + c.debts - c.refunds,
    'riyad_owner_effect', r.owner_effect, 'riyad_owner_count', r.owner_count,
    -- platform balance expected before this shift's Riyad in / out (typed at closing): same rule as close_shift
    'riyad_base', case when s.opening_riyad is null then public.riyad_balance() - r.shift_effect else s.opening_riyad + r.owner_effect end,
    'opening_corrections', coalesce((select jsonb_agg(jsonb_build_object('kind', x.kind, 'expected', x.expected, 'actual', x.actual, 'reason', x.reason,
                                                                         'note', x.note, 'status', x.status) order by x.created_at)
                                       from shift_corrections x where x.shift_id = p_shift), '[]')
  )
  from s, sales_agg a, riyad_fees f, card c, rl r
$$;
revoke execute on function public.shift_totals(uuid) from public, anon, authenticated;

-- Riyad balances only for the staff who see them at opening (riyad.view_balance / riyad.fee)
create or replace function public.shift_status(p_device uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_s shifts;
  v_cash jsonb;
  v_blind boolean;
  v_tot jsonb;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  select value into v_cash from settings where key = 'cash';
  v_blind := coalesce((v_cash->>'blind_count')::boolean, false) and not public.has_perm('cash.view_expected');
  select * into v_s from shifts where device_id = p_device and status = 'open';
  if found then
    v_tot := public.shift_totals(v_s.id);
    if v_blind then v_tot := v_tot - 'expected_before_riyad'; end if;
    if not (public.has_perm('riyad.view_balance') or public.has_perm('riyad.fee')) then
      v_tot := v_tot - 'riyad_base' - 'riyad_owner_effect' - 'opening_riyad';
    end if;
    return jsonb_build_object(
      'open', true, 'shift', to_jsonb(v_s) - 'expected_cash' - 'difference',
      'employee_name', (select full_name from employees where id = v_s.employee_id),
      'mine', v_s.employee_id = public.current_employee_id(),
      'blind', v_blind,
      'float', coalesce((v_cash->>'opening_float')::bigint, 100000),
      'totals', v_tot);
  end if;
  return jsonb_build_object('open', false, 'carry', public.shift_carryover(p_device),
    'suggested_float', coalesce((v_cash->>'opening_float')::bigint, 100000),
    'default_float', coalesce((v_cash->>'opening_float')::bigint, 100000));
end $$;

-- Close: same as before, plus the card terminal total (null when not typed) checked against the card sales.
-- A new overload: the 7-argument version stays for POS screens not yet reloaded.
create or replace function public.close_shift(p_shift uuid, p_counted bigint, p_riyad_in bigint, p_riyad_out bigint,
                                              p_riyad_balance bigint, p_handed_over bigint, p_notes text, p_card_terminal bigint)
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
  v_card bigint;
begin
  if not public.has_perm('cash.shift') then raise exception 'forbidden'; end if;
  select * into v_s from shifts where id = p_shift for update;
  if not found or v_s.status <> 'open' then raise exception 'shift_not_open'; end if;
  if p_counted is null or p_counted < 0 then raise exception 'counted_required'; end if;
  if coalesce(p_handed_over, 0) > p_counted then raise exception 'handover_exceeds_cash'; end if;
  if coalesce(p_card_terminal, 0) < 0 then raise exception 'invalid_amount'; end if;

  v_tot := public.shift_totals(p_shift);
  v_expected := (v_tot->>'expected_before_riyad')::bigint + coalesce(p_riyad_in, 0) - coalesce(p_riyad_out, 0);
  v_card := (v_tot->>'card_expected')::bigint;

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
    closing_drawer = v_drawer, closing_safe = v_safe, card_terminal = p_card_terminal
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
  if p_card_terminal is not null and p_card_terminal <> v_card then
    perform public.notify('card_difference', 'warning', 'فرق بين جهاز البطاقة والمبيعات: ' || v_emp, 'Écart TPE : ' || v_emp,
      round((p_card_terminal - v_card) / 100.0, 2)::text || ' DH', '/shifts');
  end if;

  perform public.log_activity('custom', 'shifts', p_shift::text, v_emp,
    jsonb_build_object('closed', true, 'counted', p_counted, 'expected', v_expected, 'difference', p_counted - v_expected, 'drawer', v_drawer, 'safe', v_safe,
                       'card_expected', v_card, 'card_terminal', p_card_terminal));
  return jsonb_build_object('expected', v_expected, 'counted', p_counted, 'difference', p_counted - v_expected,
                            'totals', v_tot, 'riyad_expected', v_rexp, 'riyad_reported', p_riyad_balance,
                            'drawer', v_drawer, 'safe', v_safe, 'handed_over', coalesce(p_handed_over, 0), 'float', v_float,
                            'card_expected', v_card, 'card_terminal', p_card_terminal);
end $$;
