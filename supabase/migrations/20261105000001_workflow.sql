-- =====================================================================
-- Staff workflow inside each service request
--  1 step-by-step checklist (progress saved on the request)
--  2 one button per official link (per step)
--  3 copy panel in the portal's order (service fields order)
--  4 mandatory completion reference: portal number, code, screenshot
--  5 short video per service
--  6 "I'm stuck" button with reasons, owner alert and report
--  7 guide improvement suggestions from staff
--  8 WhatsApp message templates per service
-- =====================================================================

-- Guide: structured steps, video, message templates, reference rules
alter table public.service_guides
  add column steps jsonb not null default '[]'::jsonb,       -- [{title, url, url_label, required}]
  add column video_url text,
  add column templates jsonb not null default '[]'::jsonb,   -- [{label, text}]
  add column require_ref boolean not null default true,       -- portal number needed before "ready"
  add column require_proof boolean not null default false;    -- screenshot needed before "ready"

-- Existing free-text steps become checklist steps
update public.service_guides g set steps = coalesce((
  select jsonb_agg(jsonb_build_object('title', regexp_replace(trim(l), '^\d+[.)-]\s*', ''), 'url', null, 'url_label', null, 'required', true) order by n)
    from unnest(string_to_array(coalesce(g.steps_ar, ''), E'\n')) with ordinality as x(l, n)
   where trim(l) <> ''), '[]'::jsonb)
 where jsonb_array_length(g.steps) = 0;

-- Per-request progress and completion reference
alter table public.service_requests
  add column progress     jsonb not null default '{}'::jsonb,  -- {"0": {"at":..., "by":..., "name":...}}
  add column portal_ref   text,
  add column portal_code  text,
  add column blocked_reason text,
  add column blocked_note text,
  add column blocked_at   timestamptz;

alter table public.request_files drop constraint request_files_kind_check;
alter table public.request_files add constraint request_files_kind_check check (kind in ('upload', 'deliverable', 'payment_proof', 'portal_proof'));

