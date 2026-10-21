-- =====================================================================
-- Launch helpers
--  · launch_checklist(): what is still missing before going live
--  · reset_test_data(): wipe test transactions once (owner, confirmed)
--  · notifications housekeeping (auto-read after 7 days, delete after 90)
-- =====================================================================

create or replace function public.launch_checklist()
returns jsonb language sql stable security definer set search_path = public as $$
  with st as (select key, value from settings)
  select jsonb_build_object(
    'go_live_at', (select value->>'at' from st where key = 'go_live'),
    'items', jsonb_build_array(
      jsonb_build_object('key', 'store', 'ok', coalesce((select length(coalesce(value->>'phone', '')) > 5 and length(coalesce(value->>'address_ar', '')) > 3 from st where key = 'store'), false), 'to', '/settings'),
      jsonb_build_object('key', 'legal', 'ok', coalesce((select length(coalesce(value->>'ice', '')) >= 10 and length(coalesce(value->>'if', '')) >= 5 from st where key = 'legal'), false), 'to', '/settings'),
      jsonb_build_object('key', 'bank', 'ok', coalesce((select not coalesce((value->>'bank_transfer')::boolean, false) or length(regexp_replace(coalesce(value->>'rib', ''), '\D', '', 'g')) >= 20 from st where key = 'online_payments'), false), 'to', '/settings'),
      jsonb_build_object('key', 'prices', 'ok', (select count(*) = 0 from services where kind = 'admin' and is_online and is_active and deleted_at is null and price = 0 and pricing_mode <> 'open' and coalesce(system_key, '') not in ('custom_request', 'school_list')),
        'count', (select count(*) from services where kind = 'admin' and is_online and is_active and deleted_at is null and price = 0 and pricing_mode <> 'open' and coalesce(system_key, '') not in ('custom_request', 'school_list')), 'to', '/services'),
      jsonb_build_object('key', 'products', 'ok', (select count(*) >= 10 from products where deleted_at is null), 'count', (select count(*) from products where deleted_at is null), 'to', '/products'),
      jsonb_build_object('key', 'pins', 'ok', not exists (select 1 from employees e left join employee_secrets s on s.employee_id = e.id where e.deleted_at is null and e.is_active and e.can_use_pos and s.pin_hash is null), 'to', '/employees'),
      jsonb_build_object('key', 'device', 'ok', exists (select 1 from devices where status = 'approved' and is_active and deleted_at is null), 'to', '/devices'),
      jsonb_build_object('key', 'riyad', 'ok', exists (select 1 from riyad_ledger where type = 'opening'), 'to', '/riyad'),
      jsonb_build_object('key', 'privacy', 'ok', coalesce((select length(coalesce(value->'legal'->>'privacy_ar', '')) > 300 from st where key = 'website'), false), 'to', '/website'),
      jsonb_build_object('key', 'push', 'ok', exists (select 1 from push_subscriptions p join employees e on e.id = p.employee_id where e.is_owner), 'to', '/dashboard'),
      jsonb_build_object('key', 'backup', 'ok', exists (select 1 from activity_log where entity = 'backup'), 'to', '/settings'),
      jsonb_build_object('key', 'test_data', 'ok', exists (select 1 from st where key = 'go_live'), 'to', '/settings')))
  where public.is_owner()
$$;

-- What the reset would remove (for the confirmation screen and storage cleanup)
create or replace function public.reset_preview()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'sales', (select count(*) from sales), 'shifts', (select count(*) from shifts), 'riyad', (select count(*) from riyad_ledger),
    'requests', (select count(*) from service_requests), 'orders', (select count(*) from online_orders),
    'invoices', (select count(*) from invoices), 'debts', (select count(*) from customer_ledger),
    'expenses', (select count(*) from expenses where deleted_at is null), 'purchases', (select count(*) from purchases),
    'payroll', (select count(*) from payroll_runs) + (select count(*) from salary_advances) + (select count(*) from bonuses),
    'attendance', (select count(*) from attendance), 'notifications', (select count(*) from notifications),
    'help', (select count(*) from help_requests),
    'files', (select coalesce(jsonb_agg(path), '[]') from request_files where deleted_at is null))
  where public.is_owner()
