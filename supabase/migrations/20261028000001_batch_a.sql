-- =====================================================================
-- Batch A of the owner's chosen proposals:
--  20 target duration per service + late requests + duration report
--  21 internal step-by-step guide per service (staff only)
--  28 slow-moving products
--  31 revenue / profit per business section
--  33 employee performance
--  38 attendance (clock in / out with the POS PIN session)
--  10 Moroccans abroad: international phone, delivery by e-mail or post
-- (36 training mode lives in the POS only, nothing is stored.)
-- =====================================================================

-- 38 · Attendance table (functions further down)
create table public.attendance (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  device_id   uuid references public.devices(id),
  check_in    timestamptz not null default now(),
  check_out   timestamptz,
  note        text,
  edited_by   uuid references public.employees(id),
  created_at  timestamptz not null default now(),
  check (check_out is null or check_out > check_in)
);
create index attendance_emp_idx on public.attendance (employee_id, check_in desc);
create unique index attendance_one_open on public.attendance (employee_id) where check_out is null;
create trigger audit_attendance after update or delete on public.attendance
  for each row execute function public.audit_row();
alter table public.attendance enable row level security;
create policy attendance_read on public.attendance for select
  using (employee_id = public.current_employee_id() or public.has_perm('employees.manage'));
create policy attendance_write on public.attendance for all
  using (public.has_perm('employees.manage')) with check (public.has_perm('employees.manage'));

-- ---------------------------------------------------------------------
-- 20 · Target duration
-- ---------------------------------------------------------------------
alter table public.services add column target_hours int check (target_hours is null or target_hours > 0);

-- When a request reached a "done" status (ready to download / delivered)
create or replace function public.request_done_at(p_request uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select min(h.created_at) from request_history h join request_statuses s on s.key = h.status
   where h.request_id = p_request and not s.is_cancel and (s.allow_download or s.is_final)
$$;
revoke execute on function public.request_done_at(uuid) from public, anon, authenticated;

create or replace function public.requests_list(p_limit int default 1000)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]') from (
    select to_jsonb(r) - 'internal_notes' - 'fields' || jsonb_build_object(
      'files_count', (select count(*) from request_files f where f.request_id = r.id and f.kind <> 'deliverable' and f.deleted_at is null),
      'deliverables_count', (select count(*) from request_files f where f.request_id = r.id and f.kind = 'deliverable' and f.deleted_at is null),
      'downloaded', exists (select 1 from request_files f where f.request_id = r.id and f.kind = 'deliverable' and f.downloaded_at is not null),
      'new_docs', (select count(*) from request_files f where f.request_id = r.id and f.kind <> 'deliverable' and f.deleted_at is null
                     and f.uploaded_by is null
                     and f.created_at > coalesce((select max(h.created_at) from request_history h where h.request_id = r.id and h.employee_id is not null), r.created_at + interval '5 minutes')),
      'target_hours', sv.target_hours,
      'due_at', case when sv.target_hours is not null then r.created_at + make_interval(hours => sv.target_hours) end,
      'late', sv.target_hours is not null and not st.is_cancel
              and coalesce(public.request_done_at(r.id), now()) > r.created_at + make_interval(hours => sv.target_hours)
              and public.request_done_at(r.id) is null) x
    from service_requests r
    join request_statuses st on st.key = r.status
    left join services sv on sv.id = r.service_id
    order by r.created_at desc limit p_limit) t
  where public.has_perm('requests.manage') or public.has_perm('requests.view_documents')
$$;

create or replace function public.late_requests_count()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from service_requests r
    join request_statuses st on st.key = r.status
    join services sv on sv.id = r.service_id
   where sv.target_hours is not null and not st.is_cancel
     and now() > r.created_at + make_interval(hours => sv.target_hours)
     and public.request_done_at(r.id) is null
$$;
revoke execute on function public.late_requests_count() from public, anon, authenticated;

create or replace function public.online_pending()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'requests', (select count(*) from service_requests r join request_statuses s on s.key = r.status where not s.is_final),
    'requests_new', (select count(*) from service_requests where status = 'received'),
    'requests_late', public.late_requests_count(),
    'orders', (select count(*) from online_orders where status not in ('delivered', 'cancelled')),
    'orders_new', (select count(*) from online_orders where status = 'new'),
    'proofs', (select count(*) from service_requests where payment_status = 'proof_uploaded')
            + (select count(*) from online_orders where payment_status = 'proof_uploaded'))
  where public.is_staff()
$$;

