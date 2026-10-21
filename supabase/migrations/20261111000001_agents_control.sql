-- =====================================================================
-- Owner control over the agent team:
--   1 · schedule per agent (hour, minute, days) → one dispatcher cron
--   2 · thresholds per agent (discount %, cash gap, weeks of stock…)
--   3 · notify mode per agent (push | brief | none)
--   5 · custom agents written by the owner (job + data sources)
--   6 · monthly team budget in DH (alert at 80%, stop at 100%)
--   7 · test run (handled in the Edge Function, nothing stored)
--   8 · pause the whole team until a date
-- Fix: follow-up / brief data no longer depend on the caller's permissions.
-- =====================================================================

alter table public.agents
  add column schedule    jsonb not null default '{}'::jsonb,   -- {hour, minute, days:[0..6]} Morocco time; {} = event only
  add column thresholds  jsonb not null default '{}'::jsonb,
  add column notify_mode text not null default 'push' check (notify_mode in ('push', 'brief', 'none')),
  add column is_custom   boolean not null default false,
  add column custom_job  text,
  add column sources     text[] not null default '{}';

update public.agents set schedule = '{"hour":23,"minute":0,"days":[0,1,2,3,4,5,6]}', thresholds = '{"discount_pct":15,"discount_dh":20,"cash_diff_dh":10,"open_shift_hours":14}' where key = 'monitor';
update public.agents set schedule = '{"hour":7,"minute":0,"days":[1]}', thresholds = '{"cover_weeks":4,"budget_dh":0}' where key = 'purchases';
update public.agents set schedule = '{"hour":9,"minute":0,"days":[0,1,2,3,4,5,6]}', thresholds = '{"debt_days":30,"ready_days":2,"debt_min_dh":0}' where key = 'followup';
update public.agents set schedule = '{}', thresholds = '{"services":[]}' where key = 'requests';
update public.agents set schedule = '{"hour":10,"minute":0,"days":[4]}', thresholds = '{"descriptions":8,"posts":3}', notify_mode = 'brief' where key = 'content';
update public.agents set schedule = '{"hour":8,"minute":0,"days":[0,1,2,3,4,5,6]}' where key = 'brief';

-- Team settings: budget and pause
insert into public.settings (key, value, is_public) values ('agent_team', jsonb_build_object(
  'monthly_budget_dh', 100, 'paused_until', null, 'alert_month', null), false)
on conflict (key) do nothing;

-- Estimated spend this month in DH (agents + assistants + site guide), $1 ≈ 10 DH
create or replace function public.ai_price(p_model text, p_in bigint, p_out bigint)
returns numeric language sql immutable as $$
  select (coalesce(p_in, 0) * case when p_model like '%haiku%' then 0.1 when p_model like '%opus%' then 4 else 2 end
        + coalesce(p_out, 0) * case when p_model like '%haiku%' then 0.5 when p_model like '%opus%' then 20 else 10 end) / 1e6 * 10
$$;

create or replace function public.agent_team_spend()
returns jsonb language sql stable security definer set search_path = public as $$
  with m as (select date_trunc('month', now()) f)
  select jsonb_build_object(
    'agents', round((select coalesce(sum(public.ai_price(model, input_tokens, output_tokens)), 0) from agent_runs, m where started_at >= m.f), 2),
    'assistants', round((select coalesce(sum(public.ai_price(model, input_tokens, output_tokens)), 0) from ai_usage, m where created_at >= m.f), 2),
    'site', round((select coalesce(sum(public.ai_price('haiku', input_tokens, output_tokens)), 0) from helper_usage, m where created_at >= m.f), 2),
    'budget', (select (value->>'monthly_budget_dh')::numeric from settings where key = 'agent_team'),
    'paused_until', (select value->>'paused_until' from settings where key = 'agent_team'))
  where public.is_owner() or auth.uid() is null
$$;
revoke execute on function public.agent_team_spend() from public, anon;
grant execute on function public.agent_team_spend() to authenticated, service_role;

