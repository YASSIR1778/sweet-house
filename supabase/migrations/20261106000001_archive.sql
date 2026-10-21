-- =====================================================================
-- Archive & customer file
--  · search every request (finished ones too) from the POS / dashboard
--  · full customer file: requests + documents, orders, purchases, debt
--  · "keep these documents" flag per request
--  · document access log (view / download / print)
--  · retention: customer personal documents deleted automatically N months
--    after the request is finished (default 6); finished documents kept
-- =====================================================================

insert into public.settings (key, value, is_public) values
  ('retention', jsonb_build_object('enabled', true, 'customer_docs_months', 6, 'keep_deliverables', true), false)
on conflict (key) do nothing;

alter table public.service_requests add column keep_files boolean not null default false;

-- When a request reached a final status (delivered / cancelled)
create or replace function public.request_closed_at(p_request uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select max(h.created_at) from request_history h join request_statuses s on s.key = h.status
   where h.request_id = p_request and s.is_final
$$;
revoke execute on function public.request_closed_at(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- search
create or replace function public.requests_search(p_q text, p_limit int default 60)
returns jsonb language sql stable security definer set search_path = public as $$
  with q as (select trim(coalesce(p_q, '')) s, regexp_replace(coalesce(p_q, ''), '\D', '', 'g') d)
  select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]') from (
    select to_jsonb(r) - 'internal_notes' - 'fields' - 'progress' || jsonb_build_object(
      'files_count', (select count(*) from request_files f where f.request_id = r.id and f.kind in ('upload', 'payment_proof') and f.deleted_at is null),
      'deliverables_count', (select count(*) from request_files f where f.request_id = r.id and f.kind = 'deliverable' and f.deleted_at is null),
      'downloaded', exists (select 1 from request_files f where f.request_id = r.id and f.kind = 'deliverable' and f.downloaded_at is not null),
      'new_docs', 0, 'late', false, 'steps_total', null, 'steps_done', 0,
      'assignee', case when ae.id is not null then jsonb_build_object('id', ae.id, 'full_name', ae.full_name, 'color', ae.color) end) x
    from service_requests r
    left join employees ae on ae.id = r.assigned_to, q
    where length(q.s) >= 2 and (
          r.customer_name ilike '%' || q.s || '%'
       or r.number ilike '%' || q.s || '%'
       or r.tracking_code ilike '%' || q.s || '%'
       or coalesce(r.portal_ref, '') ilike '%' || q.s || '%'
       or r.service_name_ar ilike '%' || q.s || '%'
       or (length(q.d) >= 6 and public.phone_digits(r.phone) like '%' || right(q.d, 9) || '%'))
    order by r.created_at desc limit p_limit) t
  where public.has_perm('requests.manage') or public.has_perm('requests.view_documents')
$$;

-- ---------------------------------------------------------------- customer file
create or replace function public.customer_file(p_phone text default null, p_customer uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_c customers;
  v_digits text;
  v_docs boolean := public.has_perm('requests.view_documents');
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  if p_customer is not null then
    select * into v_c from customers where id = p_customer;
    v_digits := public.phone_digits(v_c.phone);
  else
    v_digits := public.phone_digits(p_phone);
    if length(v_digits) < 9 then raise exception 'phone_invalid'; end if;
    select * into v_c from customers where public.phone_digits(phone) = v_digits and deleted_at is null order by created_at limit 1;
  end if;

  return jsonb_build_object(
    'customer', case when v_c.id is not null then jsonb_build_object('id', v_c.id, 'full_name', v_c.full_name, 'phone', v_c.phone, 'email', v_c.email,
                  'created_at', v_c.created_at,
                  'balance', (select coalesce(sum(amount), 0) from customer_ledger where customer_id = v_c.id)) end,
    'phone_digits', v_digits,
    'requests', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'number', r.number, 'tracking_code', r.tracking_code, 'service_id', r.service_id,
        'service_name_ar', r.service_name_ar, 'service_name_fr', r.service_name_fr, 'customer_name', r.customer_name, 'phone', r.phone,
        'created_at', r.created_at, 'price', r.price, 'payment_status', r.payment_status, 'portal_ref', r.portal_ref, 'keep_files', r.keep_files,
        'status', jsonb_build_object('key', s.key, 'name_ar', s.name_ar, 'name_fr', s.name_fr, 'color', s.color, 'is_final', s.is_final),
        'assignee', (select full_name from employees e where e.id = r.assigned_to),
        'deliverables', case when v_docs then (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'path', f.path, 'mime', f.mime, 'created_at', f.created_at) order by f.created_at), '[]')
                              from request_files f where f.request_id = r.id and f.kind = 'deliverable' and f.deleted_at is null) else '[]'::jsonb end,
        'uploads_count', (select count(*) from request_files f where f.request_id = r.id and f.kind in ('upload', 'payment_proof') and f.deleted_at is null))
        order by r.created_at desc), '[]')
      from service_requests r join request_statuses s on s.key = r.status
      where public.phone_digits(r.phone) = v_digits or (v_c.id is not null and r.customer_id = v_c.id)),
    'orders', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'number', o.number, 'total', o.total, 'status', o.status,
                 'payment_status', o.payment_status, 'created_at', o.created_at) order by o.created_at desc), '[]')
      from online_orders o where public.phone_digits(o.phone) = v_digits or (v_c.id is not null and o.customer_id = v_c.id)),
    'sales', case when v_c.id is null then '[]'::jsonb else (select coalesce(jsonb_agg(t order by t.created_at desc), '[]') from (
        select s.id, s.number, s.total, s.paid_credit, s.status, s.created_at,
               (select string_agg(i.name_ar, '، ') from (select name_ar from sale_items where sale_id = s.id order by line_no limit 3) i) items
          from sales s where s.customer_id = v_c.id order by s.created_at desc limit 30) t) end);
