-- =====================================================================
-- Sweet House — core schema: settings, staff, permissions, devices, audit
-- Money is stored in centimes (bigint). 100 = 1.00 MAD.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Settings (key/value). Public keys are readable by website visitors.
-- ---------------------------------------------------------------------
create table public.settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  is_public  boolean not null default false,
  updated_at timestamptz not null default now()
);
create trigger settings_updated before update on public.settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Permissions catalogue & roles
-- ---------------------------------------------------------------------
create table public.permissions (
  key       text primary key,
  group_key text not null,
  name_ar   text not null,
  name_fr   text not null,
  sort      int  not null default 0
);

create table public.roles (
  id                   uuid primary key default gen_random_uuid(),
  name_ar              text not null,
  name_fr              text not null,
  description          text,
  color                text not null default '#475569',
  is_owner             boolean not null default false,
  permissions          text[] not null default '{}',
  max_discount_percent numeric(5,2) not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);
create trigger roles_updated before update on public.roles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Employees (staff). Every employee has an auth user, created by the
-- staff-account Edge Function. Secrets (PIN) live in a separate table
-- that no client can read.
-- ---------------------------------------------------------------------
create table public.employees (
  id                   uuid primary key default gen_random_uuid(),
  auth_user_id         uuid unique references auth.users(id) on delete set null,
  full_name            text not null,
  username             text unique,
  phone                text,
  avatar_url           text,
  color                text not null default '#FF6B35',
  role_id              uuid references public.roles(id),
  is_owner             boolean not null default false,
  extra_permissions    text[] not null default '{}',
  revoked_permissions  text[] not null default '{}',
  max_discount_percent numeric(5,2),
  can_use_pos          boolean not null default true,
  can_use_admin        boolean not null default false,
  monthly_salary       bigint not null default 0,
  hire_date            date,
  is_active            boolean not null default true,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);
create trigger employees_updated before update on public.employees
  for each row execute function public.set_updated_at();

create table public.employee_secrets (
  employee_id     uuid primary key references public.employees(id) on delete cascade,
  pin_hash        text,
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- POS devices. Only registered devices may use PIN login.
-- ---------------------------------------------------------------------
create table public.devices (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  secret_hash  text not null,
  is_active    boolean not null default true,
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- ---------------------------------------------------------------------
-- Auth helpers used by every RLS policy
-- ---------------------------------------------------------------------
create or replace function public.current_employee_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from employees
  where auth_user_id = auth.uid() and is_active and deleted_at is null
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from employees
    where auth_user_id = auth.uid() and is_active and deleted_at is null
  )
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from employees
    where auth_user_id = auth.uid() and is_owner and is_active and deleted_at is null
  )
$$;

create or replace function public.my_permissions()
returns text[] language sql stable security definer set search_path = public as $$
  select case
    when e.is_owner then (select coalesce(array_agg(key), '{}') from permissions)
    else array(
      select unnest(coalesce(r.permissions, '{}') || e.extra_permissions)
      except
      select unnest(e.revoked_permissions)
    )
  end
  from employees e
  left join roles r on r.id = e.role_id and r.deleted_at is null
  where e.auth_user_id = auth.uid() and e.is_active and e.deleted_at is null
$$;

create or replace function public.has_perm(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p = any(public.my_permissions()), false)
$$;

create or replace function public.my_max_discount()
returns numeric language sql stable security definer set search_path = public as $$
  select case when e.is_owner then 100
              else coalesce(e.max_discount_percent, r.max_discount_percent, 0) end
  from employees e
  left join roles r on r.id = e.role_id
  where e.auth_user_id = auth.uid()
$$;

-- Profile of the signed-in staff member, with resolved permissions.
create or replace function public.me()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', e.id, 'full_name', e.full_name, 'username', e.username,
    'avatar_url', e.avatar_url, 'color', e.color, 'is_owner', e.is_owner,
    'can_use_pos', e.can_use_pos, 'can_use_admin', e.can_use_admin or e.is_owner,
    'role', case when r.id is null then null else jsonb_build_object('id', r.id, 'name_ar', r.name_ar, 'name_fr', r.name_fr) end,
    'permissions', to_jsonb(public.my_permissions()),
    'max_discount_percent', public.my_max_discount()
  )
  from employees e left join roles r on r.id = e.role_id
  where e.auth_user_id = auth.uid() and e.is_active and e.deleted_at is null
$$;