-- Budget guard used by every AI Edge Function (service role)
create or replace function public.ai_budget_check()
returns text language plpgsql security definer set search_path = public as $$
declare
  s jsonb := public.agent_team_spend();
  v_total numeric := (s->>'agents')::numeric + (s->>'assistants')::numeric + (s->>'site')::numeric;
  v_budget numeric := nullif((s->>'budget')::numeric, 0);
  v_month text := to_char(now(), 'YYYY-MM');
begin
  if v_budget is null then return 'ok'; end if;
  if v_total >= v_budget then return 'over'; end if;
  if v_total >= v_budget * 0.8 and coalesce((select value->>'alert_month' from settings where key = 'agent_team'), '') <> v_month then
    update settings set value = value || jsonb_build_object('alert_month', v_month) where key = 'agent_team';
    perform public.notify('agent_budget', 'warning', '💰 الفريق الذكي استهلك 80% من ميزانية الشهر',
      'Équipe IA : 80 % du budget', 'المصروف ≈ ' || round(v_total) || ' درهم من ' || round(v_budget) || ' درهم. يمكنك رفع الميزانية من صفحة الفريق.', '/agents');
  end if;
  return 'ok';
end $$;
revoke execute on function public.ai_budget_check() from public, anon, authenticated;
grant execute on function public.ai_budget_check() to service_role;

-- ---------------------------------------------------------------------
-- Dispatcher: every 15 minutes, run the agents whose time has come
-- ---------------------------------------------------------------------
create or replace function public.agent_dispatch()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_now timestamp := now() at time zone 'Africa/Casablanca';
  v_slot timestamptz := date_trunc('hour', now()) + floor(extract(minute from now()) / 15) * interval '15 minutes';
  v_paused timestamptz := nullif((select value->>'paused_until' from settings where key = 'agent_team'), '')::timestamptz;
  a agents;
  n int := 0;
begin
  if v_paused is not null and v_paused > now() then return 0; end if;
  for a in select * from agents where enabled and schedule ? 'hour' loop
    if extract(dow from v_now)::int = any (array(select jsonb_array_elements_text(coalesce(a.schedule->'days', '[0,1,2,3,4,5,6]'))::int))
       and extract(hour from v_now)::int = (a.schedule->>'hour')::int
       and floor(extract(minute from v_now) / 15) = floor(coalesce((a.schedule->>'minute')::int, 0) / 15)
       and not exists (select 1 from agent_runs r where r.agent_key = a.key and r.trigger = 'schedule' and r.started_at >= v_slot) then
      perform public.agent_trigger(a.key);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.agent_dispatch() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname in
  ('sweet-house-agent-monitor', 'sweet-house-agent-purchases', 'sweet-house-agent-brief', 'sweet-house-agent-followup', 'sweet-house-agent-content', 'sweet-house-agent-dispatch');
select cron.schedule('sweet-house-agent-dispatch', '*/15 * * * *', 'select public.agent_dispatch()');

-- Requests agent: respects pause and the chosen services
create or replace function public.agent_on_new_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_services jsonb;
begin
  if coalesce(new.created_by_staff, false) then return new; end if;
  select thresholds->'services' into v_services from agents where key = 'requests' and enabled;
  if not found then return new; end if;
  if jsonb_array_length(coalesce(v_services, '[]')) > 0 and not (v_services ? new.service_id::text) then return new; end if;
  if nullif((select value->>'paused_until' from settings where key = 'agent_team'), '')::timestamptz > now() then return new; end if;
  perform net.http_post(
    url := 'https://gvvcrjxmansmmrnxdrnw.supabase.co/functions/v1/agents',
    body := jsonb_build_object('agent', 'requests', 'ref_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-agent-key', (select secret from agent_secret where id = 1)),
    timeout_milliseconds := 60000);
  return new;
