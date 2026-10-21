-- =====================================================================
-- Smart agents: each agent has one job, runs on a schedule, and leaves
-- suggestions in an inbox the owner decides on. Rejection reasons can be
-- remembered ("agent memory") and are read by the agent on every run.
--   · monitor   — nightly: unusual discounts, voids, refunds, cash gaps…
--   · purchases — weekly: what to buy, how much, from which supplier
-- The Edge Function "agents" does the work with the owner's Claude key.
-- =====================================================================

create table public.agents (
  key           text primary key,
  name_ar       text not null,
  name_fr       text not null,
  description_ar text,
  enabled       boolean not null default true,
  model         text not null default 'claude-sonnet-5-5',
  monthly_runs  int not null default 40,       -- cost guard
  schedule_ar   text,
  sort          int not null default 0
);
insert into public.agents (key, name_ar, name_fr, description_ar, schedule_ar, monthly_runs, sort) values
  ('monitor', 'مراقب المحل', 'Surveillance', 'يراجع عمليات اليوم ويبحث عن الغريب: تخفيضات كبيرة، إلغاءات، إرجاعات، فرق الصندوق، بيع بخسارة، ورديات مفتوحة.', 'كل ليلة 23:00', 40, 1),
  ('purchases', 'وكيل المشتريات', 'Achats', 'يحسب سرعة بيع كل منتج والمخزون، ويقترح ماذا تشتري هذا الأسبوع وكم، مرتباً حسب المورد.', 'كل إثنين 7:00', 10, 2);

create table public.agent_memory (
  id         uuid primary key default gen_random_uuid(),
  agent_key  text not null references public.agents(key) on delete cascade,
  note       text not null check (length(trim(note)) > 1),
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);

create table public.agent_runs (
  id            uuid primary key default gen_random_uuid(),
  agent_key     text not null references public.agents(key) on delete cascade,
  trigger       text not null default 'schedule' check (trigger in ('schedule', 'manual')),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  ok            boolean,
  error         text,
  summary       text,
  model         text,
  input_tokens  int,
  output_tokens int
);
create index agent_runs_idx on public.agent_runs (agent_key, started_at desc);

create table public.agent_suggestions (
  id            uuid primary key default gen_random_uuid(),
  agent_key     text not null references public.agents(key) on delete cascade,
  run_id        uuid references public.agent_runs(id) on delete set null,
  severity      text not null default 'info' check (severity in ('info', 'warning', 'danger')),
  title         text not null,
  body          text,
  link          text,
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'new' check (status in ('new', 'accepted', 'rejected')),
  decided_by    uuid references public.employees(id),
  decided_at    timestamptz,
  reason        text,
  created_at    timestamptz not null default now()
);
create index agent_suggestions_idx on public.agent_suggestions (status, created_at desc);

-- Shared secret for the cron → Edge Function call (never readable by clients)
create table public.agent_secret (id int primary key default 1 check (id = 1), secret text not null);
insert into public.agent_secret (secret) values (replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));

alter table public.agents            enable row level security;
alter table public.agent_memory      enable row level security;
alter table public.agent_runs        enable row level security;
alter table public.agent_suggestions enable row level security;
alter table public.agent_secret      enable row level security;
create policy agents_owner on public.agents for all using (public.is_owner()) with check (public.is_owner());
create policy agent_memory_owner on public.agent_memory for all using (public.is_owner()) with check (public.is_owner());
create policy agent_runs_owner on public.agent_runs for select using (public.is_owner());
create policy agent_suggestions_owner on public.agent_suggestions for select using (public.is_owner());

-- Owner decides on a suggestion; a rejection reason can become a memory
create or replace function public.agent_decide(p_id uuid, p_status text, p_reason text default null, p_remember boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v agent_suggestions;
begin
  if not public.is_owner() then raise exception 'forbidden'; end if;
  if p_status not in ('accepted', 'rejected', 'new') then raise exception 'invalid_status'; end if;
  update agent_suggestions set status = p_status, reason = nullif(trim(coalesce(p_reason, '')), ''),
         decided_by = case when p_status = 'new' then null else public.current_employee_id() end,
         decided_at = case when p_status = 'new' then null else now() end
   where id = p_id returning * into v;
  if v.id is null then raise exception 'not_found'; end if;
  if p_remember and length(trim(coalesce(p_reason, ''))) > 1 then
    insert into agent_memory (agent_key, note, created_by)
    values (v.agent_key, left(trim(p_reason), 500) || ' (بخصوص: ' || left(v.title, 120) || ')', public.current_employee_id());
  end if;
end $$;

create or replace function public.agents_overview()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', a.key, 'name_ar', a.name_ar, 'name_fr', a.name_fr, 'description_ar', a.description_ar, 'enabled', a.enabled,
    'model', a.model, 'monthly_runs', a.monthly_runs, 'schedule_ar', a.schedule_ar,
    'last_run', (select jsonb_build_object('at', r.started_at, 'ok', r.ok, 'error', r.error, 'summary', r.summary, 'trigger', r.trigger)
                   from agent_runs r where r.agent_key = a.key order by r.started_at desc limit 1),
    'month', (select jsonb_build_object('runs', count(*), 'tokens_in', coalesce(sum(input_tokens), 0), 'tokens_out', coalesce(sum(output_tokens), 0))
                from agent_runs r where r.agent_key = a.key and r.started_at >= date_trunc('month', now())),
    'suggestions', (select jsonb_build_object('total', count(*), 'accepted', count(*) filter (where status = 'accepted'),
                      'rejected', count(*) filter (where status = 'rejected'), 'new', count(*) filter (where status = 'new'))
                from agent_suggestions s where s.agent_key = a.key),
    'memory', (select count(*) from agent_memory m where m.agent_key = a.key)) order by a.sort), '[]')
  from agents a where public.is_owner()
