-- =====================================================================
-- Service guides everywhere: the POS and the dashboard read every guide,
-- the owner can send one to an employee (notification + push) or to someone
-- outside the shop through a read-only link that expires and can be revoked.
-- =====================================================================

-- ---------------------------------------------------------------- read-only links
create table public.guide_shares (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique default replace(gen_random_uuid()::text, '-', ''),
  service_id   uuid not null references public.services(id) on delete cascade,
  note         text,
  expires_at   timestamptz,
  revoked_at   timestamptz,
  views        int not null default 0,
  last_view_at timestamptz,
  created_by   uuid references public.employees(id),
  created_at   timestamptz not null default now()
);
create index guide_shares_service_idx on public.guide_shares (service_id, created_at desc);
alter table public.guide_shares enable row level security;
create policy guide_shares_read on public.guide_shares for select using (public.has_perm('services.manage'));

create or replace function public.guide_share_create(p_service uuid, p_days int default 30, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r guide_shares;
begin
  if not public.has_perm('services.manage') then raise exception 'forbidden'; end if;
  if not exists (select 1 from services where id = p_service and deleted_at is null) then raise exception 'not_found'; end if;
  insert into guide_shares (service_id, note, expires_at, created_by)
  values (p_service, nullif(trim(p_note), ''), case when coalesce(p_days, 0) > 0 then now() + make_interval(days => p_days) end,
          public.current_employee_id())
  returning * into r;
  perform public.log_activity('custom', 'services', p_service::text, (select name_ar from services where id = p_service),
                              jsonb_build_object('guide_link', r.id, 'note', r.note, 'expires_at', r.expires_at));
  return jsonb_build_object('id', r.id, 'token', r.token, 'expires_at', r.expires_at);
end $$;

create or replace function public.guide_share_revoke(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('services.manage') then raise exception 'forbidden'; end if;
  update guide_shares set revoked_at = now() where id = p_id and revoked_at is null;
end $$;

-- What the link shows: the service and its guide, never the WhatsApp templates nor the price
create or replace function public.shared_guide(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r guide_shares;
begin
  update guide_shares set views = views + 1, last_view_at = now()
   where token = p_token and revoked_at is null and (expires_at is null or expires_at > now())
  returning * into r;
  if not found then return null; end if;
  return (
    select jsonb_build_object(
      'name_ar', s.name_ar, 'name_fr', s.name_fr, 'description_ar', s.description_ar, 'description_fr', s.description_fr,
      'duration_ar', s.duration_ar, 'duration_fr', s.duration_fr, 'official_url', s.official_url, 'icon', s.icon,
      'required_documents', s.required_documents, 'fields', s.fields, 'note', r.note, 'expires_at', r.expires_at,
      'guide', (select jsonb_build_object('steps', g.steps, 'tips_ar', g.tips_ar, 'links', g.links, 'images', g.images,
                                          'video_url', g.video_url, 'updated_at', g.updated_at)
                  from service_guides g where g.service_id = s.id))
      from services s
     where s.id = r.service_id and s.deleted_at is null);
end $$;
revoke execute on function public.shared_guide(text) from public;
grant execute on function public.shared_guide(text) to anon, authenticated;

-- ---------------------------------------------------------------- send to employees
-- One targeted notification each: it reaches their dashboard bell, their POS
-- («أُرسل إليك» in the guides) and their phone when push is enabled.
create or replace function public.guide_send(p_service uuid, p_employees uuid[], p_note text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_me   uuid := public.current_employee_id();
  v_from text := (select full_name from employees where id = public.current_employee_id());
  s      services;
  v_n    int;
begin
  if not (public.has_perm('services.manage') or public.has_perm('requests.manage')) then raise exception 'forbidden'; end if;
  select * into s from services where id = p_service and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
  insert into notifications (type, severity, title_ar, title_fr, body, link, target_employee)
  select 'guide_shared', 'info', '📘 دليل خدمة: ' || s.name_ar, 'Guide : ' || s.name_fr,
         'من ' || coalesce(v_from, '—') || ' إلى ' || e.full_name || coalesce(' · ' || nullif(trim(p_note), ''), ''),
         '/guides?service=' || s.id, e.id
    from employees e
   where e.id = any(p_employees) and e.id is distinct from v_me and e.is_active and e.deleted_at is null;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform public.log_activity('custom', 'services', s.id::text, s.name_ar, jsonb_build_object('guide_sent', v_n, 'note', nullif(trim(p_note), '')));
  end if;
  return v_n;
end $$;

-- Suggestions from the team now open the guide itself
create or replace function public.suggest_guide_edit(p_service uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  if length(trim(coalesce(p_text, ''))) < 5 then raise exception 'reason_required'; end if;
  insert into guide_suggestions (service_id, employee_id, text) values (p_service, public.current_employee_id(), trim(p_text));
  perform public.notify('guide_suggestion', 'info', '📝 اقتراح تعديل دليل: ' || (select name_ar from services where id = p_service),
                        'Suggestion de guide', (select full_name from employees where id = public.current_employee_id()) || ' · ' || left(trim(p_text), 150),
                        '/guides?service=' || p_service);
end $$;