exception when others then
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Data functions with the owner's thresholds (no caller permissions needed)
-- ---------------------------------------------------------------------
create or replace function public.agent_requests_open()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'number', r.number, 'customer', r.customer_name, 'service', r.service_name_ar, 'status', r.status,
           'due_at', r.created_at + make_interval(hours => sv.target_hours),
           'late', now() > r.created_at + make_interval(hours => sv.target_hours),
           'assignee_id', r.assigned_to, 'assignee', e.full_name) order by r.created_at), '[]')
    from service_requests r join request_statuses st on st.key = r.status join services sv on sv.id = r.service_id
    left join employees e on e.id = r.assigned_to
   where not st.is_final and not st.is_cancel and sv.target_hours is not null
     and now() > r.created_at + make_interval(hours => sv.target_hours) - interval '12 hours'
     and public.request_done_at(r.id) is null
$$;
revoke execute on function public.agent_requests_open() from public, anon, authenticated;
grant execute on function public.agent_requests_open() to service_role;

drop function if exists public.agent_followup_data();
create or replace function public.agent_followup_data(p_debt_days int default 30, p_ready_days int default 2, p_debt_min bigint default 0)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'now', now() at time zone 'Africa/Casablanca',
    'note', 'المبالغ بالسنتيم',
    'requests_due', public.agent_requests_open(),
    'ready_not_collected', (select coalesce(jsonb_agg(jsonb_build_object('number', r.number, 'customer', r.customer_name, 'phone', r.phone,
                 'service', r.service_name_ar, 'tracking_code', r.tracking_code, 'ready_days', round(extract(epoch from now() - r.updated_at) / 86400))), '[]')
        from service_requests r where r.status = 'ready' and r.updated_at < now() - make_interval(days => p_ready_days)
         and not exists (select 1 from request_files f where f.request_id = r.id and f.kind = 'deliverable' and f.downloaded_at is not null)),
    'old_debts', (select coalesce(jsonb_agg(jsonb_build_object('customer', b.full_name, 'phone', b.phone, 'balance', b.balance,
                 'days', round(extract(epoch from now() - b.last_charge_at) / 86400))), '[]')
        from (select * from customer_balances where balance > greatest(p_debt_min, 0) and last_charge_at < now() - make_interval(days => p_debt_days) order by balance desc limit 20) b),
    'help_waiting', (select coalesce(jsonb_agg(jsonb_build_object('name', h.name, 'phone', h.phone, 'service', h.service_name_ar, 'question', left(h.question, 200),
                 'hours', round(extract(epoch from now() - h.created_at) / 3600))), '[]')
        from help_requests h where h.status = 'new' and h.created_at < now() - interval '1 hour'),
    'employees', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', full_name)), '[]') from employees where deleted_at is null and is_active))
$$;
revoke execute on function public.agent_followup_data(int, int, bigint) from public, anon, authenticated;
grant execute on function public.agent_followup_data(int, int, bigint) to service_role;

create or replace function public.today_tasks_for_owner()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'requests_new', (select count(*) from service_requests where status = 'received'),
    'requests_late', public.late_requests_count(),
    'help_new', (select count(*) from help_requests where status = 'new'),
    'orders_new', (select count(*) from online_orders where status = 'new'),
    'low_stock', (select count(*) from product_variants v join products p on p.id = v.product_id where v.deleted_at is null and p.deleted_at is null and p.track_stock and v.stock_qty <= p.low_stock_alert),
    'riyad_balance', public.riyad_balance())
$$;