-- Tick / untick a step
create or replace function public.request_step(p_id uuid, p_index int, p_done boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.current_employee_id();
begin
  if not public.has_perm('requests.manage') then raise exception 'forbidden'; end if;
  perform public.task_guard('request', p_id);
  update service_requests set progress = case when p_done
      then progress || jsonb_build_object(p_index::text, jsonb_build_object('at', now(), 'by', v_me, 'name', (select full_name from employees where id = v_me)))
      else progress - p_index::text end
   where id = p_id;
  return (select progress from service_requests where id = p_id);
end $$;

create or replace function public.request_set_ref(p_id uuid, p_ref text, p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('requests.manage') then raise exception 'forbidden'; end if;
  perform public.task_guard('request', p_id);
  update service_requests set portal_ref = nullif(trim(p_ref), ''), portal_code = nullif(trim(p_code), '') where id = p_id;
end $$;

-- "I'm stuck"
create or replace function public.request_blocked(p_id uuid, p_reason text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.current_employee_id();
  v_r service_requests;
  v_label text := case p_reason when 'portal_down' then 'البوابة الرسمية لا تعمل' when 'missing_info' then 'معلومة أو وثيقة ناقصة من الزبون'
                    when 'rejected' then 'رفض من الإدارة' when 'payment' then 'مشكل في الأداء' when 'dont_know' then 'لا أعرف الطريقة' else 'سبب آخر' end;
begin
  if not public.has_perm('requests.manage') then raise exception 'forbidden'; end if;
  if p_reason not in ('portal_down', 'missing_info', 'rejected', 'payment', 'dont_know', 'other') then raise exception 'invalid_reason'; end if;
  perform public.task_guard('request', p_id);
  update service_requests set blocked_reason = p_reason, blocked_note = nullif(trim(p_note), ''), blocked_at = now() where id = p_id
  returning * into v_r;
  insert into request_history (request_id, status, note, employee_id) values (p_id, v_r.status, 'blocked:' || p_reason || coalesce(':' || nullif(trim(p_note), ''), ''), v_me);
  perform public.notify('request_blocked', 'warning', '🚧 تعثّر في الطلب ' || v_r.number || ': ' || v_label, 'Blocage demande ' || v_r.number,
                        (select full_name from employees where id = v_me) || ' · ' || v_r.service_name_ar || coalesce(' · ' || nullif(trim(p_note), ''), ''), '/requests');
end $$;

create or replace function public.request_unblock(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('requests.manage') then raise exception 'forbidden'; end if;
  update service_requests set blocked_reason = null, blocked_note = null, blocked_at = null where id = p_id;
end $$;

-- Status change: checks the checklist and the reference before "ready" / final
create or replace function public.set_request_status(p_id uuid, p_status text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_st request_statuses;
  v_r service_requests;
  v_g service_guides;
  v_missing int;
begin
  if not public.has_perm('requests.manage') then raise exception 'forbidden'; end if;
  select * into v_st from request_statuses where key = p_status;
  if not found then raise exception 'invalid_status'; end if;
  select * into v_r from service_requests where id = p_id;
  if not found then raise exception 'not_found'; end if;
  perform public.task_guard('request', p_id);

  if (v_st.allow_download or v_st.is_final) and not v_st.is_cancel then
    select * into v_g from service_guides where service_id = v_r.service_id;
    if found then
      select count(*) into v_missing from jsonb_array_elements(v_g.steps) with ordinality s(step, n)
       where coalesce((s.step->>'required')::boolean, true) and not (v_r.progress ? (n - 1)::text);
      if v_missing > 0 then raise exception 'steps_incomplete'; end if;
      if v_g.require_ref and jsonb_array_length(v_g.steps) > 0 and v_r.portal_ref is null then raise exception 'portal_ref_required'; end if;
      if v_g.require_proof and not exists (select 1 from request_files where request_id = p_id and kind = 'portal_proof' and deleted_at is null) then
        raise exception 'portal_proof_required';
      end if;
    end if;
  end if;

  update service_requests set status = p_status, blocked_reason = null, blocked_note = null, blocked_at = null where id = p_id;
  insert into request_history (request_id, status, note, employee_id) values (p_id, p_status, p_note, public.current_employee_id());
  perform public.log_activity('custom', 'requests', p_id::text, v_r.number, jsonb_build_object('status', p_status));
  return public.request_detail(p_id);
end $$;

-- Guide improvement suggestions
create table public.guide_suggestions (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid not null references public.services(id) on delete cascade,
  employee_id uuid references public.employees(id),
  text        text not null,
  status      text not null default 'pending' check (status in ('pending', 'applied', 'dismissed')),
  created_at  timestamptz not null default now()
);
alter table public.guide_suggestions enable row level security;
create policy guide_sugg_read on public.guide_suggestions for select using (public.has_perm('services.manage') or employee_id = public.current_employee_id());
create policy guide_sugg_update on public.guide_suggestions for update using (public.has_perm('services.manage')) with check (public.has_perm('services.manage'));

create or replace function public.suggest_guide_edit(p_service uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  if length(trim(coalesce(p_text, ''))) < 5 then raise exception 'reason_required'; end if;
  insert into guide_suggestions (service_id, employee_id, text) values (p_service, public.current_employee_id(), trim(p_text));
  perform public.notify('guide_suggestion', 'info', '📝 اقتراح تعديل دليل: ' || (select name_ar from services where id = p_service),
                        'Suggestion de guide', (select full_name from employees where id = public.current_employee_id()) || ' · ' || left(trim(p_text), 150), '/services');
end $$;

-- Request detail: guide now carries steps, video and templates; plus portal proofs
create or replace function public.request_detail(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(r) || jsonb_build_object(
    'service', (select jsonb_build_object('id', s.id, 'fields', s.fields, 'required_documents', s.required_documents, 'official_url', s.official_url,
                                          'target_hours', s.target_hours)
                  from services s where s.id = r.service_id),
    'guide', (select to_jsonb(g) - 'service_id' from service_guides g where g.service_id = r.service_id),
    'due_at', (select r.created_at + make_interval(hours => s.target_hours) from services s where s.id = r.service_id and s.target_hours is not null),
    'done_at', public.request_done_at(r.id),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('status', h.status, 'note', h.note, 'created_at', h.created_at, 'employee_name', e.full_name) order by h.created_at), '[]')
                  from request_history h left join employees e on e.id = h.employee_id where h.request_id = r.id),
    'files', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'name', f.name, 'path', f.path, 'size', f.size, 'mime', f.mime, 'created_at', f.created_at) order by f.created_at), '[]')
                from request_files f where f.request_id = r.id and f.deleted_at is null))
  from service_requests r
  where r.id = p_id and (public.has_perm('requests.manage') or public.has_perm('requests.view_documents'))
