-- =====================================================================
-- 2 · Automatic nightly backup (private bucket "backups", keep 14)
-- 8 · System health: one view of failing jobs + alert on problems
-- 9 · Owner-only settings (AI, agent team, preferences, helpers)
-- =====================================================================

-- Backup of every public table except secrets (new tables are included automatically)
create or replace function public.system_backup()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_res jsonb := jsonb_build_object('generated_at', now(), 'version', 5);
  v_t text;
  v_rows jsonb;
begin
  for v_t in select tablename from pg_tables where schemaname = 'public'
              and tablename not in ('employee_secrets', 'agent_secret', 'push_subscriptions') order by tablename loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]'') from public.%I t', v_t) into v_rows;
    v_res := v_res || jsonb_build_object(v_t, v_rows);
  end loop;
  return v_res;
end $$;
revoke execute on function public.system_backup() from public, anon, authenticated;
grant execute on function public.system_backup() to service_role;

-- The manual button now uses the same complete backup
create or replace function public.full_backup()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'forbidden'; end if;
  perform public.log_activity('custom', 'backup', null, 'full_backup', null);
  return public.system_backup();
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backups', 'backups', false, 104857600, array['application/gzip', 'application/json'])
on conflict (id) do nothing;
create policy backups_owner_read on storage.objects for select using (bucket_id = 'backups' and public.is_owner());

create table public.backup_runs (
  id         bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  ok         boolean,
  path       text,
  bytes      bigint,
  tables     int,
  error      text
);
alter table public.backup_runs enable row level security;
create policy backup_runs_owner on public.backup_runs for select using (public.is_owner());

select cron.unschedule(jobid) from cron.job where jobname = 'sweet-house-backup';
select cron.schedule('sweet-house-backup', '30 1 * * *',   -- 02:30 Morocco
  $c$select net.http_post(url := 'https://gvvcrjxmansmmrnxdrnw.supabase.co/functions/v1/backup', body := '{}'::jsonb,
     headers := jsonb_build_object('Content-Type', 'application/json', 'x-agent-key', (select secret from public.agent_secret where id = 1)),
     timeout_milliseconds := 120000)$c$);

-- ---------------------------------------------------------------------
-- System health
-- ---------------------------------------------------------------------
create or replace function public.system_health_data()
returns jsonb language sql stable security definer set search_path = public, cron, net as $$
  select jsonb_build_object(
    'checked_at', now(),
    'cron_failures', (select coalesce(jsonb_agg(jsonb_build_object('job', j.jobname, 'count', f.n, 'last_error', left(f.msg, 200))), '[]') from (
        select jobid, count(*) n, (array_agg(return_message order by start_time desc))[1] msg
          from cron.job_run_details where status <> 'succeeded' and start_time > now() - interval '24 hours' group by jobid) f
        join cron.job j on j.jobid = f.jobid),
    'http_errors', (select count(*) from net._http_response where created > now() - interval '24 hours' and (status_code is null or status_code >= 500)),
    'agent_failures', (select coalesce(jsonb_agg(jsonb_build_object('agent', a.persona_name, 'count', x.n, 'error', x.err)), '[]') from (
        select agent_key, count(*) n, (array_agg(error order by started_at desc))[1] err from agent_runs
         where ok = false and started_at > now() - interval '24 hours' group by 1) x join agents a on a.key = x.agent_key),
    'push_devices', (select count(*) from push_subscriptions),
    'push_stuck', (select count(*) from notifications where pushed_at is null and created_at between now() - interval '24 hours' and now() - interval '15 minutes')
                  * case when exists (select 1 from push_subscriptions) then 1 else 0 end,
    'last_backup', (select jsonb_build_object('at', started_at, 'ok', ok, 'bytes', bytes, 'error', error) from backup_runs order by started_at desc limit 1),
    'last_good_backup_at', (select max(started_at) from backup_runs where ok),
    'storage', public.storage_usage_internal(),
    'ai_key', true)
$$;
revoke execute on function public.system_health_data() from public, anon, authenticated;
grant execute on function public.system_health_data() to service_role;

-- storage_usage() checks the caller; the health check needs a caller-free copy
create or replace function public.storage_usage_internal()
returns jsonb language sql stable security definer set search_path = public, storage as $$
  select jsonb_build_object(
    'files_bytes', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects),
    'files_limit', 1073741824,
    'db_bytes', pg_database_size(current_database()),
    'db_limit', 524288000)
$$;
revoke execute on function public.storage_usage_internal() from public, anon, authenticated;
grant execute on function public.storage_usage_internal() to service_role;