-- Brief: skip agents set to "no notification"
create or replace function public.agent_brief_data()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'today', (now() at time zone 'Africa/Casablanca')::date,
    'yesterday_report', public.daily_report_text(((now() at time zone 'Africa/Casablanca')::date - 1)),
    'record_check', (select jsonb_build_object(
        'yesterday', (select coalesce(sum(total), 0) from sales where status = 'completed'
                       and created_at >= (((now() at time zone 'Africa/Casablanca')::date - 1)::timestamp at time zone 'Africa/Casablanca')
                       and created_at < (((now() at time zone 'Africa/Casablanca')::date)::timestamp at time zone 'Africa/Casablanca')),
        'best_previous_day', (select coalesce(max(t), 0) from (select date_trunc('day', created_at at time zone 'Africa/Casablanca') d, sum(total) t
                       from sales where status = 'completed' and created_at < (((now() at time zone 'Africa/Casablanca')::date - 1)::timestamp at time zone 'Africa/Casablanca')
                       group by 1) x))),
    'team', (select coalesce(jsonb_agg(jsonb_build_object('agent', a.persona_name, 'avatar', a.avatar, 'severity', s.severity, 'title', s.title, 'link', s.link)), '[]')
        from agent_suggestions s join agents a on a.key = s.agent_key
       where s.status = 'new' and s.agent_key <> 'brief' and a.notify_mode <> 'none' and s.created_at > now() - interval '36 hours'),
    'tasks', public.today_tasks_for_owner())
$$;

