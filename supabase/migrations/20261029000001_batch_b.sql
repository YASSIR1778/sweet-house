-- =====================================================================
-- Batch B of the owner's chosen proposals:
--  37 web push notifications to staff phones / PCs
--  30 daily report every evening (push + WhatsApp when the Cloud API is on)
--   8 WhatsApp broadcast list with explicit consent and one-click unsubscribe
--   3 "My documents": every request / order of a customer in one page
-- (15 barcode lookup is an Edge Function only.)
-- =====================================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------
-- Permissions of any employee (has_perm() only knows the caller)
-- ---------------------------------------------------------------------
create or replace function public.employee_permissions(p_emp uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select case
    when e.is_owner then (select coalesce(array_agg(key), '{}') from permissions)
    else array(select unnest(coalesce(r.permissions, '{}') || e.extra_permissions) except select unnest(e.revoked_permissions))
  end
  from employees e left join roles r on r.id = e.role_id and r.deleted_at is null
  where e.id = p_emp and e.is_active and e.deleted_at is null
$$;
revoke execute on function public.employee_permissions(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 37 · Push subscriptions (one per browser / device)
-- ---------------------------------------------------------------------
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  app         text not null default 'admin' check (app in ('admin', 'pos')),
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz
);
alter table public.push_subscriptions enable row level security;
create policy push_own_read on public.push_subscriptions for select using (employee_id = public.current_employee_id());
create policy push_own_delete on public.push_subscriptions for delete using (employee_id = public.current_employee_id());

create or replace function public.push_subscribe(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.current_employee_id();
begin
  if v_emp is null then raise exception 'forbidden'; end if;
  insert into push_subscriptions (employee_id, endpoint, p256dh, auth, app, user_agent)
  values (v_emp, p->>'endpoint', p->'keys'->>'p256dh', p->'keys'->>'auth', coalesce(nullif(p->>'app', ''), 'admin'), left(p->>'user_agent', 300))
  on conflict (endpoint) do update set employee_id = excluded.employee_id, p256dh = excluded.p256dh, auth = excluded.auth,
    app = excluded.app, user_agent = excluded.user_agent;
end $$;

-- Who gets a push for each notification type
create or replace function public.push_perm_for(p_type text)
returns text language sql immutable as $$
  select case
    when p_type in ('new_request', 'new_document') then 'requests.manage'
    when p_type = 'payment_proof' then 'payments.confirm_transfer'
    when p_type in ('new_order') then 'orders.manage'
    when p_type = 'daily_report' then 'owner'
    else 'reports.sales' end
$$;

alter table public.notifications add column pushed_at timestamptz;

-- Called by the push-notify Edge Function (service role): claims the
-- notification once (so calling it twice sends nothing) and lists targets.
create or replace function public.push_claim(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  n notifications;
  v_perm text;
begin
  update notifications set pushed_at = now()
   where id = p_id and pushed_at is null and created_at > now() - interval '10 minutes'
  returning * into n;
  if not found then return null; end if;
  v_perm := public.push_perm_for(n.type);
  return jsonb_build_object(
    'notification', to_jsonb(n),
    'report_phone', case when n.type = 'daily_report' then (select value->>'phone' from settings where key = 'daily_report') end,
    'subs', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'app', s.app)), '[]')
               from push_subscriptions s join employees e on e.id = s.employee_id
              where e.is_active and e.deleted_at is null
                and (case when v_perm = 'owner' then e.is_owner else v_perm = any(public.employee_permissions(e.id)) end)));
end $$;
revoke execute on function public.push_claim(uuid) from public, anon, authenticated;
grant execute on function public.push_claim(uuid) to service_role;

-- Every new notification is pushed right away (asynchronously, via pg_net)
create or replace function public.notifications_push()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://gvvcrjxmansmmrnxdrnw.supabase.co/functions/v1/push-notify',
    body := jsonb_build_object('id', new.id),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 8000);
  return new;
exception when others then
  return new; -- never block the insert because of a push problem
end $$;
create trigger notifications_push after insert on public.notifications
  for each row execute function public.notifications_push();

-- ---------------------------------------------------------------------
-- 30 · Daily report
-- ---------------------------------------------------------------------
insert into public.settings (key, value, is_public) values
  ('daily_report', jsonb_build_object('enabled', true, 'hour', 21, 'phone', null, 'last_sent', null), false)
on conflict (key) do nothing;

create or replace function public.daily_report_text(p_day date default (now() at time zone 'Africa/Casablanca')::date)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz := (p_day::timestamp at time zone 'Africa/Casablanca');
  v_to timestamptz := ((p_day + 1)::timestamp at time zone 'Africa/Casablanca');
  v_sales bigint; v_count int; v_cogs bigint; v_refunds bigint; v_online bigint; v_exp bigint;
  v_diff bigint; v_shifts int; v_late int; v_new_req int; v_new_ord int; v_open_req int; v_low int; v_debts bigint;
  v_riyad bigint; v_top text;
  f text := 'FM999G999G990D00';
  m text := ' DH';