-- Health issues as a list (shared by the dashboard card and the hourly alert)
create or replace function public.system_issues()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  h jsonb := public.system_health_data();
  o jsonb := '[]';
  v_files numeric := (h->'storage'->>'files_bytes')::numeric / (h->'storage'->>'files_limit')::numeric;
  v_db numeric := (h->'storage'->>'db_bytes')::numeric / (h->'storage'->>'db_limit')::numeric;
begin
  if jsonb_array_length(h->'cron_failures') > 0 then
    o := o || jsonb_build_object('key', 'cron', 'severity', 'danger', 'ar', 'مهام تلقائية فشلت خلال 24 ساعة', 'detail', h->'cron_failures');
  end if;
  if (h->>'http_errors')::int >= 3 then
    o := o || jsonb_build_object('key', 'http', 'severity', 'warning', 'ar', 'اتصالات داخلية فشلت ' || (h->>'http_errors') || ' مرة خلال 24 ساعة', 'detail', null);
  end if;
  if jsonb_array_length(h->'agent_failures') > 0 then
    o := o || jsonb_build_object('key', 'agents', 'severity', 'warning', 'ar', 'وكلاء لم يكملوا عملهم', 'detail', h->'agent_failures');
  end if;
  if (h->>'push_devices')::int = 0 then
    o := o || jsonb_build_object('key', 'push_none', 'severity', 'danger', 'ar', 'لا يوجد أي جهاز مفعَّل للإشعارات: لن يصلك أي تنبيه', 'detail', null);
  elsif (h->>'push_stuck')::int > 0 then
    o := o || jsonb_build_object('key', 'push', 'severity', 'warning', 'ar', 'إشعارات لم تُرسل إلى الهاتف', 'detail', h->'push_stuck');
  end if;
  if h->>'last_good_backup_at' is null or (h->>'last_good_backup_at')::timestamptz < now() - interval '2 days' then
    o := o || jsonb_build_object('key', 'backup', 'severity', 'danger', 'ar', 'لا توجد نسخة احتياطية حديثة (أكثر من يومين)', 'detail', h->'last_backup');
  end if;
  if v_files > 0.8 or v_db > 0.8 then
    o := o || jsonb_build_object('key', 'space', 'severity', 'warning', 'ar', 'المساحة قاربت على الامتلاء (' || round(greatest(v_files, v_db) * 100) || '%)', 'detail', null);
  end if;
  return jsonb_build_object('issues', o, 'health', h);
end $$;
revoke execute on function public.system_issues() from public, anon, authenticated;
grant execute on function public.system_issues() to service_role;

create or replace function public.system_health()
returns jsonb language sql stable security definer set search_path = public as $$
  select public.system_issues() where public.is_owner()
$$;

-- Hourly: notify the owner once a day per new problem
insert into public.settings (key, value, is_public) values ('health', '{"alerted":{}}'::jsonb, false) on conflict (key) do nothing;
create or replace function public.system_health_tick()
returns void language plpgsql security definer set search_path = public as $$
declare
  v jsonb := public.system_issues();
  i jsonb;
  v_alerted jsonb := coalesce((select value->'alerted' from settings where key = 'health'), '{}');
  v_today text := to_char(now() at time zone 'Africa/Casablanca', 'YYYY-MM-DD');
begin
  for i in select * from jsonb_array_elements(v->'issues') loop
    if coalesce(v_alerted->>(i->>'key'), '') <> v_today and i->>'key' <> 'push_none' then
      perform public.notify('system_health', i->>'severity', '🩺 ' || (i->>'ar'), 'Santé du système', null, '/dashboard');
      v_alerted := v_alerted || jsonb_build_object(i->>'key', v_today);
    end if;
  end loop;
  update settings set value = jsonb_build_object('alerted', v_alerted) where key = 'health';
end $$;
revoke execute on function public.system_health_tick() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'sweet-house-health';
select cron.schedule('sweet-house-health', '7 * * * *', 'select public.system_health_tick()');

-- ---------------------------------------------------------------------
-- 9 · Owner-only settings
-- ---------------------------------------------------------------------
create or replace function public.owner_only_setting(p_key text)
returns boolean language sql immutable as $$
  select p_key in ('ai', 'agent_prefs', 'agent_team', 'helpers', 'health', 'retention')
$$;
drop policy if exists settings_read on public.settings;
drop policy if exists settings_write on public.settings;
create policy settings_read on public.settings for select
  using (is_public or (public.is_staff() and not public.owner_only_setting(key)) or public.is_owner());
create policy settings_write on public.settings for update
  using (public.has_perm('settings.manage') and (not public.owner_only_setting(key) or public.is_owner()))
  with check (public.has_perm('settings.manage') and (not public.owner_only_setting(key) or public.is_owner()));