end $$;

-- ---------------------------------------------------------------- keep files / access log
create or replace function public.request_keep_files(p_id uuid, p_keep boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('requests.manage') then raise exception 'forbidden'; end if;
  update service_requests set keep_files = p_keep where id = p_id;
  perform public.log_activity('custom', 'requests', p_id::text, (select number from service_requests where id = p_id), jsonb_build_object('keep_files', p_keep));
end $$;

create or replace function public.log_doc_access(p_file uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare f request_files;
begin
  if not public.has_perm('requests.view_documents') then raise exception 'forbidden'; end if;
  select * into f from request_files where id = p_file;
  if not found then return; end if;
  perform public.log_activity('custom', 'documents', p_file::text, f.name,
    jsonb_build_object('action', left(p_action, 20), 'request', (select number from service_requests where id = f.request_id)));
end $$;

-- ---------------------------------------------------------------- retention
-- Files that the retention rule deletes now (or within p_days_ahead days)
create or replace function public.retention_due(p_days_ahead int default 0)
returns table (id uuid, path text, name text, size bigint, number text) language sql stable security definer set search_path = public as $$
  with cfg as (select value from settings where key = 'retention')
  select f.id, f.path, f.name, f.size, r.number
    from request_files f join service_requests r on r.id = f.request_id, cfg
   where f.deleted_at is null and coalesce((cfg.value->>'enabled')::boolean, true)
     and not r.keep_files
     and (f.kind in ('upload', 'payment_proof') or (not coalesce((cfg.value->>'keep_deliverables')::boolean, true) and f.kind in ('deliverable', 'portal_proof')))
     and public.request_closed_at(r.id) is not null
     and public.request_closed_at(r.id) < now() + make_interval(days => p_days_ahead) - make_interval(months => coalesce((cfg.value->>'customer_docs_months')::int, 6))
$$;
revoke execute on function public.retention_due(int) from public, anon, authenticated;
grant execute on function public.retention_due(int) to service_role;

create or replace function public.retention_mark_deleted(p_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  update request_files set deleted_at = now() where id = any(p_ids) and deleted_at is null;
  get diagnostics v_n = row_count;
  if v_n > 0 then perform public.log_activity('custom', 'storage', null, 'retention', jsonb_build_object('files', v_n)); end if;
  return v_n;
end $$;
revoke execute on function public.retention_mark_deleted(uuid[]) from public, anon, authenticated;
grant execute on function public.retention_mark_deleted(uuid[]) to service_role;

create or replace function public.retention_preview()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'now', (select count(*) from public.retention_due(0)),
    'week', (select count(*) from public.retention_due(7)),
    'bytes_week', (select coalesce(sum(size), 0) from public.retention_due(7)))
  where public.is_owner() or public.has_perm('settings.manage')
$$;

-- Friday: tell the owner what Monday's run will delete
create or replace function public.retention_notice()
returns void language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  select count(*) into v_n from public.retention_due(3);
  if v_n > 0 then
    perform public.notify('retention_notice', 'warning', '🗂️ ' || v_n || ' وثيقة شخصية لزبائن ستُحذف تلقائياً يوم الإثنين',
      v_n || ' documents clients seront supprimés lundi', 'طلبات منتهية منذ المدة المحددة. لإبقاء ملف معيّن: «احتفظ بهذه الوثائق» داخل الطلب.', '/settings');
  end if;
end $$;
revoke execute on function public.retention_notice() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname in ('sweet-house-retention-notice', 'sweet-house-retention-run');
select cron.schedule('sweet-house-retention-notice', '0 9 * * 5', 'select public.retention_notice()');
select cron.schedule('sweet-house-retention-run', '0 3 * * 1',
  $c$select net.http_post(url := 'https://gvvcrjxmansmmrnxdrnw.supabase.co/functions/v1/retention', body := '{}'::jsonb, headers := '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds := 60000)$c$);

-- Manual cleanup no longer removes finished documents unless asked
drop function if exists public.cleanup_candidates(int);
create or replace function public.cleanup_candidates(p_days int, p_include_deliverables boolean default false)
returns jsonb language sql stable security definer set search_path = public, storage as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'path', f.path, 'name', f.name, 'size', o.metadata->>'size',
           'created_at', f.created_at, 'number', coalesce(r.number, oo.number), 'kind', f.kind)), '[]')
    from request_files f
    left join service_requests r on r.id = f.request_id
    left join request_statuses s on s.key = r.status
    left join online_orders oo on oo.id = f.order_id
    left join storage.objects o on o.bucket_id = 'customer-docs' and o.name = f.path
   where f.deleted_at is null and f.created_at < now() - make_interval(days => p_days)
     and (s.is_final or oo.status in ('delivered', 'cancelled'))
     and not coalesce(r.keep_files, false)
     and (p_include_deliverables or f.kind not in ('deliverable', 'portal_proof'))
     and public.is_owner()
$$;