-- Guard: only the owner may grant or change owner status.
create or replace function public.guard_employee_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- service role / migrations
  if tg_op = 'INSERT' and new.is_owner and not public.is_owner() then
    raise exception 'only_owner_can_create_owner';
  end if;
  if tg_op = 'UPDATE' then
    if old.is_owner and not public.is_owner() then
      raise exception 'only_owner_can_edit_owner';
    end if;
    if new.is_owner <> old.is_owner and not public.is_owner() then
      raise exception 'only_owner_can_change_owner';
    end if;
    if old.is_owner and (new.deleted_at is not null or not new.is_active)
       and (select count(*) from employees where is_owner and is_active and deleted_at is null) <= 1 then
      raise exception 'cannot_disable_last_owner';
    end if;
  end if;
  return new;
end $$;
create trigger employees_guard before insert or update on public.employees
  for each row execute function public.guard_employee_owner();

-- ---------------------------------------------------------------------
-- Document numbering (receipts, invoices, orders…) without gaps.
-- ---------------------------------------------------------------------
create table public.document_sequences (
  key          text primary key,
  prefix       text not null,
  next_value   bigint not null default 1,
  padding      int not null default 6,
  yearly_reset boolean not null default false,
  current_year int not null default extract(year from now())::int
);

create or replace function public.next_doc_number(seq_key text)
returns text language plpgsql security definer set search_path = public as $$
declare
  s document_sequences;
  y int := extract(year from now())::int;
  v bigint;
begin
  select * into s from document_sequences where key = seq_key for update;
  if not found then raise exception 'unknown_sequence %', seq_key; end if;
  if s.yearly_reset and s.current_year <> y then
    s.next_value := 1;
  end if;
  v := s.next_value;
  update document_sequences
     set next_value = v + 1, current_year = y
   where key = seq_key;
  return replace(s.prefix, '{YYYY}', y::text) || lpad(v::text, s.padding, '0');
end $$;
revoke execute on function public.next_doc_number(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Activity log (filled by triggers, never by clients directly)
-- ---------------------------------------------------------------------
create table public.activity_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  employee_id uuid references public.employees(id) on delete set null,
  action      text not null,          -- insert | update | delete | trash | restore | custom
  entity      text not null,          -- table name or domain
  entity_id   text,
  label       text,                   -- human readable name of the row
  changes     jsonb
);
create index activity_log_at_idx on public.activity_log (at desc);
create index activity_log_entity_idx on public.activity_log (entity, entity_id);

create or replace function public.log_activity(
  p_action text, p_entity text, p_entity_id text, p_label text, p_changes jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into activity_log (employee_id, action, entity, entity_id, label, changes)
  values (public.current_employee_id(), p_action, p_entity, p_entity_id, p_label, p_changes);
$$;
revoke execute on function public.log_activity(text, text, text, text, jsonb) from public, anon, authenticated;

create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  n jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  o jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  r jsonb := coalesce(n, o);
  act text := lower(tg_op);
  diff jsonb;
  lbl text := coalesce(r->>'name_ar', r->>'full_name', r->>'number', r->>'name', r->>'key');
begin
  if tg_op = 'UPDATE' then
    if (o->>'deleted_at') is null and (n->>'deleted_at') is not null then act := 'trash';
    elsif (o->>'deleted_at') is not null and (n->>'deleted_at') is null then act := 'restore';
    end if;
    select jsonb_object_agg(k, jsonb_build_object('from', o->k, 'to', n->k)) into diff
      from jsonb_object_keys(n) k
     where k not in ('updated_at') and (o->k) is distinct from (n->k);
    if diff is null then return new; end if;
  end if;
  perform public.log_activity(act, tg_table_name, r->>coalesce(nullif(tg_argv[0], ''), 'id'), lbl, diff);
  return coalesce(new, old);
end $$;

create trigger audit_settings after insert or update or delete on public.settings
  for each row execute function public.audit_row('key');
create trigger audit_roles after insert or update or delete on public.roles
  for each row execute function public.audit_row();
create trigger audit_employees after insert or update or delete on public.employees
  for each row execute function public.audit_row();
create trigger audit_devices after insert or update or delete on public.devices
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.settings           enable row level security;
alter table public.permissions        enable row level security;
alter table public.roles              enable row level security;
alter table public.employees          enable row level security;
alter table public.employee_secrets   enable row level security;
alter table public.devices            enable row level security;
alter table public.document_sequences enable row level security;
alter table public.activity_log       enable row level security;

create policy settings_read on public.settings for select
  using (is_public or public.is_staff());
create policy settings_write on public.settings for all
  using (public.has_perm('settings.manage')) with check (public.has_perm('settings.manage'));

create policy permissions_read on public.permissions for select using (public.is_staff());

create policy roles_read on public.roles for select using (public.is_staff());
create policy roles_write on public.roles for all
  using (public.has_perm('employees.manage') and not is_owner)
  with check (public.has_perm('employees.manage') and not is_owner);

create policy employees_read on public.employees for select using (public.is_staff());
create policy employees_write on public.employees for update
  using (public.has_perm('employees.manage')) with check (public.has_perm('employees.manage'));

-- employee_secrets: no policies → unreachable from clients.

create policy devices_read on public.devices for select using (public.has_perm('settings.manage'));
create policy devices_write on public.devices for update
  using (public.has_perm('settings.manage')) with check (public.has_perm('settings.manage'));

create policy sequences_read on public.document_sequences for select using (public.is_staff());
create policy sequences_write on public.document_sequences for update
  using (public.has_perm('settings.manage')) with check (public.has_perm('settings.manage'));

create policy activity_read on public.activity_log for select using (public.has_perm('logs.view'));

-- ---------------------------------------------------------------------
-- Setup / device / PIN functions
-- ---------------------------------------------------------------------
create or replace function public.setup_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('has_owner', exists (
    select 1 from employees where is_owner and deleted_at is null))
$$;
grant execute on function public.setup_status() to anon, authenticated;

create or replace function public.register_device(p_name text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  secret text := encode(gen_random_bytes(32), 'hex');
  d_id uuid;
begin
  if not public.has_perm('settings.manage') then raise exception 'forbidden'; end if;
  insert into devices (name, secret_hash) values (p_name, crypt(secret, gen_salt('bf')))
  returning id into d_id;
  return jsonb_build_object('id', d_id, 'secret', secret);
end $$;

create or replace function public.device_ok(p_device uuid, p_secret text)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from devices
    where id = p_device and is_active and deleted_at is null
      and secret_hash = crypt(p_secret, secret_hash))
$$;
revoke execute on function public.device_ok(uuid, text) from public, anon, authenticated;

-- Staff list for the PIN screen (anonymous, but only from a registered device).
create or replace function public.pos_staff(p_device uuid, p_secret text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.device_ok(p_device, p_secret) then raise exception 'device_not_registered'; end if;
  update devices set last_seen_at = now() where id = p_device;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'full_name', e.full_name, 'avatar_url', e.avatar_url, 'color', e.color,
      'has_pin', s.pin_hash is not null) order by e.is_owner desc, e.full_name)
    from employees e left join employee_secrets s on s.employee_id = e.id
    where e.is_active and e.deleted_at is null and e.can_use_pos and e.auth_user_id is not null
  ), '[]'::jsonb);