create or replace function public.today_tasks()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'requests_new', case when public.has_perm('requests.manage') then (select count(*) from service_requests where status = 'received') end,
    'requests_late', case when public.has_perm('requests.manage') then public.late_requests_count() end,
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
    'forgot_checkout', case when public.has_perm('employees.manage') then
        (select count(*) from attendance where check_out is null and check_in < now() - interval '14 hours') end,
    'backup_days', case when public.is_owner() then
        (select extract(day from now() - max(at))::int from activity_log where entity = 'backup') end)
  where public.is_staff()
$$;

-- Average time to finish each service
create or replace function public.service_durations(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(t order by t.count desc), '[]') from (
    select r.service_name_ar name_ar, r.service_name_fr name_fr, max(sv.target_hours) target_hours, count(*) count,
           count(d.done_at) done,
           round(avg(extract(epoch from d.done_at - r.created_at) / 3600)::numeric, 1) avg_hours,
           count(*) filter (where sv.target_hours is not null
                              and coalesce(d.done_at, now()) > r.created_at + make_interval(hours => sv.target_hours)) late
      from service_requests r
      join request_statuses st on st.key = r.status
      left join services sv on sv.id = r.service_id
      cross join lateral (select public.request_done_at(r.id) done_at) d
     where r.created_at >= p_from and r.created_at < p_to and not st.is_cancel
     group by 1, 2) t
  where public.has_perm('reports.sales') or public.has_perm('requests.manage')
$$;

-- ---------------------------------------------------------------------
-- 21 · Internal guide per service (never public)
-- ---------------------------------------------------------------------
create table public.service_guides (
  service_id uuid primary key references public.services(id) on delete cascade,
  steps_ar   text,           -- one step per line
  tips_ar    text,           -- common mistakes / remarks
  links      jsonb not null default '[]'::jsonb, -- [{label, url}]
  images     jsonb not null default '[]'::jsonb, -- [url]
  updated_by uuid references public.employees(id),
  updated_at timestamptz not null default now()
);
create trigger service_guides_updated before update on public.service_guides for each row execute function public.set_updated_at();
create trigger audit_service_guides after insert or update or delete on public.service_guides
  for each row execute function public.audit_row('service_id');
alter table public.service_guides enable row level security;
create policy guides_read on public.service_guides for select using (public.is_staff());
create policy guides_write on public.service_guides for all
  using (public.has_perm('services.manage')) with check (public.has_perm('services.manage'));

-- ---------------------------------------------------------------------
-- 28 · Slow-moving products
-- ---------------------------------------------------------------------
create or replace function public.stale_products(p_days int default 90)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(t order by t.cost_value desc nulls last, t.retail_value desc), '[]') from (
    select p.id product_id, v.id variant_id, p.name_ar, p.name_fr, v.name_ar variant_ar, v.name_fr variant_fr,
           v.barcode, coalesce(v.image_url, p.images[1]) image_url, v.stock_qty stock, v.price,
           (v.stock_qty * v.price)::bigint retail_value,
           case when public.has_perm('products.view_cost') then (v.stock_qty * coalesce(c.cost, 0))::bigint end cost_value,
           ls.last_sold_at,
           case when ls.last_sold_at is null then null else (now()::date - (ls.last_sold_at at time zone 'Africa/Casablanca')::date) end days
      from product_variants v
      join products p on p.id = v.product_id
      left join product_costs c on c.variant_id = v.id
      left join lateral (select max(s.created_at) last_sold_at from sale_items i join sales s on s.id = i.sale_id
                          where i.variant_id = v.id and s.status = 'completed') ls on true
     where p.deleted_at is null and v.deleted_at is null and v.stock_qty > 0
       and coalesce(ls.last_sold_at, p.created_at) < now() - make_interval(days => p_days)) t
  where public.has_perm('products.manage') or public.has_perm('reports.sales')
$$;

-- ---------------------------------------------------------------------
-- 31 · Revenue and profit per business section
-- sections: library (products), counter (print/copy…), admin (e-services
-- at the counter + paid online requests), riyad (fees + commissions),
-- shop (online orders), custom (hand-typed items).
-- Order-level discounts are spread over the lines of each receipt.
-- ---------------------------------------------------------------------
create or replace function public.sale_section(p_item_type text, p_kind text, p_key text)
returns text language sql immutable as $$
  select case
    when p_item_type = 'product' then 'library'
    when p_item_type = 'custom' then 'custom'
    when p_key = 'riyad_fee' then 'riyad'
    when p_kind = 'counter' then 'counter'
    else 'admin' end
$$;

