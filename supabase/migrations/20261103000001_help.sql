-- =====================================================================
-- Help for customers stuck on a service page.
--  1. "Need help?" bar: WhatsApp with context (click logged) or "call me back"
--  2. Help requests in dashboard / POS: claim, hand over, response time, reminders
--  3. "We fill it for you": staff creates the request, customer gets a link
--     to upload documents and follow it
--  + per-field hints (inside services.fields) and per-service FAQ
-- =====================================================================

insert into public.settings (key, value, is_public) values
  ('help', jsonb_build_object('enabled', true, 'alert_minutes', 15), true)
on conflict (key) do nothing;

alter table public.services add column faq jsonb not null default '[]'::jsonb; -- [{q_ar,q_fr,a_ar,a_fr}]
alter table public.service_requests add column created_by_staff uuid references public.employees(id),
                                    add column help_id uuid;

create table public.help_requests (
  id                uuid primary key default gen_random_uuid(),
  service_id        uuid references public.services(id) on delete set null,
  service_name_ar   text,
  service_name_fr   text,
  name              text,
  phone             text not null,
  question          text,
  step              text,
  status            text not null default 'new' check (status in ('new', 'in_progress', 'done', 'cancelled')),
  assigned_to       uuid references public.employees(id),
  assigned_at       timestamptz,
  first_response_at timestamptz,
  responded_by      uuid references public.employees(id),
  resolved_at       timestamptz,
  request_id        uuid references public.service_requests(id) on delete set null,
  reminded_at       timestamptz,
  created_at        timestamptz not null default now()
);
create index help_requests_created_idx on public.help_requests (created_at desc);
alter table public.help_requests enable row level security;
create policy help_read on public.help_requests for select using (public.has_perm('requests.manage'));

-- WhatsApp clicks (to measure how many asked for help)
create table public.help_clicks (
  id         bigint generated always as identity primary key,
  service_id uuid references public.services(id) on delete set null,
  step       text,
  created_at timestamptz not null default now()
);
alter table public.help_clicks enable row level security;
create policy help_clicks_read on public.help_clicks for select using (public.has_perm('reports.sales'));

create or replace function public.log_help_click(p_service uuid, p_step text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from help_clicks where created_at > now() - interval '1 minute') > 60 then return; end if;
  insert into help_clicks (service_id, step) values (p_service, left(p_step, 40));
end $$;
grant execute on function public.log_help_click(uuid, text) to anon, authenticated;