-- Monitor with the owner's discount threshold
drop function if exists public.agent_monitor_data(date);
create or replace function public.agent_monitor_data(p_day date, p_disc_pct numeric default 15, p_disc_cents bigint default 2000, p_open_hours int default 14)
returns jsonb language sql stable security definer set search_path = public as $$
  with b as (select (p_day::timestamp at time zone 'Africa/Casablanca') f, ((p_day + 1)::timestamp at time zone 'Africa/Casablanca') t),
  s as (select x.* from sales x, b where x.created_at >= b.f and x.created_at < b.t),
  base as (select coalesce(sum(total), 0) / 28.0 avg_rev, coalesce(sum(discount_total), 0) / 28.0 avg_disc, count(*) / 28.0 avg_count
             from sales, b where status = 'completed' and created_at >= b.f - interval '28 days' and created_at < b.f)
  select jsonb_build_object(
    'day', p_day,
    'note', 'المبالغ بالسنتيم',
    'totals', (select jsonb_build_object('sales', count(*) filter (where status = 'completed'), 'revenue', coalesce(sum(total) filter (where status = 'completed'), 0),
                 'discounts', coalesce(sum(discount_total) filter (where status = 'completed'), 0), 'credit', coalesce(sum(paid_credit) filter (where status = 'completed'), 0),
                 'voided', count(*) filter (where status = 'voided')) from s),
    'baseline_28d_daily', (select jsonb_build_object('revenue', round(avg_rev), 'discounts', round(avg_disc), 'sales', round(avg_count, 1)) from base),
    'by_employee', (select coalesce(jsonb_agg(jsonb_build_object('employee', e.full_name, 'sales', n, 'revenue', rev, 'discounts', disc, 'voids', v)), '[]') from (
        select employee_id, count(*) filter (where status = 'completed') n, coalesce(sum(total) filter (where status = 'completed'), 0) rev,
               coalesce(sum(discount_total) filter (where status = 'completed'), 0) disc, count(*) filter (where status = 'voided') v
          from s group by employee_id) q join employees e on e.id = q.employee_id),
    'big_discounts', (select coalesce(jsonb_agg(jsonb_build_object('number', s.number, 'employee', e.full_name, 'subtotal', s.subtotal, 'discount', s.discount_total,
                 'pct', round(100.0 * s.discount_total / nullif(s.subtotal, 0)), 'customer', c.full_name, 'note', s.note)), '[]')
        from s join employees e on e.id = s.employee_id left join customers c on c.id = s.customer_id
       where s.status = 'completed' and s.discount_total > 0 and (s.discount_total >= p_disc_cents or s.discount_total * 100 >= s.subtotal * p_disc_pct)),
    'price_overrides', (select coalesce(jsonb_agg(jsonb_build_object('number', s.number, 'employee', e.full_name, 'item', i.name_ar, 'qty', i.qty,
                 'original', i.original_unit_price, 'sold_at', i.unit_price)), '[]')
        from s join sale_items i on i.sale_id = s.id join employees e on e.id = s.employee_id
       where s.status = 'completed' and i.unit_price < i.original_unit_price),
    'below_cost', (select coalesce(jsonb_agg(jsonb_build_object('number', s.number, 'employee', e.full_name, 'item', i.name_ar, 'qty', i.qty,
                 'unit_price', i.total / nullif(i.qty, 0), 'unit_cost', i.unit_cost)), '[]')
        from s join sale_items i on i.sale_id = s.id join employees e on e.id = s.employee_id
       where s.status = 'completed' and i.item_type = 'product' and i.unit_cost > 0 and i.total < i.unit_cost * i.base_qty),
    'voids', (select coalesce(jsonb_agg(jsonb_build_object('number', s.number, 'seller', e.full_name, 'voided_by', v.full_name, 'total', s.total,
                 'reason', s.void_reason, 'minutes_after_sale', round(extract(epoch from s.voided_at - s.created_at) / 60))), '[]')
        from s join employees e on e.id = s.employee_id left join employees v on v.id = s.voided_by where s.status = 'voided'),
    'refunds', (select coalesce(jsonb_agg(jsonb_build_object('sale', x.number, 'employee', e.full_name, 'total', r.total, 'method', r.method, 'reason', r.reason)), '[]')
        from refunds r join sales x on x.id = r.sale_id join employees e on e.id = r.employee_id, b where r.created_at >= b.f and r.created_at < b.t),
    'shifts_closed', (select coalesce(jsonb_agg(jsonb_build_object('employee', e.full_name, 'expected', sh.expected_cash, 'counted', sh.counted_cash,
                 'difference', sh.difference, 'riyad_reported', sh.riyad_balance_reported, 'riyad_expected', sh.riyad_balance_expected, 'notes', sh.notes)), '[]')
        from shifts sh join employees e on e.id = sh.employee_id, b where sh.closed_at >= b.f and sh.closed_at < b.t),
    'shifts_open_long', (select coalesce(jsonb_agg(jsonb_build_object('employee', e.full_name, 'opened_at', sh.opened_at,
                 'hours', round(extract(epoch from now() - sh.opened_at) / 3600))), '[]')
        from shifts sh join employees e on e.id = sh.employee_id where sh.status = 'open' and sh.opened_at < now() - make_interval(hours => p_open_hours)),
    'shift_corrections', (select coalesce(jsonb_agg(jsonb_build_object('employee', e.full_name, 'kind', c.kind, 'expected', c.expected, 'entered', c.actual, 'reason', c.reason, 'note', c.note, 'status', c.status)), '[]')
        from shift_corrections c join employees e on e.id = c.employee_id, b where c.created_at >= b.f and c.created_at < b.t),
    'cash_out', (select coalesce(jsonb_agg(jsonb_build_object('type', m.type, 'amount', m.amount, 'note', m.note, 'employee', e.full_name)), '[]')
        from cash_movements m left join employees e on e.id = m.employee_id, b where m.created_at >= b.f and m.created_at < b.t and m.amount < 0),
    'forgot_clock_out', (select coalesce(jsonb_agg(distinct e.full_name), '[]') from attendance a join employees e on e.id = a.employee_id, b
        where a.check_out is null and a.check_in < b.t - make_interval(hours => p_open_hours)))
$$;
revoke execute on function public.agent_monitor_data(date, numeric, bigint, int) from public, anon, authenticated;
grant execute on function public.agent_monitor_data(date, numeric, bigint, int) to service_role;