create or replace function public.report_sections(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_profit boolean := public.has_perm('reports.profit');
  v_rows jsonb;
  v_months jsonb;
  o jsonb := public.online_summary(p_from, p_to);
  v_comm bigint;
begin
  if not public.has_perm('reports.sales') then raise exception 'forbidden'; end if;
  select coalesce(sum(amount), 0) into v_comm from riyad_ledger where type = 'commission' and created_at >= p_from and created_at < p_to;

  with lines as (
    select public.sale_section(i.item_type, sv.kind, sv.system_key) section,
           (i.total * s.total::numeric / nullif(sum(i.total) over (partition by s.id), 0)) revenue,
           (i.unit_cost * i.qty) cost,
           date_trunc('month', s.created_at at time zone 'Africa/Casablanca')::date m
      from sale_items i join sales s on s.id = i.sale_id left join services sv on sv.id = i.service_id
     where s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to),
  refunds_l as (
    select public.sale_section(si.item_type, sv.kind, sv.system_key) section, ri.amount revenue, ri.qty * si.unit_cost cost,
           date_trunc('month', r.created_at at time zone 'Africa/Casablanca')::date m
      from refund_items ri join refunds r on r.id = ri.refund_id join sale_items si on si.id = ri.sale_item_id
      left join services sv on sv.id = si.service_id
     where r.created_at >= p_from and r.created_at < p_to),
  allrows as (
    select section, revenue, cost, m from lines
    union all select section, -revenue, -cost, m from refunds_l
    union all select 'admin', price, 0, date_trunc('month', paid_at at time zone 'Africa/Casablanca')::date
                from service_requests where payment_status = 'paid' and paid_via_sale is null and paid_at >= p_from and paid_at < p_to
    union all select 'shop', o2.total, (select coalesce(sum(i.unit_cost * i.qty), 0) from online_order_items i where i.order_id = o2.id),
                     date_trunc('month', o2.paid_at at time zone 'Africa/Casablanca')::date
                from online_orders o2 where o2.payment_status = 'paid' and o2.paid_at >= p_from and o2.paid_at < p_to
    union all select 'riyad', amount, 0, date_trunc('month', created_at at time zone 'Africa/Casablanca')::date
                from riyad_ledger where type = 'commission' and created_at >= p_from and created_at < p_to)
  select
    (select coalesce(jsonb_agg(jsonb_build_object('section', section, 'revenue', round(rev), 'cost', case when v_profit then round(cst) end,
                                                  'profit', case when v_profit then round(rev - cst) end) order by rev desc), '[]')
       from (select section, sum(revenue) rev, sum(cost) cst from allrows group by 1) a),
    (select coalesce(jsonb_agg(jsonb_build_object('month', m, 'sections', secs) order by m), '[]')
       from (select m, jsonb_object_agg(section, round(rev)) secs from (select m, section, sum(revenue) rev from allrows group by 1, 2) b group by m) c)
  into v_rows, v_months;

  return jsonb_build_object('sections', v_rows, 'by_month', v_months, 'riyad_commissions', case when v_profit then v_comm end);
end $$;

-- ---------------------------------------------------------------------
-- 38 · Attendance
-- ---------------------------------------------------------------------
create or replace function public.my_attendance()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'open', (select to_jsonb(a) from attendance a where a.employee_id = public.current_employee_id() and a.check_out is null),
    'today_minutes', (select coalesce(sum(extract(epoch from coalesce(a.check_out, now()) - a.check_in) / 60), 0)::int
                        from attendance a where a.employee_id = public.current_employee_id()
                         and (a.check_in at time zone 'Africa/Casablanca')::date = (now() at time zone 'Africa/Casablanca')::date))
  where public.current_employee_id() is not null
$$;

-- Toggle: clock in when out, clock out when in
create or replace function public.clock(p_device uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid := public.current_employee_id();
  v_open attendance;
begin
  if v_emp is null then raise exception 'forbidden'; end if;
  select * into v_open from attendance where employee_id = v_emp and check_out is null;
  if found then
    update attendance set check_out = now() where id = v_open.id;
    return jsonb_build_object('state', 'out', 'check_in', v_open.check_in, 'check_out', now());
  end if;
  insert into attendance (employee_id, device_id) values (v_emp, p_device);
  return jsonb_build_object('state', 'in', 'check_in', now());
end $$;

create or replace function public.attendance_report(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'employees', (select coalesce(jsonb_agg(t order by t.full_name), '[]') from (
        select e.id employee_id, e.full_name, e.color,
               count(distinct (a.check_in at time zone 'Africa/Casablanca')::date) days,
               round(coalesce(sum(extract(epoch from a.check_out - a.check_in) / 3600) filter (where a.check_out is not null), 0)::numeric, 1) hours,
               count(*) filter (where a.check_out is null and a.check_in < now() - interval '14 hours') forgotten
          from employees e join attendance a on a.employee_id = e.id
         where a.check_in >= p_from and a.check_in < p_to
         group by e.id, e.full_name, e.color) t),
    'entries', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'employee_id', a.employee_id, 'full_name', e.full_name, 'color', e.color,
                    'check_in', a.check_in, 'check_out', a.check_out, 'note', a.note, 'device', d.name) order by a.check_in desc), '[]')
                  from attendance a join employees e on e.id = a.employee_id left join devices d on d.id = a.device_id
                 where a.check_in >= p_from and a.check_in < p_to))
  where public.has_perm('employees.manage')
