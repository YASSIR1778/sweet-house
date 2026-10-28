-- =====================================================================
-- «شحن رصيد رياض» from the till, for staff with riyad.manage.
-- The platform balance goes up at once through an owner line (shift_id null),
-- so the open shift's expected Riyad includes it exactly like a recharge typed
-- in the dashboard. When the money was taken from the shop's cash (drawer or
-- safe), the same amount leaves the till as a «riyad_recharge» cash movement.
-- =====================================================================

alter table public.cash_movements drop constraint cash_movements_type_check;
alter table public.cash_movements add constraint cash_movements_type_check
  check (type in ('expense', 'owner_withdrawal', 'owner_deposit', 'debt_payment', 'riyad_credit', 'refund',
                  'supplier_payment', 'salary_advance', 'adjustment', 'online_payment', 'riyad_recharge'));

create or replace function public.pos_riyad_recharge(p_device uuid, p_amount bigint, p_from_till boolean, p_note text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid := public.current_employee_id();
  v_shift uuid;
  v_note text := concat_ws(' · ', case when p_from_till then 'من نقود المحل' else 'من خارج المحل' end, nullif(trim(p_note), ''));
begin
  if not public.has_perm('riyad.manage') then raise exception 'forbidden'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if p_from_till then
    v_shift := public.require_open_shift(p_device);
    insert into cash_movements (shift_id, type, amount, note, employee_id)
    values (v_shift, 'riyad_recharge', -p_amount, nullif(trim(p_note), ''), v_emp);
  end if;
  insert into riyad_ledger (type, amount, effect, note, employee_id)
  values ('recharge', p_amount, p_amount, v_note, v_emp);

  perform public.log_activity('custom', 'riyad', null, 'recharge',
    jsonb_build_object('amount', p_amount, 'from_till', p_from_till, 'note', p_note, 'device', p_device));
  if not coalesce((select is_owner from employees where id = v_emp), false) then
    perform public.notify('riyad_recharge', 'info', 'شحن رصيد رياض: ' || round(p_amount / 100.0, 2)::text || ' DH', 'Recharge Riyad : ' || round(p_amount / 100.0, 2)::text || ' DH',
      coalesce((select full_name from employees where id = v_emp), '?') || ' · ' || v_note, '/riyad');
  end if;
  return public.riyad_balance();
end $$;
revoke execute on function public.pos_riyad_recharge(uuid, bigint, boolean, text) from public, anon;
