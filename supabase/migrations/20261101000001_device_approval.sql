-- =====================================================================
-- Simple POS device pairing: a new computer asks to connect, the owner
-- approves it from the dashboard (no password typed on the device).
-- Devices report a heartbeat so the dashboard shows who is online now.
-- =====================================================================

alter table public.devices
  add column status       text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  add column request_code text,
  add column device_info  text,
  add column requested_at timestamptz,
  add column approved_by  uuid references public.employees(id),
  add column approved_at  timestamptz,
  add column current_employee uuid references public.employees(id) on delete set null;

-- Only approved, active devices may use PIN login
create or replace function public.device_ok(p_device uuid, p_secret text)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from devices
    where id = p_device and is_active and status = 'approved' and deleted_at is null
      and secret_hash = crypt(p_secret, secret_hash))
$$;
revoke execute on function public.device_ok(uuid, text) from public, anon, authenticated;

-- A new computer asks to become a POS terminal (anonymous)
create or replace function public.device_request(p_name text, p_info text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_secret text := encode(gen_random_bytes(32), 'hex');
  v_code text := lpad((floor(random() * 10000))::int::text, 4, '0');
  v_id uuid;
begin
  delete from devices where status in ('pending', 'rejected') and coalesce(requested_at, created_at) < now() - interval '1 day';
  if (select count(*) from devices where status = 'pending') >= 10 then raise exception 'too_many_requests'; end if;
  insert into devices (name, secret_hash, is_active, status, request_code, device_info, requested_at)
  values (coalesce(nullif(left(trim(p_name), 40), ''), 'جهاز جديد'), crypt(v_secret, gen_salt('bf')), false, 'pending', v_code, left(p_info, 120), now())
  returning id into v_id;
  perform public.notify('device_request', 'warning', 'جهاز جديد يطلب الاتصال بنقطة البيع (الرمز ' || v_code || ')',
                        'Nouvel appareil demande l’accès POS (code ' || v_code || ')', left(p_info, 120), '/devices');
  return jsonb_build_object('id', v_id, 'secret', v_secret, 'code', v_code);
end $$;
grant execute on function public.device_request(text, text) to anon, authenticated;

-- The waiting device polls its status (proves it owns the secret)
create or replace function public.device_status(p_device uuid, p_secret text)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object('status', case when deleted_at is not null then 'rejected' when not is_active and status = 'approved' then 'disabled' else status end, 'name', name)
    from devices where id = p_device and secret_hash = crypt(p_secret, secret_hash)
$$;
grant execute on function public.device_status(uuid, text) to anon, authenticated;

create or replace function public.approve_device(p_id uuid, p_name text, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not public.has_perm('settings.manage') then raise exception 'forbidden'; end if;
  select request_code into v_code from devices where id = p_id and status = 'pending' and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
  if p_approve then
    update devices set status = 'approved', is_active = true, name = coalesce(nullif(trim(p_name), ''), name),
      approved_by = public.current_employee_id(), approved_at = now(), request_code = null
    where id = p_id;
  else
    update devices set status = 'rejected', is_active = false where id = p_id;
  end if;
  update notifications set read_at = now() where type = 'device_request' and read_at is null and title_ar like '%(الرمز ' || v_code || ')%';
end $$;

-- Heartbeat every minute from each open POS
create or replace function public.device_ping(p_device uuid, p_secret text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.device_ok(p_device, p_secret) then return false; end if;
  update devices set last_seen_at = now(), current_employee = public.current_employee_id() where id = p_device;
  return true;
end $$;
grant execute on function public.device_ping(uuid, text) to anon, authenticated;

-- Dashboard list: online state, who is signed in, open shift
create or replace function public.devices_overview()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id, 'name', d.name, 'status', d.status, 'is_active', d.is_active, 'request_code', d.request_code,
      'device_info', d.device_info, 'requested_at', d.requested_at, 'last_seen_at', d.last_seen_at, 'created_at', d.created_at,
      'online', d.last_seen_at > now() - interval '2 minutes',
      'employee', (select jsonb_build_object('full_name', e.full_name, 'color', e.color) from employees e where e.id = d.current_employee and d.last_seen_at > now() - interval '2 minutes'),
      'shift', (select jsonb_build_object('number', s.number, 'opened_at', s.opened_at, 'employee', e.full_name) from shifts s join employees e on e.id = s.employee_id where s.device_id = d.id and s.status = 'open'))
    order by (d.status = 'pending') desc, (d.last_seen_at > now() - interval '2 minutes') desc nulls last, d.created_at), '[]')
  from devices d
  where d.deleted_at is null and d.status <> 'rejected' and public.has_perm('settings.manage')
$$;

-- Sidebar badge: pending device requests
create or replace function public.online_pending()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'requests', (select count(*) from service_requests r join request_statuses s on s.key = r.status where not s.is_final),
    'requests_new', (select count(*) from service_requests where status = 'received'),
    'requests_late', public.late_requests_count(),
    'orders', (select count(*) from online_orders where status not in ('delivered', 'cancelled')),
    'orders_new', (select count(*) from online_orders where status = 'new'),
    'proofs', (select count(*) from service_requests where payment_status = 'proof_uploaded')
            + (select count(*) from online_orders where payment_status = 'proof_uploaded'),
    'devices_pending', case when public.has_perm('settings.manage') then (select count(*) from devices where status = 'pending' and deleted_at is null) else 0 end)
  where public.is_staff()
$$;
