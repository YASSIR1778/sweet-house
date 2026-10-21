-- =====================================================================
-- Who is in charge of each service request / shop order.
--  · claim     : an employee takes an unassigned task ("أتكلف بها")
--  · assign    : a manager gives the task to someone (perm tasks.assign)
--  · handover  : the person in charge passes it to a colleague, with a reason
--  · release   : the person in charge puts it back in the common list, with a reason
-- Every move is logged; the new person in charge gets a notification.
-- Changing the status of a task held by someone else needs tasks.assign;
-- touching an unassigned task makes you its owner automatically.
-- =====================================================================

insert into public.permissions (key, group_key, name_ar, name_fr, sort)
values ('tasks.assign', 'orders', 'توزيع الطلبات على الموظفين', 'Attribuer les demandes et commandes', 74)
on conflict (key) do nothing;
update public.roles set permissions = array_append(permissions, 'tasks.assign')
 where name_fr = 'Gérant' and not ('tasks.assign' = any(permissions));

alter table public.online_orders add column assigned_to uuid references public.employees(id);
alter table public.service_requests add column assigned_at timestamptz;
alter table public.online_orders add column assigned_at timestamptz;

create table public.task_assignments (
  id          bigint generated always as identity primary key,
  entity      text not null check (entity in ('request', 'order')),
  entity_id   uuid not null,
  action      text not null check (action in ('claim', 'assign', 'handover', 'release')),
  from_emp    uuid references public.employees(id),
  to_emp      uuid references public.employees(id),
  reason      text,
  by_emp      uuid references public.employees(id),
  created_at  timestamptz not null default now()
);
create index task_assignments_entity_idx on public.task_assignments (entity, entity_id, created_at);
alter table public.task_assignments enable row level security;
create policy task_assignments_read on public.task_assignments for select using (public.is_staff());

-- Targeted notifications (only the new person in charge gets the push)
alter table public.notifications add column target_employee uuid references public.employees(id) on delete cascade;
drop policy if exists notifications_read on public.notifications;
drop policy if exists notifications_update on public.notifications;
create policy notifications_read on public.notifications for select
  using (public.has_perm('reports.sales') or public.is_owner() or target_employee = public.current_employee_id());
create policy notifications_update on public.notifications for update
  using (public.has_perm('reports.sales') or public.is_owner() or target_employee = public.current_employee_id());

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
                and case
                      when n.target_employee is not null then e.id = n.target_employee
                      when v_perm = 'owner' then e.is_owner
                      else v_perm = any(public.employee_permissions(e.id)) end));
end $$;
revoke execute on function public.push_claim(uuid) from public, anon, authenticated;
grant execute on function public.push_claim(uuid) to service_role;

-- Employees who can work on requests / orders (for the assign menu)
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
                         union all select assigned_to, assigned_at from online_orders where p_entity = 'order' and id = p_id) x
                   join employees e on e.id = x.assigned_to),
    'log', (select coalesce(jsonb_agg(jsonb_build_object('action', a.action, 'reason', a.reason, 'created_at', a.created_at,
                     'from_name', f.full_name, 'to_name', t.full_name, 'by_name', b.full_name) order by a.created_at), '[]')
              from task_assignments a left join employees f on f.id = a.from_emp left join employees t on t.id = a.to_emp
              left join employees b on b.id = a.by_emp
             where a.entity = p_entity and a.entity_id = p_id))
  where public.is_staff()
$$;