-- Custom agents: compose data from a fixed list of sources
create or replace function public.agent_custom_data(p_sources text[])
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  o jsonb := jsonb_build_object('today', (now() at time zone 'Africa/Casablanca')::date, 'note', 'المبالغ بالسنتيم');
begin
  if 'sales' = any(p_sources) then
    o := o || jsonb_build_object('sales_30d_by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'sales', n, 'revenue', rv, 'discounts', ds) order by d), '[]') from (
          select (created_at at time zone 'Africa/Casablanca')::date d, count(*) n, sum(total) rv, sum(discount_total) ds
            from sales where status = 'completed' and created_at > now() - interval '30 days' group by 1) q),
      'top_items_30d', (select coalesce(jsonb_agg(jsonb_build_object('name', name_ar, 'qty', q, 'revenue', rv)), '[]') from (
          select i.name_ar, sum(i.qty) q, sum(i.total) rv from sale_items i join sales s on s.id = i.sale_id
           where s.status = 'completed' and s.created_at > now() - interval '30 days' group by 1 order by 3 desc limit 25) t));
  end if;
  if 'stock' = any(p_sources) then o := o || jsonb_build_object('stock', public.agent_purchase_data()->'items'); end if;
  if 'expenses' = any(p_sources) then
    o := o || jsonb_build_object('expenses_60d', (select coalesce(jsonb_agg(jsonb_build_object('day', e.spent_on, 'amount', e.amount, 'category', c.name_ar, 'note', e.note, 'paid_from', e.paid_from) order by e.spent_on), '[]')
          from expenses e left join expense_categories c on c.id = e.category_id where e.deleted_at is null and e.spent_on > current_date - 60));
  end if;
  if 'requests' = any(p_sources) then
    o := o || jsonb_build_object('requests_open', public.agent_requests_open(),
      'requests_30d_by_service', (select coalesce(jsonb_agg(jsonb_build_object('service', service_name_ar, 'count', n, 'revenue', rv)), '[]') from (
          select service_name_ar, count(*) n, sum(price) rv from service_requests where created_at > now() - interval '30 days' group by 1 order by 2 desc) t));
  end if;
  if 'riyad' = any(p_sources) then
    o := o || jsonb_build_object('riyad_balance', public.riyad_balance(), 'riyad_30d', (select coalesce(jsonb_agg(jsonb_build_object('at', created_at, 'type', type, 'amount', amount, 'note', note) order by created_at), '[]')
          from riyad_ledger where created_at > now() - interval '30 days'));
  end if;
  if 'debts' = any(p_sources) then
    o := o || jsonb_build_object('debts', (select coalesce(jsonb_agg(jsonb_build_object('customer', full_name, 'balance', balance, 'last_charge_at', last_charge_at) order by balance desc), '[]')
          from customer_balances where balance > 0));
  end if;
  if 'attendance' = any(p_sources) then
    o := o || jsonb_build_object('attendance_14d', (select coalesce(jsonb_agg(jsonb_build_object('employee', e.full_name, 'in', a.check_in, 'out', a.check_out) order by a.check_in), '[]')
          from attendance a join employees e on e.id = a.employee_id where a.check_in > now() - interval '14 days'));
  end if;
  if 'shifts' = any(p_sources) then
    o := o || jsonb_build_object('shifts_14d', (select coalesce(jsonb_agg(jsonb_build_object('employee', e.full_name, 'opened', s.opened_at, 'closed', s.closed_at, 'difference', s.difference, 'handed_over', s.handed_over) order by s.opened_at), '[]')
          from shifts s join employees e on e.id = s.employee_id where s.opened_at > now() - interval '14 days'));
  end if;
  if 'online' = any(p_sources) then
    o := o || jsonb_build_object('orders_30d', (select coalesce(jsonb_agg(jsonb_build_object('at', created_at, 'status', status, 'total', total)), '[]')
          from online_orders where created_at > now() - interval '30 days'),
      'help_30d', (select count(*) from help_requests where created_at > now() - interval '30 days'));
  end if;
  return o;
end $$;
revoke execute on function public.agent_custom_data(text[]) from public, anon, authenticated;
grant execute on function public.agent_custom_data(text[]) to service_role;

-- Owner can delete custom agents only
create policy agents_only_custom_deletable on public.agents as restrictive for delete using (is_custom);