begin
  select coalesce(sum(total), 0), count(*) into v_sales, v_count from sales where status = 'completed' and created_at >= v_from and created_at < v_to;
  select coalesce(sum(i.unit_cost * i.qty), 0)::bigint into v_cogs from sale_items i join sales s on s.id = i.sale_id where s.status = 'completed' and s.created_at >= v_from and s.created_at < v_to;
  select coalesce(sum(total), 0) into v_refunds from refunds where created_at >= v_from and created_at < v_to;
  select coalesce((select sum(total) from online_orders where payment_status = 'paid' and paid_at >= v_from and paid_at < v_to), 0)
       + coalesce((select sum(price) from service_requests where payment_status = 'paid' and paid_via_sale is null and paid_at >= v_from and paid_at < v_to), 0) into v_online;
  select coalesce(sum(amount), 0) into v_exp from expenses where deleted_at is null and spent_on = p_day;
  select coalesce(sum(difference), 0), count(*) into v_diff, v_shifts from shifts where status = 'closed' and closed_at >= v_from and closed_at < v_to;
  v_late := public.late_requests_count();
  select count(*) into v_new_req from service_requests where created_at >= v_from and created_at < v_to;
  select count(*) into v_new_ord from online_orders where created_at >= v_from and created_at < v_to;
  select count(*) into v_open_req from service_requests r join request_statuses s on s.key = r.status where not s.is_final;
  select count(*) into v_low from product_variants v join products p on p.id = v.product_id
   where p.deleted_at is null and v.deleted_at is null and p.track_stock and v.stock_qty <= p.low_stock_alert;
  select coalesce(sum(amount), 0) into v_debts from customer_ledger;
  v_riyad := public.riyad_balance();
  select string_agg(x, '، ') into v_top from (
    select i.name_ar || ' ×' || trim(to_char(sum(i.qty), 'FM999990.###')) x
      from sale_items i join sales s on s.id = i.sale_id
     where s.status = 'completed' and s.created_at >= v_from and s.created_at < v_to
     group by i.name_ar order by sum(i.total) desc limit 3) t;

  return concat_ws(E'\n',
    '📊 تقرير يوم ' || to_char(p_day, 'DD/MM/YYYY') || ' — سويت هاوس',
    '',
    '💰 المبيعات: ' || to_char((v_sales - v_refunds) / 100.0, f) || m || ' (' || v_count || ' وصل)',
    case when v_online > 0 then '🌐 الأونلاين المدفوع: ' || to_char(v_online / 100.0, f) || m end,
    '📈 الربح الإجمالي: ' || to_char((v_sales - v_refunds - v_cogs + v_online) / 100.0, f) || m,
    case when v_exp > 0 then '🧾 مصاريف اليوم: ' || to_char(v_exp / 100.0, f) || m end,
    case when v_shifts > 0 then (case when v_diff = 0 then '✅' else '⚠️' end) || ' فرق الصندوق: ' || to_char(v_diff / 100.0, f) || m end,
    '🏦 رصيد رياض: ' || to_char(v_riyad / 100.0, f) || m,
    case when v_top is not null then '⭐ الأكثر مبيعاً: ' || v_top end,
    '',
    '📥 طلبات جديدة اليوم: ' || v_new_req || ' خدمة · ' || v_new_ord || ' متجر',
    case when v_late > 0 then '⏰ طلبات متأخرة: ' || v_late end,
    '',
    '📌 للغد:',
    '• طلبات قيد الإنجاز: ' || v_open_req,
    case when v_low > 0 then '• منتجات قريبة من النفاد: ' || v_low end,
    case when v_debts > 0 then '• ديون الزبائن: ' || to_char(v_debts / 100.0, f) || m end);
end $$;
revoke execute on function public.daily_report_text(date) from public, anon, authenticated;

-- Owner preview / manual send from the dashboard
create or replace function public.daily_report_preview(p_day date default null)
returns text language sql stable security definer set search_path = public as $$
  select public.daily_report_text(coalesce(p_day, (now() at time zone 'Africa/Casablanca')::date)) where public.is_owner()
$$;

-- Runs every hour; sends once a day at the chosen hour (Morocco time)
create or replace function public.daily_report_tick()
returns void language plpgsql security definer set search_path = public as $$
declare
  c jsonb;
  v_now timestamp := now() at time zone 'Africa/Casablanca';