$$;

-- ---------------------------------------------------------------------
-- 33 · Employee performance
-- ---------------------------------------------------------------------
create or replace function public.employee_performance(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(t order by t.revenue desc nulls last), '[]') from (
    select e.id employee_id, e.full_name, e.color,
      (select count(*) from sales s where s.employee_id = e.id and s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to) sales_count,
      (select coalesce(sum(total), 0) from sales s where s.employee_id = e.id and s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to) revenue,
      (select coalesce(sum(discount_total), 0) from sales s where s.employee_id = e.id and s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to) discounts,
      (select count(*) from sales s where s.voided_by = e.id and s.voided_at >= p_from and s.voided_at < p_to) voids,
      (select count(*) from refunds r where r.employee_id = e.id and r.created_at >= p_from and r.created_at < p_to) refunds,
      (select count(*) from sale_items i join sales s on s.id = i.sale_id where i.item_type = 'custom' and s.employee_id = e.id
          and s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to) custom_items,
      (select count(distinct h.request_id) from request_history h join request_statuses st on st.key = h.status
        where h.employee_id = e.id and not st.is_cancel and (st.allow_download or st.is_final)
          and h.created_at >= p_from and h.created_at < p_to) requests_done,
      (select round(avg(extract(epoch from h.created_at - r.created_at) / 3600)::numeric, 1)
         from request_history h join request_statuses st on st.key = h.status join service_requests r on r.id = h.request_id
        where h.employee_id = e.id and not st.is_cancel and (st.allow_download or st.is_final)
          and h.created_at >= p_from and h.created_at < p_to
          and h.created_at = public.request_done_at(r.id)) requests_avg_hours,
      (select count(*) from shifts sh where sh.closed_by = e.id and sh.status = 'closed' and sh.closed_at >= p_from and sh.closed_at < p_to) shifts,
      (select coalesce(sum(sh.difference), 0) from shifts sh where sh.closed_by = e.id and sh.status = 'closed' and sh.closed_at >= p_from and sh.closed_at < p_to) cash_difference,
      (select coalesce(sum(abs(sh.difference)), 0) from shifts sh where sh.closed_by = e.id and sh.status = 'closed' and sh.closed_at >= p_from and sh.closed_at < p_to) cash_difference_abs,
      (select round(coalesce(sum(extract(epoch from a.check_out - a.check_in) / 3600), 0)::numeric, 1) from attendance a
        where a.employee_id = e.id and a.check_out is not null and a.check_in >= p_from and a.check_in < p_to) hours,
      (select count(distinct (a.check_in at time zone 'Africa/Casablanca')::date) from attendance a
        where a.employee_id = e.id and a.check_in >= p_from and a.check_in < p_to) days
    from employees e
    where e.deleted_at is null and not e.is_owner) t
  where public.has_perm('reports.employees')
$$;

-- ---------------------------------------------------------------------
-- 10 · Moroccans abroad
-- ---------------------------------------------------------------------
alter table public.services add column abroad boolean not null default false;
alter table public.service_requests
  add column abroad boolean not null default false,
  add column country text,
  add column delivery_method text check (delivery_method in ('email', 'post', 'store', 'person')),
  add column delivery_address text;

-- Services that work fully remotely are enabled for abroad by default (editable)
update public.services set abroad = true
 where kind = 'admin' and deleted_at is null and coalesce(system_key, '') not in ('school_list');

insert into public.settings (key, value, is_public) values ('abroad', jsonb_build_object(
  'enabled', true,
  'post_note_ar', 'يُحدَّد ثمن الإرسال بالبريد الدولي حسب البلد ونخبركم به على واتساب قبل الإرسال.',
  'post_note_fr', 'Les frais d’envoi international dépendent du pays ; nous vous les communiquons sur WhatsApp avant l’envoi.',
  'payment_note_ar', 'الأداء بالتحويل البنكي إلى حساب المكتبة بالمغرب، أو بوسيلة أخرى نتفق عليها معكم على واتساب.',
  'payment_note_fr', 'Paiement par virement sur le compte de la librairie au Maroc, ou autre moyen convenu sur WhatsApp.'), true)