-- Public: "call me back". p = {service_id, name, phone, question, step, website(honeypot)}
create or replace function public.submit_help_request(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sv services;
  v_id uuid;
begin
  if coalesce(p->>'website', '') <> '' then raise exception 'spam'; end if;
  if length(regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g')) < 9 then raise exception 'phone_invalid'; end if;
  perform public.public_rate_limit(p->>'phone');
  if (select count(*) from help_requests where public.phone_digits(phone) = public.phone_digits(p->>'phone') and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'too_many_requests';
  end if;
  select * into v_sv from services where id = nullif(p->>'service_id', '')::uuid;
  insert into help_requests (service_id, service_name_ar, service_name_fr, name, phone, question, step)
  values (v_sv.id, v_sv.name_ar, v_sv.name_fr, nullif(left(trim(p->>'name'), 80), ''), public.normalize_phone(p->>'phone'),
          nullif(left(trim(p->>'question'), 500), ''), left(p->>'step', 40))
  returning id into v_id;
  perform public.notify('help_request', 'warning', '🙋 زبون يطلب المساعدة' || coalesce(': ' || v_sv.name_ar, ''),
                        'Un client demande de l’aide' || coalesce(' : ' || v_sv.name_fr, ''),
                        coalesce(nullif(trim(p->>'name'), '') || ' · ', '') || coalesce(left(trim(p->>'question'), 120), ''), '/help');
  return jsonb_build_object('id', v_id);
end $$;
grant execute on function public.submit_help_request(jsonb) to anon, authenticated;

create or replace function public.push_perm_for(p_type text)
returns text language sql immutable as $$
  select case
    when p_type in ('new_request', 'new_document', 'help_request', 'help_late') then 'requests.manage'
    when p_type = 'payment_proof' then 'payments.confirm_transfer'
    when p_type in ('new_order') then 'orders.manage'
    when p_type = 'daily_report' then 'owner'
    else 'reports.sales' end
$$;

create or replace function public.help_list()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(h) || jsonb_build_object(
      'assignee', case when e.id is not null then jsonb_build_object('id', e.id, 'full_name', e.full_name, 'color', e.color) end,
      'late', h.status = 'new' and h.first_response_at is null
              and h.created_at < now() - make_interval(mins => coalesce((select (value->>'alert_minutes')::int from settings where key = 'help'), 15)),
      'request_number', (select number from service_requests r where r.id = h.request_id),
      'request_code', (select tracking_code from service_requests r where r.id = h.request_id))
    order by (h.status in ('new', 'in_progress')) desc, h.created_at desc), '[]')
  from (select * from help_requests order by created_at desc limit 500) h
  left join employees e on e.id = h.assigned_to
  where public.has_perm('requests.manage')
$$;

-- Staff touched the customer (call / WhatsApp): starts the response clock
create or replace function public.help_contacted(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.current_employee_id();
begin
  if not public.has_perm('requests.manage') then raise exception 'forbidden'; end if;
  perform public.task_guard('help', p_id);
  update help_requests set first_response_at = coalesce(first_response_at, now()), responded_by = coalesce(responded_by, v_me),
    status = case when status = 'new' then 'in_progress' else status end where id = p_id;
end $$;

create or replace function public.help_set_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('requests.manage') then raise exception 'forbidden'; end if;
  if p_status not in ('new', 'in_progress', 'done', 'cancelled') then raise exception 'invalid_status'; end if;
  perform public.task_guard('help', p_id);
  update help_requests set status = p_status,
    first_response_at = case when p_status in ('in_progress', 'done') then coalesce(first_response_at, now()) else first_response_at end,
    responded_by = case when p_status in ('in_progress', 'done') then coalesce(responded_by, public.current_employee_id()) else responded_by end,
    resolved_at = case when p_status in ('done', 'cancelled') then now() else null end
  where id = p_id;
end $$;

-- Reminder every 5 minutes for help requests nobody answered
create or replace function public.help_reminders()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_min int := coalesce((select (value->>'alert_minutes')::int from settings where key = 'help'), 15);
  h record;
begin
  for h in select * from help_requests where status = 'new' and first_response_at is null and reminded_at is null
             and created_at < now() - make_interval(mins => v_min) loop
    update help_requests set reminded_at = now() where id = h.id;
    insert into notifications (type, severity, title_ar, title_fr, body, link, target_employee)
    values ('help_late', 'danger', '⏰ زبون ينتظر المساعدة منذ ' || v_min || ' دقيقة', 'Client en attente d’aide',
            coalesce(h.name || ' · ', '') || coalesce(h.service_name_ar, '') , '/help', h.assigned_to);
  end loop;
end $$;
revoke execute on function public.help_reminders() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'sweet-house-help-reminders';
select cron.schedule('sweet-house-help-reminders', '*/5 * * * *', 'select public.help_reminders()');

-- ---------------------------------------------------------------------
-- Assignment: help requests use the same claim / hand-over system
-- ---------------------------------------------------------------------
alter table public.task_assignments drop constraint task_assignments_entity_check;
alter table public.task_assignments add constraint task_assignments_entity_check check (entity in ('request', 'order', 'help'));

create or replace function public.task_assignees(p_entity text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'full_name', e.full_name, 'color', e.color, 'avatar_url', e.avatar_url) order by e.full_name), '[]')
    from employees e
   where e.is_active and e.deleted_at is null
     and (case when p_entity = 'order' then 'orders.manage' else 'requests.manage' end) = any(public.employee_permissions(e.id))
     and public.is_staff()
$$;

create or replace function public.task_assignment(p_entity text, p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'assignee', (select jsonb_build_object('id', e.id, 'full_name', e.full_name, 'color', e.color, 'since', x.assigned_at)
                   from (select assigned_to, assigned_at from service_requests where p_entity = 'request' and id = p_id
                         union all select assigned_to, assigned_at from online_orders where p_entity = 'order' and id = p_id
                         union all select assigned_to, assigned_at from help_requests where p_entity = 'help' and id = p_id) x
                   join employees e on e.id = x.assigned_to),
    'log', (select coalesce(jsonb_agg(jsonb_build_object('action', a.action, 'reason', a.reason, 'created_at', a.created_at,
                     'from_name', f.full_name, 'to_name', t.full_name, 'by_name', b.full_name) order by a.created_at), '[]')
              from task_assignments a left join employees f on f.id = a.from_emp left join employees t on t.id = a.to_emp
              left join employees b on b.id = a.by_emp
             where a.entity = p_entity and a.entity_id = p_id))
  where public.is_staff()
$$;