$$;

create or replace function public.agent_pending_count()
returns int language sql stable security definer set search_path = public as $$
  select case when public.is_owner() then (select count(*)::int from agent_suggestions where status = 'new') else 0 end
$$;

-- ---------------------------------------------------------------------
-- Data the agents read (service role only)
-- ---------------------------------------------------------------------
create or replace function public.agent_monitor_data(p_day date)
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
       where s.status = 'completed' and s.discount_total > 0 and (s.discount_total >= 2000 or s.discount_total * 100 >= s.subtotal * 15)),
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
        from shifts sh join employees e on e.id = sh.employee_id where sh.status = 'open' and sh.opened_at < now() - interval '14 hours'),
    'shift_corrections', (select coalesce(jsonb_agg(jsonb_build_object('employee', e.full_name, 'kind', c.kind, 'expected', c.expected, 'entered', c.actual, 'reason', c.reason, 'note', c.note, 'status', c.status)), '[]')
        from shift_corrections c join employees e on e.id = c.employee_id, b where c.created_at >= b.f and c.created_at < b.t),
    'cash_out', (select coalesce(jsonb_agg(jsonb_build_object('type', m.type, 'amount', m.amount, 'note', m.note, 'employee', e.full_name)), '[]')
        from cash_movements m left join employees e on e.id = m.employee_id, b where m.created_at >= b.f and m.created_at < b.t and m.amount < 0),
    'forgot_clock_out', (select coalesce(jsonb_agg(distinct e.full_name), '[]') from attendance a join employees e on e.id = a.employee_id, b
        where a.check_out is null and a.check_in < b.t - interval '14 hours'))
$$;

create or replace function public.agent_purchase_data()
returns jsonb language sql stable security definer set search_path = public as $$
  with sold as (
    select i.variant_id,
           sum(i.base_qty) filter (where s.created_at >= now() - interval '7 days') q7,
           sum(i.base_qty) filter (where s.created_at >= now() - interval '30 days') q30,
           sum(i.base_qty) q90
      from sale_items i join sales s on s.id = i.sale_id
     where s.status = 'completed' and i.variant_id is not null and s.created_at >= now() - interval '90 days'
     group by i.variant_id),
  lastp as (
    select distinct on (pi.variant_id) pi.variant_id, p.supplier_id, sp.name supplier, p.purchased_on, pi.unit_cost, pi.qty
      from purchase_items pi join purchases p on p.id = pi.purchase_id left join suppliers sp on sp.id = p.supplier_id
     order by pi.variant_id, p.purchased_on desc, p.created_at desc),
  rows as (
    select v.id variant_id, pr.name_ar product, v.name_ar variant, v.stock_qty stock, pr.low_stock_alert alert,
           coalesce(so.q7, 0) sold_7d, coalesce(so.q30, 0) sold_30d, coalesce(so.q90, 0) sold_90d,
           coalesce(pc.cost, lp.unit_cost) unit_cost, v.price, lp.supplier_id, lp.supplier last_supplier, lp.purchased_on last_purchase, lp.qty last_qty,
           case when coalesce(so.q30, 0) > 0 then round(v.stock_qty / (so.q30 / 30.0), 1) end days_of_cover
      from product_variants v join products pr on pr.id = v.product_id
      left join sold so on so.variant_id = v.id left join lastp lp on lp.variant_id = v.id left join product_costs pc on pc.variant_id = v.id
     where v.deleted_at is null and pr.deleted_at is null and pr.track_stock
       and (coalesce(so.q90, 0) > 0 or v.stock_qty <= pr.low_stock_alert))
  select jsonb_build_object(
    'today', (now() at time zone 'Africa/Casablanca')::date,
    'note', 'المبالغ بالسنتيم. الكميات بالوحدة الأساسية.',
    'items', (select coalesce(jsonb_agg(to_jsonb(r) order by r.days_of_cover nulls first), '[]') from (select * from rows order by days_of_cover nulls first limit 300) r),
    'suppliers', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'phone', phone)), '[]') from suppliers where deleted_at is null))
$$;

revoke execute on function public.agent_monitor_data(date) from public, anon, authenticated;
revoke execute on function public.agent_purchase_data() from public, anon, authenticated;
grant execute on function public.agent_monitor_data(date) to service_role;
grant execute on function public.agent_purchase_data() to service_role;

-- ---------------------------------------------------------------------
-- Schedules (UTC; Morocco = UTC+1)
-- ---------------------------------------------------------------------
create or replace function public.agent_trigger(p_agent text)
returns void language sql security definer set search_path = public as $$
  select net.http_post(
    url := 'https://gvvcrjxmansmmrnxdrnw.supabase.co/functions/v1/agents',
    body := jsonb_build_object('agent', p_agent),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-agent-key', (select secret from agent_secret where id = 1)),
    timeout_milliseconds := 120000);
$$;
revoke execute on function public.agent_trigger(text) from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname in ('sweet-house-agent-monitor', 'sweet-house-agent-purchases');
select cron.schedule('sweet-house-agent-monitor', '0 22 * * *', $c$select public.agent_trigger('monitor')$c$);
select cron.schedule('sweet-house-agent-purchases', '0 6 * * 1', $c$select public.agent_trigger('purchases')$c$);