$$;

-- p = {confirm:'ابدأ', expenses:bool, purchases:bool, payroll:bool}
create or replace function public.reset_test_data(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb := public.reset_preview() - 'files';
begin
  if not public.is_owner() then raise exception 'forbidden'; end if;
  if coalesce(p->>'confirm', '') <> 'ابدأ' then raise exception 'confirm_required'; end if;

  -- online & services
  delete from help_requests;
  delete from help_clicks;
  delete from task_assignments;
  delete from request_files;
  delete from service_requests;
  delete from online_orders;
  -- sales, cash, debts, invoices
  delete from invoices where original_invoice_id is not null;
  delete from invoices;
  delete from refunds;
  delete from customer_ledger;
  delete from cash_movements;
  update expenses set shift_id = null where shift_id is not null;
  update supplier_ledger set shift_id = null where shift_id is not null;
  update salary_advances set shift_id = null where shift_id is not null;
  delete from sales;
  delete from riyad_ledger;
  delete from shifts;
  -- stock: drop movements caused by sales / online orders and recompute
  delete from stock_movements where reason in ('sale', 'void', 'refund', 'online_order', 'online_cancel');
  update product_variants v set stock_qty = coalesce((select sum(m.qty_change) from stock_movements m where m.variant_id = v.id), 0);
  -- optional back-office data
  if coalesce((p->>'expenses')::boolean, false) then delete from expenses; end if;
  if coalesce((p->>'purchases')::boolean, false) then
    delete from supplier_ledger; delete from purchases;
    delete from stock_movements where reason = 'purchase';
    update product_variants v set stock_qty = coalesce((select sum(m.qty_change) from stock_movements m where m.variant_id = v.id), 0);
    update document_sequences set next_value = 1 where key = 'purchase';
  end if;
  if coalesce((p->>'payroll')::boolean, false) then delete from payroll_runs; delete from salary_advances; delete from bonuses; end if;
  delete from attendance;
  delete from notifications;
  update devices set current_employee = null;
  -- numbering starts again at 1
  update document_sequences set next_value = 1 where key in ('receipt', 'invoice', 'credit_note', 'order', 'request');

  insert into settings (key, value, is_public) values ('go_live', jsonb_build_object('at', now(), 'by', public.current_employee_id()), false)
  on conflict (key) do update set value = excluded.value;
  perform public.log_activity('custom', 'system', null, 'reset_test_data', v_before || jsonb_build_object('options', p - 'confirm'));
  return v_before;
end $$;

-- Notifications housekeeping
create or replace function public.notifications_housekeeping()
returns void language sql security definer set search_path = public as $$
  update notifications set read_at = now() where read_at is null and created_at < now() - interval '7 days';
  delete from notifications where created_at < now() - interval '90 days';
$$;
revoke execute on function public.notifications_housekeeping() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'sweet-house-notifications';
select cron.schedule('sweet-house-notifications', '30 4 * * *', 'select public.notifications_housekeeping()');

-- Mark notifications pointing to a page as read (used when the user handles them)
create or replace function public.notifications_read_link(p_link text)
returns void language sql security definer set search_path = public as $$
  update notifications set read_at = now() where read_at is null and link = p_link and (public.has_perm('reports.sales') or public.is_owner() or target_employee = public.current_employee_id());
$$;

-- Bank account in one place: keep invoice bank details in sync with the website
create or replace function public.save_bank_account(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('settings.manage') then raise exception 'forbidden'; end if;
  update settings set value = value || jsonb_build_object('bank_name', coalesce(p->>'bank_name', ''), 'rib', coalesce(p->>'rib', ''),
    'account_holder', coalesce(p->>'account_holder', ''),
    'bank_transfer', coalesce((p->>'bank_transfer')::boolean, true), 'in_store', coalesce((p->>'in_store')::boolean, true), 'cod', coalesce((p->>'cod')::boolean, true))
   where key = 'online_payments';
  update settings set value = value || jsonb_build_object('bank_name', coalesce(p->>'bank_name', ''), 'rib', coalesce(p->>'rib', '')) where key = 'invoice';
end $$;