on conflict (key) do nothing;

-- International-aware phone normalisation: Moroccan numbers become 212XXXXXXXXX,
-- foreign numbers keep their country code (entered with + or 00).
create or replace function public.normalize_phone(p text)
returns text language sql immutable as $$
  select case
    when (trim(coalesce(p, '')) like '+%' or regexp_replace(coalesce(p, ''), '\D', '', 'g') like '00%')
         and regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^00', '') not like '212%'
      then regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^00', '')
    else '212' || public.phone_digits(p) end
$$;

create or replace function public.customer_from_public(p_name text, p_phone text, p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  select id into v_id from customers where public.phone_digits(phone) = public.phone_digits(p_phone) and deleted_at is null limit 1;
  if v_id is null then
    insert into customers (full_name, phone, email) values (trim(p_name), public.normalize_phone(p_phone), nullif(trim(p_email), '')) returning id into v_id;
  end if;
  return v_id;
end $$;
revoke execute on function public.customer_from_public(text, text, text) from public, anon, authenticated;

-- p = {service_id, name, phone, email, fields:{}, notes, payment_method, consent:true, website:''(honeypot),
--      abroad, country, delivery_method, delivery_address}
create or replace function public.submit_service_request(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sv services;
  v_id uuid;
  v_num text;
  v_code text;
  v_abroad boolean := coalesce((p->>'abroad')::boolean, false);
  v_delivery text := nullif(p->>'delivery_method', '');
begin
  if coalesce(p->>'website', '') <> '' then raise exception 'spam'; end if;
  if not coalesce((p->>'consent')::boolean, false) then raise exception 'consent_required'; end if;
  if length(trim(coalesce(p->>'name', ''))) < 2 then raise exception 'name_required'; end if;
  if length(regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g')) < 9 then raise exception 'phone_invalid'; end if;
  select * into v_sv from services where id = (p->>'service_id')::uuid and kind = 'admin' and is_online and is_active and deleted_at is null;
  if not found then raise exception 'service_not_found'; end if;
  if v_abroad then
    if not v_sv.abroad then raise exception 'service_not_found'; end if;
    if length(trim(coalesce(p->>'country', ''))) < 2 then raise exception 'country_required'; end if;
    if v_delivery not in ('email', 'post', 'person') then v_delivery := 'email'; end if;
    if v_delivery = 'post' and length(trim(coalesce(p->>'delivery_address', ''))) < 8 then raise exception 'address_required'; end if;
    if v_delivery = 'email' and coalesce(trim(p->>'email'), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_required'; end if;
  else
    v_delivery := null;
  end if;
  perform public.public_rate_limit(p->>'phone');

  v_num := public.next_doc_number('request');
  loop
    v_code := public.random_code(8);
    exit when not exists (select 1 from service_requests where tracking_code = v_code);
  end loop;

  insert into service_requests (number, tracking_code, service_id, service_name_ar, service_name_fr, customer_id, customer_name,
                                phone, email, fields, notes, price, payment_method, consent_at,
                                abroad, country, delivery_method, delivery_address)
  values (v_num, v_code, v_sv.id, v_sv.name_ar, v_sv.name_fr, public.customer_from_public(p->>'name', p->>'phone', p->>'email'),
          trim(p->>'name'), public.normalize_phone(p->>'phone'), nullif(trim(p->>'email'), ''), coalesce(p->'fields', '{}'),
          nullif(trim(p->>'notes'), ''), v_sv.price,
          case when v_abroad or p->>'payment_method' = 'bank_transfer' then 'bank_transfer' else 'in_store' end, now(),
          v_abroad, case when v_abroad then trim(p->>'country') end, v_delivery,
          case when v_abroad and v_delivery = 'post' then trim(p->>'delivery_address') end)
  returning id into v_id;
  insert into request_history (request_id, status) values (v_id, 'received');
  perform public.notify('new_request', 'info',
                        case when v_abroad then '🌍 طلب من الخارج: ' else 'طلب خدمة جديد: ' end || v_sv.name_ar,
                        case when v_abroad then '🌍 Demande de l’étranger : ' else 'Nouvelle demande : ' end || v_sv.name_fr,
                        v_num || ' · ' || trim(p->>'name') || coalesce(' · ' || nullif(trim(p->>'country'), ''), ''), '/requests');
  return jsonb_build_object('id', v_id, 'number', v_num, 'tracking_code', v_code);
end $$;
grant execute on function public.submit_service_request(jsonb) to anon, authenticated;