$$;

-- Blockers report: which services / reasons slow the team down
create or replace function public.blockers_report(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'open', (select count(*) from service_requests where blocked_reason is not null),
    'by_reason', (select coalesce(jsonb_object_agg(reason, n), '{}') from (
        select split_part(h.note, ':', 2) reason, count(*) n from request_history h
         where h.note like 'blocked:%' and h.created_at >= p_from and h.created_at < p_to group by 1) t),
    'by_service', (select coalesce(jsonb_agg(t order by t.n desc), '[]') from (
        select r.service_name_ar name_ar, r.service_name_fr name_fr, count(*) n from request_history h join service_requests r on r.id = h.request_id
         where h.note like 'blocked:%' and h.created_at >= p_from and h.created_at < p_to group by 1, 2 limit 10) t))
  where public.has_perm('reports.sales') or public.has_perm('requests.manage')
$$;

-- Lists show blocked requests
create or replace function public.requests_list(p_limit int default 1000)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]') from (
    select to_jsonb(r) - 'internal_notes' - 'fields' - 'progress' || jsonb_build_object(
      'files_count', (select count(*) from request_files f where f.request_id = r.id and f.kind in ('upload', 'payment_proof') and f.deleted_at is null),
      'deliverables_count', (select count(*) from request_files f where f.request_id = r.id and f.kind = 'deliverable' and f.deleted_at is null),
      'downloaded', exists (select 1 from request_files f where f.request_id = r.id and f.kind = 'deliverable' and f.downloaded_at is not null),
      'new_docs', (select count(*) from request_files f where f.request_id = r.id and f.kind in ('upload', 'payment_proof') and f.deleted_at is null
                     and f.uploaded_by is null
                     and f.created_at > coalesce((select max(h.created_at) from request_history h where h.request_id = r.id and h.employee_id is not null), r.created_at + interval '5 minutes')),
      'target_hours', sv.target_hours,
      'due_at', case when sv.target_hours is not null then r.created_at + make_interval(hours => sv.target_hours) end,
      'late', sv.target_hours is not null and not st.is_cancel
              and now() > r.created_at + make_interval(hours => sv.target_hours)
              and public.request_done_at(r.id) is null,
      'steps_total', (select jsonb_array_length(g.steps) from service_guides g where g.service_id = r.service_id),
      'steps_done', (select count(*) from jsonb_object_keys(r.progress)),
      'assignee', case when ae.id is not null then jsonb_build_object('id', ae.id, 'full_name', ae.full_name, 'color', ae.color) end) x
    from service_requests r
    join request_statuses st on st.key = r.status
    left join services sv on sv.id = r.service_id
    left join employees ae on ae.id = r.assigned_to
    order by r.created_at desc limit p_limit) t
  where public.has_perm('requests.manage') or public.has_perm('requests.view_documents')
$$;

-- save_service: the guide's new parts
create or replace function public.save_service_guide(p_service uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('services.manage') then raise exception 'forbidden'; end if;
  insert into service_guides (service_id, steps_ar, tips_ar, links, images, steps, video_url, templates, require_ref, require_proof, updated_by)
  values (p_service, null, nullif(trim(p->>'tips_ar'), ''), coalesce(p->'links', '[]'), coalesce(p->'images', '[]'),
          coalesce(p->'steps', '[]'), nullif(trim(p->>'video_url'), ''), coalesce(p->'templates', '[]'),
          coalesce((p->>'require_ref')::boolean, true), coalesce((p->>'require_proof')::boolean, false), public.current_employee_id())
  on conflict (service_id) do update set steps_ar = null, tips_ar = excluded.tips_ar, links = excluded.links, images = excluded.images,
    steps = excluded.steps, video_url = excluded.video_url, templates = excluded.templates,
    require_ref = excluded.require_ref, require_proof = excluded.require_proof, updated_by = excluded.updated_by;
end $$;