create or replace function public.task_guard(p_entity text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.current_employee_id();
  v_cur uuid;
begin
  if p_entity = 'request' then select assigned_to into v_cur from service_requests where id = p_id;
  elsif p_entity = 'order' then select assigned_to into v_cur from online_orders where id = p_id;
  else select assigned_to into v_cur from help_requests where id = p_id; end if;
  if v_cur is null then
    if p_entity = 'request' then update service_requests set assigned_to = v_me, assigned_at = now() where id = p_id;
    elsif p_entity = 'order' then update online_orders set assigned_to = v_me, assigned_at = now() where id = p_id;
    else update help_requests set assigned_to = v_me, assigned_at = now() where id = p_id; end if;
    insert into task_assignments (entity, entity_id, action, to_emp, by_emp) values (p_entity, p_id, 'claim', v_me, v_me);
  elsif v_cur <> v_me and not public.has_perm('tasks.assign') then
    raise exception 'assigned_to_other';
  end if;
end $$;
revoke execute on function public.task_guard(text, uuid) from public, anon, authenticated;

create or replace function public.assign_task(p_entity text, p_id uuid, p_action text, p_to uuid default null, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.current_employee_id();
  v_perm text := case when p_entity = 'order' then 'orders.manage' else 'requests.manage' end;
  v_cur uuid;
  v_num text;
  v_to uuid;
  v_label text;
  v_link text := case p_entity when 'order' then '/orders' when 'help' then '/help' else '/requests' end;
begin
  if v_me is null or not public.has_perm(v_perm) then raise exception 'forbidden'; end if;
  if p_entity = 'request' then
    select assigned_to, number into v_cur, v_num from service_requests where id = p_id for update;
  elsif p_entity = 'order' then
    select assigned_to, number into v_cur, v_num from online_orders where id = p_id for update;
  elsif p_entity = 'help' then
    select assigned_to, coalesce(name, phone) into v_cur, v_num from help_requests where id = p_id for update;
  else
    raise exception 'invalid_entity';
  end if;
  if v_num is null then raise exception 'not_found'; end if;

  if p_action = 'claim' then
    if v_cur = v_me then return public.task_assignment(p_entity, p_id); end if;
    if v_cur is not null and not public.has_perm('tasks.assign') then raise exception 'assigned_to_other'; end if;
    v_to := v_me;
  elsif p_action = 'assign' then
    if not public.has_perm('tasks.assign') then raise exception 'forbidden'; end if;
    v_to := p_to;
  elsif p_action = 'handover' then
    if v_cur is distinct from v_me and not public.has_perm('tasks.assign') then raise exception 'not_your_task'; end if;
    if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;
    v_to := p_to;
  elsif p_action = 'release' then
    if v_cur is distinct from v_me and not public.has_perm('tasks.assign') then raise exception 'not_your_task'; end if;
    if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;
    v_to := null;
  else
    raise exception 'invalid_action';
  end if;

  if p_action in ('assign', 'handover') then
    if v_to is null or v_to = v_cur then raise exception 'invalid_assignee'; end if;
    if not exists (select 1 from employees where id = v_to and is_active and deleted_at is null and v_perm = any(public.employee_permissions(id))) then
      raise exception 'invalid_assignee';
    end if;
  end if;

  if p_entity = 'request' then
    update service_requests set assigned_to = v_to, assigned_at = case when v_to is null then null else now() end where id = p_id;
  elsif p_entity = 'order' then
    update online_orders set assigned_to = v_to, assigned_at = case when v_to is null then null else now() end where id = p_id;
  else
    update help_requests set assigned_to = v_to, assigned_at = case when v_to is null then null else now() end where id = p_id;
  end if;
  insert into task_assignments (entity, entity_id, action, from_emp, to_emp, reason, by_emp)
  values (p_entity, p_id, p_action, v_cur, v_to, nullif(trim(p_reason), ''), v_me);

  v_label := case p_entity when 'order' then 'طلبية المتجر ' when 'help' then 'طلب المساعدة من ' else 'الطلب ' end || v_num;
  if v_to is not null and v_to <> v_me then
    insert into notifications (type, severity, title_ar, title_fr, body, link, target_employee)
    values ('task_assigned', 'info',
            case when p_action = 'handover' then 'سُلِّم إليك ' else 'أصبحت مسؤولاً عن ' end || v_label,
            'Vous êtes responsable de ' || v_num,
            (select full_name from employees where id = v_me) || coalesce(' · ' || nullif(trim(p_reason), ''), ''), v_link, v_to);
  elsif v_to is null then
    perform public.notify('task_released', 'warning', 'أُعيد إلى القائمة بدون مسؤول: ' || v_label, 'Remis sans responsable : ' || v_num,
                          (select full_name from employees where id = v_me) || ' · ' || trim(p_reason), v_link);
  end if;
  return public.task_assignment(p_entity, p_id);
end $$;

-- ---------------------------------------------------------------------
-- 3 · Staff fills the request for the customer
-- p = {service_id, name, phone, email, fields, notes, price, consent, help_id}
-- ---------------------------------------------------------------------
create or replace function public.staff_create_request(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.current_employee_id();
  v_sv services;
  v_id uuid;
  v_num text;
  v_code text;
  v_help uuid := nullif(p->>'help_id', '')::uuid;
begin
  if v_me is null or not public.has_perm('requests.manage') then raise exception 'forbidden'; end if;
  if not coalesce((p->>'consent')::boolean, false) then raise exception 'consent_required'; end if;
  if length(trim(coalesce(p->>'name', ''))) < 2 then raise exception 'name_required'; end if;
  if length(regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g')) < 9 then raise exception 'phone_invalid'; end if;
  select * into v_sv from services where id = (p->>'service_id')::uuid and kind = 'admin' and deleted_at is null;
  if not found then raise exception 'service_not_found'; end if;

  v_num := public.next_doc_number('request');
  loop
    v_code := public.random_code(8);
    exit when not exists (select 1 from service_requests where tracking_code = v_code);
  end loop;
  insert into service_requests (number, tracking_code, service_id, service_name_ar, service_name_fr, customer_id, customer_name,
                                phone, email, fields, notes, price, payment_method, consent_at, assigned_to, assigned_at, created_by_staff, help_id)
  values (v_num, v_code, v_sv.id, v_sv.name_ar, v_sv.name_fr, public.customer_from_public(p->>'name', p->>'phone', p->>'email'),
          trim(p->>'name'), public.normalize_phone(p->>'phone'), nullif(trim(p->>'email'), ''), coalesce(p->'fields', '{}'),
          nullif(trim(p->>'notes'), ''), coalesce(nullif(p->>'price', '')::bigint, v_sv.price), 'in_store', now(), v_me, now(), v_me, v_help)
  returning id into v_id;
  insert into request_history (request_id, status, note, employee_id) values (v_id, 'received', 'staff_created', v_me);
  insert into task_assignments (entity, entity_id, action, to_emp, by_emp) values ('request', v_id, 'claim', v_me, v_me);
  if v_help is not null then
    update help_requests set request_id = v_id, status = 'done', resolved_at = now(),
      first_response_at = coalesce(first_response_at, now()), responded_by = coalesce(responded_by, v_me) where id = v_help;
  end if;
  return jsonb_build_object('id', v_id, 'number', v_num, 'tracking_code', v_code, 'phone', public.normalize_phone(p->>'phone'));
end $$;

-- ---------------------------------------------------------------------
-- Report: how many asked, how many finished, which services confuse people
-- ---------------------------------------------------------------------
create or replace function public.help_report(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'whatsapp_clicks', (select count(*) from help_clicks where created_at >= p_from and created_at < p_to),
    'callbacks', (select count(*) from help_requests where created_at >= p_from and created_at < p_to),
    'converted', (select count(*) from help_requests h where h.created_at >= p_from and h.created_at < p_to
                    and (h.request_id is not null or exists (select 1 from service_requests r where public.phone_digits(r.phone) = public.phone_digits(h.phone)
                                                              and r.created_at between h.created_at and h.created_at + interval '3 days'))),
    'avg_response_min', (select round(avg(extract(epoch from first_response_at - created_at) / 60)::numeric, 0) from help_requests
                           where first_response_at is not null and created_at >= p_from and created_at < p_to),
    'staff_created', (select count(*) from service_requests where created_by_staff is not null and created_at >= p_from and created_at < p_to),
    'by_service', (select coalesce(jsonb_agg(t order by t.total desc), '[]') from (
        select coalesce(s.name_ar, '—') name_ar, coalesce(s.name_fr, '—') name_fr,
               count(*) total, count(*) filter (where x.kind = 'wa') whatsapp, count(*) filter (where x.kind = 'cb') callbacks
          from (select service_id, 'wa' kind from help_clicks where created_at >= p_from and created_at < p_to
                union all select service_id, 'cb' from help_requests where created_at >= p_from and created_at < p_to) x
          left join services s on s.id = x.service_id group by 1, 2 limit 10) t),
    'by_step', (select coalesce(jsonb_object_agg(step, n), '{}') from (
        select coalesce(step, 'start') step, count(*) n from (
          select step from help_clicks where created_at >= p_from and created_at < p_to
          union all select step from help_requests where created_at >= p_from and created_at < p_to) y group by 1) z),
    'by_employee', (select coalesce(jsonb_agg(t order by t.handled desc), '[]') from (
        select e.full_name, e.color, count(*) handled,
               round(avg(extract(epoch from h.first_response_at - h.created_at) / 60)::numeric, 0) avg_min
          from help_requests h join employees e on e.id = h.responded_by
         where h.created_at >= p_from and h.created_at < p_to group by e.full_name, e.color) t))
  where public.has_perm('reports.sales') or public.has_perm('requests.manage')
$$;

-- Today's tasks: waiting help
create or replace function public.help_counts()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'new', (select count(*) from help_requests where status = 'new'),
    'late', (select count(*) from help_requests where status = 'new' and first_response_at is null
               and created_at < now() - make_interval(mins => coalesce((select (value->>'alert_minutes')::int from settings where key = 'help'), 15))),
    'mine', (select count(*) from help_requests where assigned_to = public.current_employee_id() and status in ('new', 'in_progress')))
  where public.has_perm('requests.manage')
$$;

-- save_service also stores the per-service FAQ
create or replace function public.save_service(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  sid uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
  t jsonb;
begin
  if not public.has_perm('services.manage') then raise exception 'forbidden'; end if;
  insert into services (id, category_id, kind, name_ar, name_fr, description_ar, description_fr,
                        pricing_mode, price, unit_ar, unit_fr, tax_rate, icon, image_url, pos_quick, pos_color,
                        pos_sort, is_online, duration_ar, duration_fr, official_url, required_documents,
                        fields, sort, is_active, target_hours, abroad, faq)
  values (sid, nullif(p->>'category_id', '')::uuid, coalesce(p->>'kind', 'counter'), p->>'name_ar',
          coalesce(nullif(p->>'name_fr', ''), p->>'name_ar'), p->>'description_ar', p->>'description_fr',
          coalesce(p->>'pricing_mode', 'fixed'), coalesce((p->>'price')::bigint, 0), p->>'unit_ar', p->>'unit_fr',
          coalesce((p->>'tax_rate')::numeric, 20), p->>'icon', p->>'image_url',
          coalesce((p->>'pos_quick')::boolean, false), p->>'pos_color', coalesce((p->>'pos_sort')::int, 0),
          coalesce((p->>'is_online')::boolean, true), p->>'duration_ar', p->>'duration_fr', p->>'official_url',
          coalesce(p->'required_documents', '[]'), coalesce(p->'fields', '[]'),
          coalesce((p->>'sort')::int, 0), coalesce((p->>'is_active')::boolean, true),
          nullif(p->>'target_hours', '')::int, coalesce((p->>'abroad')::boolean, false), coalesce(p->'faq', '[]'))
  on conflict (id) do update set
    category_id = excluded.category_id, kind = excluded.kind, name_ar = excluded.name_ar,
    name_fr = excluded.name_fr, description_ar = excluded.description_ar, description_fr = excluded.description_fr,
    pricing_mode = case when services.system_key is null then excluded.pricing_mode else services.pricing_mode end,
    price = excluded.price, unit_ar = excluded.unit_ar, unit_fr = excluded.unit_fr, tax_rate = excluded.tax_rate,
    icon = excluded.icon, image_url = excluded.image_url, pos_quick = excluded.pos_quick,
    pos_color = excluded.pos_color, pos_sort = excluded.pos_sort, is_online = excluded.is_online,
    duration_ar = excluded.duration_ar, duration_fr = excluded.duration_fr, official_url = excluded.official_url,
    required_documents = excluded.required_documents, fields = excluded.fields, sort = excluded.sort,
    is_active = excluded.is_active, target_hours = excluded.target_hours, abroad = excluded.abroad, faq = excluded.faq;

  delete from service_price_tiers where service_id = sid;
  for t in select * from jsonb_array_elements(coalesce(p->'tiers', '[]')) loop
    insert into service_price_tiers (service_id, min_qty, unit_price)
    values (sid, (t->>'min_qty')::numeric, (t->>'unit_price')::bigint)
    on conflict do nothing;
  end loop;
  if p ? 'guide' and jsonb_typeof(p->'guide') = 'object' then
    insert into service_guides (service_id, steps_ar, tips_ar, links, images, updated_by)
    values (sid, nullif(trim(p->'guide'->>'steps_ar'), ''), nullif(trim(p->'guide'->>'tips_ar'), ''),
            coalesce(p->'guide'->'links', '[]'), coalesce(p->'guide'->'images', '[]'), public.current_employee_id())
    on conflict (service_id) do update set steps_ar = excluded.steps_ar, tips_ar = excluded.tips_ar,
      links = excluded.links, images = excluded.images, updated_by = excluded.updated_by;
  end if;
  return sid;
end $$;