end $$;
grant execute on function public.pos_staff(uuid, text) to anon, authenticated;

create or replace function public.set_employee_pin(p_employee uuid, p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not (public.has_perm('employees.manage') or public.current_employee_id() = p_employee) then
    raise exception 'forbidden';
  end if;
  if exists (select 1 from employees where id = p_employee and is_owner) and not public.is_owner() then
    raise exception 'only_owner_can_edit_owner';
  end if;
  if p_pin !~ '^[0-9]{4}$' then raise exception 'pin_must_be_4_digits'; end if;
  insert into employee_secrets (employee_id, pin_hash, failed_attempts, locked_until, updated_at)
  values (p_employee, crypt(p_pin, gen_salt('bf')), 0, null, now())
  on conflict (employee_id) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();
  perform public.log_activity('custom', 'employees', p_employee::text,
    (select full_name from employees where id = p_employee), jsonb_build_object('pin', 'changed'));
end $$;

-- Called only by the pin-login Edge Function (service role).
create or replace function public.pin_verify(p_device uuid, p_secret text, p_employee uuid, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  s employee_secrets;
  e employees;
begin
  if not public.device_ok(p_device, p_secret) then
    return jsonb_build_object('ok', false, 'error', 'device_not_registered');
  end if;
  select * into e from employees
   where id = p_employee and is_active and deleted_at is null and can_use_pos;
  if not found or e.auth_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'employee_not_found');
  end if;
  select * into s from employee_secrets where employee_id = p_employee for update;
  if not found or s.pin_hash is null then
    return jsonb_build_object('ok', false, 'error', 'pin_not_set');
  end if;
  if s.locked_until is not null and s.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'locked', 'until', s.locked_until);
  end if;
  if s.pin_hash <> crypt(p_pin, s.pin_hash) then
    update employee_secrets
       set failed_attempts = failed_attempts + 1,
           locked_until = case when failed_attempts + 1 >= 5 then now() + interval '5 minutes' end
     where employee_id = p_employee;
    return jsonb_build_object('ok', false, 'error', 'wrong_pin', 'attempts', s.failed_attempts + 1);
  end if;
  update employee_secrets set failed_attempts = 0, locked_until = null where employee_id = p_employee;
  update devices set last_seen_at = now() where id = p_device;
  return jsonb_build_object('ok', true, 'auth_user_id', e.auth_user_id);
end $$;
revoke execute on function public.pin_verify(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.pin_verify(uuid, text, uuid, text) to service_role;