-- Core: move a task between people
create or replace function public.assign_task(p_entity text, p_id uuid, p_action text, p_to uuid default null, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.current_employee_id();
  v_perm text := case when p_entity = 'order' then 'orders.manage' else 'requests.manage' end;
  v_cur uuid;
  v_num text;
  v_to uuid;
  v_label text;
begin
  if v_me is null or not public.has_perm(v_perm) then raise exception 'forbidden'; end if;
  if p_entity = 'request' then
    select assigned_to, number into v_cur, v_num from service_requests where id = p_id for update;
  elsif p_entity = 'order' then
    select assigned_to, number into v_cur, v_num from online_orders where id = p_id for update;
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
  else
    update online_orders set assigned_to = v_to, assigned_at = case when v_to is null then null else now() end where id = p_id;
  end if;
  insert into task_assignments (entity, entity_id, action, from_emp, to_emp, reason, by_emp)
  values (p_entity, p_id, p_action, v_cur, v_to, nullif(trim(p_reason), ''), v_me);

  v_label := case when p_entity = 'order' then 'طلبية المتجر ' else 'الطلب ' end || v_num;
  if v_to is not null and v_to <> v_me then
    insert into notifications (type, severity, title_ar, title_fr, body, link, target_employee)
    values ('task_assigned', 'info',
            case when p_action = 'handover' then 'سُلِّم إليك ' else 'أصبحت مسؤولاً عن ' end || v_label,
            'Vous êtes responsable de ' || v_num,
            (select full_name from employees where id = v_me) || coalesce(' · ' || nullif(trim(p_reason), ''), ''),
            case when p_entity = 'order' then '/orders' else '/requests' end, v_to);
  elsif v_to is null then
    perform public.notify('task_released', 'warning', 'أُعيد إلى القائمة بدون مسؤول: ' || v_label, 'Remis sans responsable : ' || v_num,
                          (select full_name from employees where id = v_me) || ' · ' || trim(p_reason),
                          case when p_entity = 'order' then '/orders' else '/requests' end);
  end if;
  perform public.log_activity('custom', case when p_entity = 'order' then 'orders' else 'requests' end, p_id::text, v_num,
                              jsonb_build_object('assignment', p_action, 'to', v_to));
  return public.task_assignment(p_entity, p_id);
end $$;

-- Guard used by status changes
create or replace function public.task_guard(p_entity text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.current_employee_id();
  v_cur uuid;
begin
  if p_entity = 'request' then select assigned_to into v_cur from service_requests where id = p_id;
  else select assigned_to into v_cur from online_orders where id = p_id; end if;
  if v_cur is null then
    -- first person to act becomes responsible
    if p_entity = 'request' then update service_requests set assigned_to = v_me, assigned_at = now() where id = p_id;
    else update online_orders set assigned_to = v_me, assigned_at = now() where id = p_id; end if;
    insert into task_assignments (entity, entity_id, action, to_emp, by_emp) values (p_entity, p_id, 'claim', v_me, v_me);
  elsif v_cur <> v_me and not public.has_perm('tasks.assign') then
    raise exception 'assigned_to_other';
  end if;
end $$;
revoke execute on function public.task_guard(text, uuid) from public, anon, authenticated;

create or replace function public.set_request_status(p_id uuid, p_status text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('requests.manage') then raise exception 'forbidden'; end if;
  if not exists (select 1 from request_statuses where key = p_status) then raise exception 'invalid_status'; end if;
  if not exists (select 1 from service_requests where id = p_id) then raise exception 'not_found'; end if;
  perform public.task_guard('request', p_id);
  update service_requests set status = p_status where id = p_id;
  insert into request_history (request_id, status, note, employee_id) values (p_id, p_status, p_note, public.current_employee_id());
  perform public.log_activity('custom', 'requests', p_id::text, (select number from service_requests where id = p_id), jsonb_build_object('status', p_status));
  return public.request_detail(p_id);
end $$;

create or replace function public.set_order_status(p_id uuid, p_status text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_o online_orders;
begin
  if not public.has_perm('orders.manage') then raise exception 'forbidden'; end if;
  select * into v_o from online_orders where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_o.status in ('delivered', 'cancelled') then raise exception 'order_closed'; end if;
  if p_status not in ('confirmed', 'preparing', 'shipped', 'ready', 'delivered', 'cancelled') then raise exception 'invalid_status'; end if;
  perform public.task_guard('order', p_id);

  if p_status <> 'cancelled' and not v_o.stock_applied then
    insert into stock_movements (variant_id, qty_change, reason, ref_id, employee_id)
    select i.variant_id, -i.qty, 'online_order', p_id, public.current_employee_id()
      from online_order_items i join products p on p.id = i.product_id where i.order_id = p_id and p.track_stock;
    update online_orders set stock_applied = true where id = p_id;
  elsif p_status = 'cancelled' and v_o.stock_applied then
    insert into stock_movements (variant_id, qty_change, reason, ref_id, employee_id)
    select i.variant_id, i.qty, 'online_cancel', p_id, public.current_employee_id()
      from online_order_items i join products p on p.id = i.product_id where i.order_id = p_id and p.track_stock;
    update online_orders set stock_applied = false where id = p_id;
  end if;

  update online_orders set status = p_status where id = p_id;
  insert into order_history (order_id, status, note, employee_id) values (p_id, p_status, p_note, public.current_employee_id());
  perform public.log_activity('custom', 'orders', p_id::text, v_o.number, jsonb_build_object('status', p_status));
  return public.order_detail(p_id);
end $$;

-- Lists: who holds each task
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
              and now() > r.created_at + make_interval(hours => sv.target_hours)
              and public.request_done_at(r.id) is null,
      'assignee', case when ae.id is not null then jsonb_build_object('id', ae.id, 'full_name', ae.full_name, 'color', ae.color) end) x
    from service_requests r
    join request_statuses st on st.key = r.status
    left join services sv on sv.id = r.service_id
    left join employees ae on ae.id = r.assigned_to
    order by r.created_at desc limit p_limit) t
  where public.has_perm('requests.manage') or public.has_perm('requests.view_documents')
$$;

-- Today's tasks: my tasks + tasks nobody took
create or replace function public.my_tasks_summary()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'mine_requests', (select count(*) from service_requests r join request_statuses s on s.key = r.status
                       where r.assigned_to = public.current_employee_id() and not s.is_final),
    'mine_orders', (select count(*) from online_orders where assigned_to = public.current_employee_id() and status not in ('delivered', 'cancelled')),
    'free_requests', case when public.has_perm('requests.manage') then (select count(*) from service_requests r join request_statuses s on s.key = r.status
                       where r.assigned_to is null and not s.is_final) end,
    'free_orders', case when public.has_perm('orders.manage') then (select count(*) from online_orders where assigned_to is null and status not in ('delivered', 'cancelled')) end)
  where public.is_staff()
$$;