begin
  select value into c from settings where key = 'daily_report';
  if c is null or not coalesce((c->>'enabled')::boolean, true) then return; end if;
  if extract(hour from v_now)::int <> coalesce((c->>'hour')::int, 21) then return; end if;
  if c->>'last_sent' = v_now::date::text then return; end if;
  update settings set value = value || jsonb_build_object('last_sent', v_now::date::text) where key = 'daily_report';
  perform public.notify('daily_report', 'info', 'تقرير اليوم', 'Rapport du jour', public.daily_report_text(v_now::date), '/reports');
end $$;
revoke execute on function public.daily_report_tick() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'sweet-house-daily-report';
select cron.schedule('sweet-house-daily-report', '0 * * * *', 'select public.daily_report_tick()');

-- ---------------------------------------------------------------------
-- 8 · Broadcast list (opt-in only)
-- ---------------------------------------------------------------------
insert into public.permissions (key, group_key, name_ar, name_fr, sort)
values ('broadcast.manage', 'customers', 'قائمة البث (رسائل جماعية)', 'Listes de diffusion', 63)
on conflict (key) do nothing;

create table public.broadcast_topics (
  id         uuid primary key default gen_random_uuid(),
  name_ar    text not null,
  name_fr    text not null,
  icon       text,
  color      text not null default '#FF6B35',
  is_active  boolean not null default true,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
insert into public.broadcast_topics (name_ar, name_fr, icon, color, sort) values
  ('مباريات التوظيف', 'Concours de recrutement', 'briefcase', '#2563EB', 1),
  ('التسجيل الجامعي والمدارس العليا', 'Inscriptions universitaires', 'graduation-cap', '#7C3AED', 2),
  ('المنحة الجامعية', 'Bourses', 'wallet', '#16A34A', 3),
  ('الدخول المدرسي', 'Rentrée scolaire', 'backpack', '#FF6B35', 4),
  ('العروض والتخفيضات', 'Promotions', 'tag', '#DC2626', 5);

create table public.broadcast_subscribers (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid references public.customers(id) on delete set null,
  name            text,
  phone           text not null unique,
  topics          uuid[] not null default '{}',
  source          text not null default 'site' check (source in ('site', 'pos', 'admin')),
  consent_at      timestamptz not null,
  unsub_code      text not null unique default public.random_code(10),
  unsubscribed_at timestamptz,
  created_at      timestamptz not null default now()
);

create table public.broadcasts (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  message    text not null,
  topics     uuid[] not null default '{}',
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);

create table public.broadcast_recipients (
  broadcast_id  uuid not null references public.broadcasts(id) on delete cascade,
  subscriber_id uuid not null references public.broadcast_subscribers(id) on delete cascade,
  phone         text not null,
  name          text,
  unsub_code    text not null,
  status        text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed')),
  sent_at       timestamptz,
  sent_by       uuid references public.employees(id),
  primary key (broadcast_id, subscriber_id)
);

alter table public.broadcast_topics enable row level security;
alter table public.broadcast_subscribers enable row level security;
alter table public.broadcasts enable row level security;
alter table public.broadcast_recipients enable row level security;
create policy topics_read on public.broadcast_topics for select using (is_active or public.has_perm('broadcast.manage'));
create policy topics_write on public.broadcast_topics for all using (public.has_perm('broadcast.manage')) with check (public.has_perm('broadcast.manage'));
create policy subs_all on public.broadcast_subscribers for all using (public.has_perm('broadcast.manage')) with check (public.has_perm('broadcast.manage'));
create policy bc_read on public.broadcasts for select using (public.has_perm('broadcast.manage'));
create policy bcr_read on public.broadcast_recipients for select using (public.has_perm('broadcast.manage'));
create policy bcr_update on public.broadcast_recipients for update using (public.has_perm('broadcast.manage')) with check (public.has_perm('broadcast.manage'));
create trigger audit_broadcast_subscribers after insert or update or delete on public.broadcast_subscribers
  for each row execute function public.audit_row();

-- Public sign-up (website). p = {name, phone, topics: [uuid], consent: true, website: ''}
create or replace function public.broadcast_subscribe(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_phone text := public.normalize_phone(p->>'phone');
  v_topics uuid[] := array(select (jsonb_array_elements_text(coalesce(p->'topics', '[]')))::uuid);
  v_row broadcast_subscribers;
begin
  if coalesce(p->>'website', '') <> '' then raise exception 'spam'; end if;
  if not coalesce((p->>'consent')::boolean, false) then raise exception 'consent_required'; end if;
  if length(regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g')) < 9 then raise exception 'phone_invalid'; end if;
  if cardinality(v_topics) = 0 then raise exception 'topics_required'; end if;
  if (select count(*) from broadcast_subscribers where created_at > now() - interval '1 minute') > 20 then raise exception 'too_many_requests'; end if;
  insert into broadcast_subscribers (customer_id, name, phone, topics, source, consent_at)
  values ((select id from customers where public.phone_digits(phone) = public.phone_digits(v_phone) and deleted_at is null limit 1),
          nullif(trim(p->>'name'), ''), v_phone, v_topics, 'site', now())
  on conflict (phone) do update set topics = excluded.topics, name = coalesce(excluded.name, broadcast_subscribers.name),
    consent_at = now(), unsubscribed_at = null
  returning * into v_row;
  return jsonb_build_object('ok', true, 'unsub_code', v_row.unsub_code);
end $$;
grant execute on function public.broadcast_subscribe(jsonb) to anon, authenticated;

-- Public: one-click unsubscribe from the link in every message
create or replace function public.broadcast_unsubscribe(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update broadcast_subscribers set unsubscribed_at = now(), topics = '{}' where unsub_code = upper(trim(p_code)) and unsubscribed_at is null;
  return found or exists (select 1 from broadcast_subscribers where unsub_code = upper(trim(p_code)));
end $$;
grant execute on function public.broadcast_unsubscribe(text) to anon, authenticated;

-- Staff: create a broadcast and freeze its recipient list
create or replace function public.broadcast_create(p_title text, p_message text, p_topics uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_perm('broadcast.manage') then raise exception 'forbidden'; end if;
  if length(trim(coalesce(p_message, ''))) < 5 then raise exception 'message_required'; end if;
  insert into broadcasts (title, message, topics, created_by)
  values (coalesce(nullif(trim(p_title), ''), left(p_message, 40)), p_message, coalesce(p_topics, '{}'), public.current_employee_id())
  returning id into v_id;
  insert into broadcast_recipients (broadcast_id, subscriber_id, phone, name, unsub_code)
  select v_id, s.id, s.phone, s.name, s.unsub_code from broadcast_subscribers s
   where s.unsubscribed_at is null and (cardinality(coalesce(p_topics, '{}')) = 0 or s.topics && p_topics);
  return v_id;
end $$;

create or replace function public.broadcasts_list()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]') from (
    select to_jsonb(b) || jsonb_build_object(
      'total', (select count(*) from broadcast_recipients r where r.broadcast_id = b.id),
      'sent', (select count(*) from broadcast_recipients r where r.broadcast_id = b.id and r.status = 'sent'),
      'author', (select full_name from employees e where e.id = b.created_by)) x
    from broadcasts b) t
  where public.has_perm('broadcast.manage')
$$;

-- ---------------------------------------------------------------------
-- 3 · "My documents": all requests and orders of the phone that owns
-- the given tracking code (code + phone prove ownership).
-- ---------------------------------------------------------------------
create or replace function public.my_documents(p_code text, p_phone text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_digits text := public.phone_digits(p_phone);
begin
  if length(v_digits) < 9 then raise exception 'not_found'; end if;
  if not exists (select 1 from service_requests where tracking_code = upper(trim(p_code)) and public.phone_digits(phone) = v_digits)
     and not exists (select 1 from online_orders where tracking_code = upper(trim(p_code)) and public.phone_digits(phone) = v_digits) then
    raise exception 'not_found';
  end if;
  return jsonb_build_object(
    'name', (select customer_name from service_requests where public.phone_digits(phone) = v_digits order by created_at desc limit 1),
    'requests', (select coalesce(jsonb_agg(jsonb_build_object(
        'number', r.number, 'tracking_code', r.tracking_code, 'service_name_ar', r.service_name_ar, 'service_name_fr', r.service_name_fr,
        'created_at', r.created_at, 'price', r.price, 'payment_status', r.payment_status,
        'status', jsonb_build_object('key', s.key, 'name_ar', s.name_ar, 'name_fr', s.name_fr, 'color', s.color, 'is_final', s.is_final),
        'ready_files', case when s.allow_download and (r.payment_status = 'paid' or r.price = 0)
                         then (select count(*) from request_files f where f.request_id = r.id and f.kind = 'deliverable' and f.deleted_at is null) else 0 end)
        order by r.created_at desc), '[]')
      from service_requests r join request_statuses s on s.key = r.status where public.phone_digits(r.phone) = v_digits),
    'orders', (select coalesce(jsonb_agg(jsonb_build_object('number', o.number, 'tracking_code', o.tracking_code, 'total', o.total,
        'status', o.status, 'payment_status', o.payment_status, 'created_at', o.created_at) order by o.created_at desc), '[]')
      from online_orders o where public.phone_digits(o.phone) = v_digits));
end $$;
grant execute on function public.my_documents(text, text) to anon, authenticated;
