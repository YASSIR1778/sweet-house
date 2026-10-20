-- =====================================================================
-- Sweet House — Phase 3: online shop orders, administrative service
-- requests (with documents, tracking and download), website content.
-- Counter services (printing, copies, scan…) are NOT sold online.
-- =====================================================================

update public.services set is_online = false where kind = 'counter';

alter table public.stock_movements drop constraint stock_movements_reason_check;
alter table public.stock_movements add constraint stock_movements_reason_check
  check (reason in ('initial', 'sale', 'void', 'refund', 'purchase', 'adjustment', 'inventory', 'online_order', 'online_cancel'));

alter table public.cash_movements drop constraint cash_movements_type_check;
alter table public.cash_movements add constraint cash_movements_type_check
  check (type in ('expense', 'owner_withdrawal', 'owner_deposit', 'debt_payment', 'riyad_credit', 'refund',
                  'supplier_payment', 'salary_advance', 'adjustment', 'online_payment'));

-- ---------------------------------------------------------------------
-- Request statuses (editable from the dashboard)
-- ---------------------------------------------------------------------
create table public.request_statuses (
  key            text primary key,
  name_ar        text not null,
  name_fr        text not null,
  color          text not null default '#475569',
  icon           text,
  sort           int not null default 0,
  is_final       boolean not null default false,
  is_cancel      boolean not null default false,
  allow_download boolean not null default false,
  template_ar    text,
  template_fr    text
);

insert into public.request_statuses (key, name_ar, name_fr, color, icon, sort, is_final, is_cancel, allow_download, template_ar, template_fr) values
  ('received',     'مستلم',                 'Reçue',               '#2563EB', 'inbox',        1, false, false, false,
   'مرحباً {name} 👋\nتوصلنا بطلبكم "{service}" رقم {number}.\nيمكنكم تتبّعه هنا: {link}\n— مكتبة سويت هاوس', null),
  ('processing',   'قيد المعالجة',           'En traitement',       '#D97706', 'loader',       2, false, false, false,
   'مرحباً {name}، طلبكم "{service}" رقم {number} قيد المعالجة الآن ⏳\n{link}', null),
  ('waiting_docs', 'ينتظر وثائق من الزبون',  'Documents manquants', '#DC2626', 'file-warning', 3, false, false, false,
   'مرحباً {name}، نحتاج وثائق إضافية لإكمال طلبكم رقم {number}. المرجو رفعها من هنا: {link}', null),
  ('ready',        'جاهز',                  'Prêt',                '#16A34A', 'check-circle', 4, false, false, true,
   'مرحباً {name} 👋\nوثيقتكم "{service}" جاهزة ✅\nرقم الطلب: {number}\nللتحميل: {link}\n— مكتبة سويت هاوس', null),
  ('delivered',    'تم التسليم',             'Livrée',              '#0F172A', 'package-check', 5, true, false, true, null, null),
  ('cancelled',    'ملغى',                  'Annulée',             '#94A3B8', 'x-circle',     6, true, true, false, null, null);

-- ---------------------------------------------------------------------
-- Service requests
-- ---------------------------------------------------------------------
create table public.service_requests (
  id              uuid primary key default gen_random_uuid(),
  number          text not null unique,
  tracking_code   text not null unique,
  service_id      uuid references public.services(id),
  service_name_ar text not null,
  service_name_fr text not null,
  customer_id     uuid references public.customers(id),
  customer_name   text not null,
  phone           text not null,
  email           text,
  fields          jsonb not null default '{}'::jsonb,
  notes           text,
  status          text not null default 'received' references public.request_statuses(key) on update cascade,
  price           bigint not null default 0,
  payment_method  text not null default 'in_store' check (payment_method in ('in_store', 'bank_transfer')),
  payment_status  text not null default 'unpaid' check (payment_status in ('unpaid', 'proof_uploaded', 'paid')),
  paid_at         timestamptz,
  paid_by         uuid references public.employees(id),
  internal_notes  text,
  assigned_to     uuid references public.employees(id),
  consent_at      timestamptz not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger service_requests_updated before update on public.service_requests for each row execute function public.set_updated_at();
create index service_requests_created_idx on public.service_requests (created_at desc);
create index service_requests_phone_idx on public.service_requests (phone);

create table public.request_history (
  id          bigint generated always as identity primary key,
  request_id  uuid not null references public.service_requests(id) on delete cascade,
  status      text not null,
  note        text,
  employee_id uuid references public.employees(id),
  created_at  timestamptz not null default now()
);

create table public.request_files (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid references public.service_requests(id) on delete cascade,
  order_id    uuid,
  kind        text not null check (kind in ('upload', 'deliverable', 'payment_proof')),
  path        text not null unique,
  name        text not null,
  size        bigint,
  mime        text,
  uploaded_by uuid references public.employees(id),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- ---------------------------------------------------------------------
-- Online shop orders
-- ---------------------------------------------------------------------
create table public.online_orders (
  id              uuid primary key default gen_random_uuid(),
  number          text not null unique,
  tracking_code   text not null unique,
  customer_id     uuid references public.customers(id),
  customer_name   text not null,
  phone           text not null,
  email           text,
  delivery_method text not null check (delivery_method in ('delivery', 'pickup')),
  city            text,
  address         text,
  delivery_fee    bigint not null default 0,
  subtotal        bigint not null default 0,
  total           bigint not null default 0,
  payment_method  text not null check (payment_method in ('cod', 'in_store', 'bank_transfer')),
  payment_status  text not null default 'unpaid' check (payment_status in ('unpaid', 'proof_uploaded', 'paid')),
  paid_at         timestamptz,
  status          text not null default 'new' check (status in ('new', 'confirmed', 'preparing', 'shipped', 'ready', 'delivered', 'cancelled')),
  stock_applied   boolean not null default false,
  notes           text,
  internal_notes  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger online_orders_updated before update on public.online_orders for each row execute function public.set_updated_at();
alter table public.request_files add constraint request_files_order_fk foreign key (order_id) references public.online_orders(id) on delete cascade;

create table public.online_order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.online_orders(id) on delete cascade,
  product_id  uuid references public.products(id),
  variant_id  uuid references public.product_variants(id),
  name_ar     text not null,
  name_fr     text not null,
  image       text,
  qty         numeric(12,3) not null check (qty > 0),
  unit_price  bigint not null,
  unit_cost   bigint not null default 0,
  total       bigint not null
);

create table public.order_history (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.online_orders(id) on delete cascade,
  status      text not null,
  note        text,
  employee_id uuid references public.employees(id),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.request_statuses   enable row level security;
alter table public.service_requests   enable row level security;
alter table public.request_history    enable row level security;
alter table public.request_files      enable row level security;
alter table public.online_orders      enable row level security;
alter table public.online_order_items enable row level security;
alter table public.order_history      enable row level security;

create policy statuses_read on public.request_statuses for select using (true);
create policy statuses_write on public.request_statuses for all using (public.has_perm('settings.manage')) with check (public.has_perm('settings.manage'));
create policy requests_read on public.service_requests for select using (public.has_perm('requests.manage') or public.has_perm('requests.view_documents'));
create policy requests_update on public.service_requests for update using (public.has_perm('requests.manage')) with check (public.has_perm('requests.manage'));
create policy request_history_read on public.request_history for select using (public.has_perm('requests.manage'));
create policy request_files_read on public.request_files for select using (public.has_perm('requests.view_documents') or public.has_perm('orders.manage'));
create policy orders_read on public.online_orders for select using (public.has_perm('orders.manage'));
create policy orders_update on public.online_orders for update using (public.has_perm('orders.manage')) with check (public.has_perm('orders.manage'));
create policy order_items_read on public.online_order_items for select using (public.has_perm('orders.manage'));
create policy order_history_read on public.order_history for select using (public.has_perm('orders.manage'));

revoke insert, delete on public.service_requests, public.request_history, public.request_files,
  public.online_orders, public.online_order_items, public.order_history from anon, authenticated;
revoke update on public.service_requests, public.online_orders from anon;
-- staff may only edit notes/assignment directly; status/payment go through functions
revoke update on public.service_requests, public.online_orders from authenticated;
grant update (internal_notes, assigned_to, price) on public.service_requests to authenticated;
grant update (internal_notes) on public.online_orders to authenticated;

-- Private bucket for customer documents (no public access; signed URLs only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('customer-docs', 'customer-docs', false, 10485760,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic',
              'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

create policy docs_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'customer-docs' and (public.has_perm('requests.view_documents') or public.has_perm('orders.manage')));
create policy docs_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'customer-docs' and (public.has_perm('requests.manage') or public.has_perm('orders.manage')));
create policy docs_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'customer-docs' and public.is_owner());

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.phone_digits(p text)
returns text language sql immutable as $$
  select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 9)
$$;

create or replace function public.random_code(p_len int default 8)
returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, p_len)
$$;

-- Find or create a customer from a public form
create or replace function public.customer_from_public(p_name text, p_phone text, p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_phone text := '212' || public.phone_digits(p_phone);
begin
  select id into v_id from customers where public.phone_digits(phone) = public.phone_digits(p_phone) and deleted_at is null limit 1;
  if v_id is null then
    insert into customers (full_name, phone, email) values (trim(p_name), v_phone, nullif(trim(p_email), '')) returning id into v_id;
  end if;
  return v_id;
end $$;
revoke execute on function public.customer_from_public(text, text, text) from public, anon, authenticated;

-- Anti-spam: limits per phone and globally
create or replace function public.public_rate_limit(p_phone text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from service_requests where public.phone_digits(phone) = public.phone_digits(p_phone) and created_at > now() - interval '1 hour')
   + (select count(*) from online_orders where public.phone_digits(phone) = public.phone_digits(p_phone) and created_at > now() - interval '1 hour') >= 6 then
    raise exception 'too_many_requests';
  end if;
  if (select count(*) from service_requests where created_at > now() - interval '1 minute')
   + (select count(*) from online_orders where created_at > now() - interval '1 minute') >= 20 then
    raise exception 'too_many_requests';
  end if;
end $$;
revoke execute on function public.public_rate_limit(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Public: submit a service request
-- p = {service_id, name, phone, email, fields:{}, notes, payment_method, consent:true, website:''(honeypot)}
-- ---------------------------------------------------------------------
create or replace function public.submit_service_request(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sv services;
  v_id uuid;
  v_num text;
  v_code text;
begin
  if coalesce(p->>'website', '') <> '' then raise exception 'spam'; end if;
  if not coalesce((p->>'consent')::boolean, false) then raise exception 'consent_required'; end if;
  if length(trim(coalesce(p->>'name', ''))) < 2 then raise exception 'name_required'; end if;
  if length(public.phone_digits(p->>'phone')) < 9 then raise exception 'phone_invalid'; end if;
  select * into v_sv from services where id = (p->>'service_id')::uuid and kind = 'admin' and is_online and is_active and deleted_at is null;
  if not found then raise exception 'service_not_found'; end if;
  perform public.public_rate_limit(p->>'phone');

  v_num := public.next_doc_number('request');
  loop
    v_code := public.random_code(8);
    exit when not exists (select 1 from service_requests where tracking_code = v_code);
  end loop;

  insert into service_requests (number, tracking_code, service_id, service_name_ar, service_name_fr, customer_id, customer_name,
                                phone, email, fields, notes, price, payment_method, consent_at)
  values (v_num, v_code, v_sv.id, v_sv.name_ar, v_sv.name_fr, public.customer_from_public(p->>'name', p->>'phone', p->>'email'),
          trim(p->>'name'), '212' || public.phone_digits(p->>'phone'), nullif(trim(p->>'email'), ''), coalesce(p->'fields', '{}'),
          nullif(trim(p->>'notes'), ''), v_sv.price,
          case when p->>'payment_method' = 'bank_transfer' then 'bank_transfer' else 'in_store' end, now())
  returning id into v_id;
  insert into request_history (request_id, status) values (v_id, 'received');
  perform public.notify('new_request', 'info', 'طلب خدمة جديد: ' || v_sv.name_ar, 'Nouvelle demande : ' || v_sv.name_fr,
                        v_num || ' · ' || trim(p->>'name'), '/requests');
  return jsonb_build_object('id', v_id, 'number', v_num, 'tracking_code', v_code);
end $$;
grant execute on function public.submit_service_request(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Public: submit a shop order. Prices and delivery fee are computed here.
-- p = {name, phone, email, delivery_method, city, address, payment_method, notes,
--      items:[{variant_id, qty}], consent, website}
-- ---------------------------------------------------------------------
create or replace function public.submit_order(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid();
  v_num text;
  v_code text;
  v_it jsonb;
  v_var product_variants;
  v_pr products;
  v_qty numeric;
  v_sub bigint := 0;
  v_fee bigint := 0;
  v_del jsonb;
  v_zone jsonb;
  v_pay jsonb;
  v_method text := coalesce(p->>'delivery_method', 'pickup');
  v_pm text := coalesce(p->>'payment_method', 'in_store');
begin
  if coalesce(p->>'website', '') <> '' then raise exception 'spam'; end if;
  if not coalesce((p->>'consent')::boolean, false) then raise exception 'consent_required'; end if;
  if length(trim(coalesce(p->>'name', ''))) < 2 then raise exception 'name_required'; end if;
  if length(public.phone_digits(p->>'phone')) < 9 then raise exception 'phone_invalid'; end if;
  if jsonb_array_length(coalesce(p->'items', '[]')) = 0 or jsonb_array_length(p->'items') > 50 then raise exception 'empty_sale'; end if;
  perform public.public_rate_limit(p->>'phone');

  select value into v_del from settings where key = 'delivery';
  select value into v_pay from settings where key = 'online_payments';
  if v_method = 'delivery' and not coalesce((v_del->>'enabled')::boolean, true) then raise exception 'delivery_disabled'; end if;
  if v_method = 'delivery' and length(trim(coalesce(p->>'address', ''))) < 5 then raise exception 'address_required'; end if;
  if v_pm = 'cod' and (v_method <> 'delivery' or not coalesce((v_pay->>'cod')::boolean, true)) then raise exception 'payment_method_invalid'; end if;
  if v_pm = 'bank_transfer' and not coalesce((v_pay->>'bank_transfer')::boolean, true) then raise exception 'payment_method_invalid'; end if;
  if v_pm = 'in_store' and not coalesce((v_pay->>'in_store')::boolean, true) then raise exception 'payment_method_invalid'; end if;
  if v_pm not in ('cod', 'in_store', 'bank_transfer') then raise exception 'payment_method_invalid'; end if;

  v_num := public.next_doc_number('order');
  loop
    v_code := public.random_code(8);
    exit when not exists (select 1 from online_orders where tracking_code = v_code);
  end loop;

  insert into online_orders (id, number, tracking_code, customer_id, customer_name, phone, email, delivery_method, city, address,
                             payment_method, notes)
  values (v_id, v_num, v_code, public.customer_from_public(p->>'name', p->>'phone', p->>'email'), trim(p->>'name'),
          '212' || public.phone_digits(p->>'phone'), nullif(trim(p->>'email'), ''), v_method, nullif(trim(p->>'city'), ''),
          nullif(trim(p->>'address'), ''), v_pm, nullif(trim(p->>'notes'), ''));

  for v_it in select * from jsonb_array_elements(p->'items') loop
    v_qty := (v_it->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 999 then raise exception 'invalid_qty'; end if;
    select * into v_var from product_variants where id = (v_it->>'variant_id')::uuid and deleted_at is null;
    if not found then raise exception 'variant_not_found'; end if;
    select * into v_pr from products where id = v_var.product_id and is_online and deleted_at is null;
    if not found then raise exception 'variant_not_found'; end if;
    if v_pr.track_stock and v_var.stock_qty < v_qty then raise exception 'out_of_stock:%', v_pr.name_ar; end if;
    insert into online_order_items (order_id, product_id, variant_id, name_ar, name_fr, image, qty, unit_price, unit_cost, total)
    values (v_id, v_pr.id, v_var.id, v_pr.name_ar || coalesce(' - ' || v_var.name_ar, ''), v_pr.name_fr || coalesce(' - ' || v_var.name_fr, ''),
            coalesce(v_var.image_url, v_pr.images[1]), v_qty, v_var.price,
            coalesce((select cost from product_costs where variant_id = v_var.id), 0), round(v_qty * v_var.price)::bigint);
    v_sub := v_sub + round(v_qty * v_var.price)::bigint;
  end loop;

  if v_method = 'delivery' then
    select z into v_zone from jsonb_array_elements(coalesce(v_del->'zones', '[]')) z
     where lower(z->>'city') = lower(trim(p->>'city')) or z->>'city_ar' = trim(p->>'city') limit 1;
    v_fee := coalesce((v_zone->>'price')::bigint, (v_del->>'default_price')::bigint, 0);
    if (v_del->>'free_above') is not null and v_sub >= (v_del->>'free_above')::bigint then v_fee := 0; end if;
  end if;

  update online_orders set subtotal = v_sub, delivery_fee = v_fee, total = v_sub + v_fee where id = v_id;
  insert into order_history (order_id, status) values (v_id, 'new');
  perform public.notify('new_order', 'info', 'طلب جديد من المتجر', 'Nouvelle commande', v_num || ' · ' || round((v_sub + v_fee) / 100.0, 2) || ' DH', '/orders');
  return jsonb_build_object('id', v_id, 'number', v_num, 'tracking_code', v_code, 'total', v_sub + v_fee, 'delivery_fee', v_fee);
end $$;
grant execute on function public.submit_order(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Public: tracking (code + phone must match)
-- ---------------------------------------------------------------------
create or replace function public.track(p_code text, p_phone text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_r service_requests;
  v_o online_orders;
  v_st request_statuses;
  v_pay jsonb;
begin
  select value into v_pay from settings where key = 'online_payments';
  select * into v_r from service_requests where tracking_code = upper(trim(p_code));
  if found then
    if public.phone_digits(v_r.phone) <> public.phone_digits(p_phone) then raise exception 'not_found'; end if;
    select * into v_st from request_statuses where key = v_r.status;
    return jsonb_build_object(
      'kind', 'request', 'number', v_r.number, 'tracking_code', v_r.tracking_code,
      'service_name_ar', v_r.service_name_ar, 'service_name_fr', v_r.service_name_fr, 'customer_name', v_r.customer_name,
      'status', to_jsonb(v_st), 'price', v_r.price, 'payment_method', v_r.payment_method, 'payment_status', v_r.payment_status,
      'created_at', v_r.created_at,
      'statuses', (select jsonb_agg(to_jsonb(s) order by s.sort) from request_statuses s where not s.is_cancel),
      'history', (select coalesce(jsonb_agg(jsonb_build_object('status', h.status, 'note', h.note, 'created_at', h.created_at) order by h.created_at), '[]')
                    from request_history h where h.request_id = v_r.id),
      'uploads', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'kind', f.kind, 'created_at', f.created_at) order by f.created_at), '[]')
                    from request_files f where f.request_id = v_r.id and f.kind in ('upload', 'payment_proof') and f.deleted_at is null),
      'deliverables', case when v_st.allow_download and (v_r.payment_status = 'paid' or v_r.price = 0) then
                        (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'size', f.size) order by f.created_at), '[]')
                           from request_files f where f.request_id = v_r.id and f.kind = 'deliverable' and f.deleted_at is null)
                      else '[]'::jsonb end,
      'deliverables_locked', v_st.allow_download and v_r.payment_status <> 'paid' and v_r.price > 0
                             and exists (select 1 from request_files f where f.request_id = v_r.id and f.kind = 'deliverable' and f.deleted_at is null),
      'bank', case when v_r.payment_method = 'bank_transfer' then jsonb_build_object('bank_name', v_pay->>'bank_name', 'rib', v_pay->>'rib', 'holder', v_pay->>'account_holder') end);
  end if;

  select * into v_o from online_orders where tracking_code = upper(trim(p_code));
  if found then
    if public.phone_digits(v_o.phone) <> public.phone_digits(p_phone) then raise exception 'not_found'; end if;
    return to_jsonb(v_o) - 'internal_notes' - 'customer_id' - 'stock_applied' || jsonb_build_object(
      'kind', 'order',
      'items', (select coalesce(jsonb_agg(jsonb_build_object('name_ar', i.name_ar, 'name_fr', i.name_fr, 'qty', i.qty, 'unit_price', i.unit_price,
                 'total', i.total, 'image', i.image)), '[]') from online_order_items i where i.order_id = v_o.id),
      'history', (select coalesce(jsonb_agg(jsonb_build_object('status', h.status, 'note', h.note, 'created_at', h.created_at) order by h.created_at), '[]')
                    from order_history h where h.order_id = v_o.id),
      'uploads', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'kind', f.kind)), '[]')
                    from request_files f where f.order_id = v_o.id and f.deleted_at is null),
      'bank', case when v_o.payment_method = 'bank_transfer' then jsonb_build_object('bank_name', v_pay->>'bank_name', 'rib', v_pay->>'rib', 'holder', v_pay->>'account_holder') end);
  end if;
  raise exception 'not_found';
end $$;
grant execute on function public.track(text, text) to anon, authenticated;

-- Called by the public-files Edge Function only (service role): resolve a
-- tracking code + phone to the request/order id the caller may access.
create or replace function public.resolve_tracking(p_code text, p_phone text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('kind', 'request', 'id', r.id, 'files',
        (select count(*) from request_files f where f.request_id = r.id and f.kind <> 'deliverable'),
        'can_download', s.allow_download and (r.payment_status = 'paid' or r.price = 0))
       from service_requests r join request_statuses s on s.key = r.status
      where r.tracking_code = upper(trim(p_code)) and public.phone_digits(r.phone) = public.phone_digits(p_phone)),
    (select jsonb_build_object('kind', 'order', 'id', o.id, 'files',
        (select count(*) from request_files f where f.order_id = o.id), 'can_download', false)
       from online_orders o
      where o.tracking_code = upper(trim(p_code)) and public.phone_digits(o.phone) = public.phone_digits(p_phone)))
$$;
revoke execute on function public.resolve_tracking(text, text) from public, anon, authenticated;
grant execute on function public.resolve_tracking(text, text) to service_role;

-- ---------------------------------------------------------------------
-- Staff: requests
-- ---------------------------------------------------------------------
create or replace function public.set_request_status(p_id uuid, p_status text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('requests.manage') then raise exception 'forbidden'; end if;
  if not exists (select 1 from request_statuses where key = p_status) then raise exception 'invalid_status'; end if;
  update service_requests set status = p_status where id = p_id;
  if not found then raise exception 'not_found'; end if;
  insert into request_history (request_id, status, note, employee_id) values (p_id, p_status, p_note, public.current_employee_id());
  perform public.log_activity('custom', 'requests', p_id::text, (select number from service_requests where id = p_id), jsonb_build_object('status', p_status));
  return public.request_detail(p_id);
end $$;

create or replace function public.confirm_request_payment(p_id uuid, p_amount bigint, p_method text, p_device uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_shift uuid;
  v_r service_requests;
begin
  if not (public.has_perm('payments.confirm_transfer') or (p_method = 'cash' and public.has_perm('requests.manage'))) then raise exception 'forbidden'; end if;
  select * into v_r from service_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_r.payment_status = 'paid' then raise exception 'already_paid'; end if;
  if p_amount is not null and p_amount >= 0 then update service_requests set price = p_amount where id = p_id; end if;
  if p_method = 'cash' then
    v_shift := public.require_open_shift(p_device);
    insert into cash_movements (shift_id, type, amount, ref_id, customer_id, note, employee_id)
    values (v_shift, 'online_payment', coalesce(p_amount, v_r.price), p_id, v_r.customer_id, v_r.number, public.current_employee_id());
  end if;
  update service_requests set payment_status = 'paid', paid_at = now(), paid_by = public.current_employee_id(),
         payment_method = case when p_method = 'transfer' then 'bank_transfer' else 'in_store' end
   where id = p_id;
  insert into request_history (request_id, status, note, employee_id) values (p_id, v_r.status, 'payment_confirmed', public.current_employee_id());
  perform public.log_activity('custom', 'requests', p_id::text, v_r.number, jsonb_build_object('paid', coalesce(p_amount, v_r.price), 'method', p_method));
  return public.request_detail(p_id);
end $$;

create or replace function public.register_staff_file(p_request uuid, p_order uuid, p_path text, p_name text, p_size bigint, p_mime text, p_kind text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not (public.has_perm('requests.manage') or public.has_perm('orders.manage')) then raise exception 'forbidden'; end if;
  insert into request_files (request_id, order_id, kind, path, name, size, mime, uploaded_by)
  values (p_request, p_order, p_kind, p_path, p_name, p_size, p_mime, public.current_employee_id()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.delete_request_file(p_file uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_perm('requests.manage') or public.is_owner()) then raise exception 'forbidden'; end if;
  update request_files set deleted_at = now() where id = p_file;
end $$;

create or replace function public.request_detail(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(r) || jsonb_build_object(
    'service', (select jsonb_build_object('id', s.id, 'fields', s.fields, 'required_documents', s.required_documents, 'official_url', s.official_url)
                  from services s where s.id = r.service_id),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('status', h.status, 'note', h.note, 'created_at', h.created_at, 'employee_name', e.full_name) order by h.created_at), '[]')
                  from request_history h left join employees e on e.id = h.employee_id where h.request_id = r.id),
    'files', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'name', f.name, 'path', f.path, 'size', f.size, 'mime', f.mime, 'created_at', f.created_at) order by f.created_at), '[]')
                from request_files f where f.request_id = r.id and f.deleted_at is null))
  from service_requests r
  where r.id = p_id and (public.has_perm('requests.manage') or public.has_perm('requests.view_documents'))
$$;

-- ---------------------------------------------------------------------
-- Staff: orders (stock is taken when confirmed, returned when cancelled)
-- ---------------------------------------------------------------------
create or replace function public.order_detail(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(o) || jsonb_build_object(
    'items', (select coalesce(jsonb_agg(to_jsonb(i)), '[]') from online_order_items i where i.order_id = o.id),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('status', h.status, 'note', h.note, 'created_at', h.created_at, 'employee_name', e.full_name) order by h.created_at), '[]')
                  from order_history h left join employees e on e.id = h.employee_id where h.order_id = o.id),
    'files', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'name', f.name, 'path', f.path)), '[]')
                from request_files f where f.order_id = o.id and f.deleted_at is null))
  from online_orders o where o.id = p_id and public.has_perm('orders.manage')
$$;

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

create or replace function public.confirm_order_payment(p_id uuid, p_method text, p_device uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_o online_orders;
  v_shift uuid;
begin
  if not (public.has_perm('payments.confirm_transfer') or (p_method = 'cash' and public.has_perm('orders.manage'))) then raise exception 'forbidden'; end if;
  select * into v_o from online_orders where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_o.payment_status = 'paid' then raise exception 'already_paid'; end if;
  if p_method = 'cash' then
    v_shift := public.require_open_shift(p_device);
    insert into cash_movements (shift_id, type, amount, ref_id, customer_id, note, employee_id)
    values (v_shift, 'online_payment', v_o.total, p_id, v_o.customer_id, v_o.number, public.current_employee_id());
  end if;
  update online_orders set payment_status = 'paid', paid_at = now() where id = p_id;
  insert into order_history (order_id, status, note, employee_id) values (p_id, v_o.status, 'payment_confirmed', public.current_employee_id());
  perform public.log_activity('custom', 'orders', p_id::text, v_o.number, jsonb_build_object('paid', v_o.total, 'method', p_method));
  return public.order_detail(p_id);
end $$;

-- Online revenue for reports
create or replace function public.online_summary(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'orders_count', (select count(*) from online_orders where created_at >= p_from and created_at < p_to),
    'orders_paid', (select coalesce(sum(total), 0) from online_orders where payment_status = 'paid' and paid_at >= p_from and paid_at < p_to),
    'orders_cogs', (select coalesce(sum(i.unit_cost * i.qty), 0)::bigint from online_order_items i join online_orders o on o.id = i.order_id
                     where o.payment_status = 'paid' and o.paid_at >= p_from and o.paid_at < p_to),
    'requests_count', (select count(*) from service_requests where created_at >= p_from and created_at < p_to),
    'requests_paid', (select coalesce(sum(price), 0) from service_requests where payment_status = 'paid' and paid_at >= p_from and paid_at < p_to),
    'by_service', (select coalesce(jsonb_agg(t order by t.count desc), '[]') from (
        select service_name_ar name_ar, service_name_fr name_fr, count(*) count, coalesce(sum(price) filter (where payment_status = 'paid'), 0) paid
          from service_requests where created_at >= p_from and created_at < p_to group by 1, 2 limit 15) t))
  where public.has_perm('reports.sales')
$$;

-- Pending counters for badges
create or replace function public.online_pending()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'requests', (select count(*) from service_requests r join request_statuses s on s.key = r.status where not s.is_final),
    'requests_new', (select count(*) from service_requests where status = 'received'),
    'orders', (select count(*) from online_orders where status not in ('delivered', 'cancelled')),
    'orders_new', (select count(*) from online_orders where status = 'new'),
    'proofs', (select count(*) from service_requests where payment_status = 'proof_uploaded')
            + (select count(*) from online_orders where payment_status = 'proof_uploaded'))
  where public.is_staff()
$$;

-- ---------------------------------------------------------------------
-- Website content & WhatsApp templates (editable from the dashboard)
-- ---------------------------------------------------------------------
insert into public.settings (key, value, is_public) values ('website', jsonb_build_object(
  'announcement', jsonb_build_object('enabled', false, 'text_ar', '', 'text_fr', ''),
  'hero', jsonb_build_object(
    'title_ar', 'مكتبتك وخدماتك الإدارية في مكان واحد',
    'title_fr', 'Votre librairie et vos démarches au même endroit',
    'subtitle_ar', 'أدوات مدرسية ومكتبية، وإنجاز وثائقك الإدارية والإلكترونية بسرعة وأمان، مع التوصيل لكل المغرب.',
    'subtitle_fr', 'Fournitures scolaires et de bureau, démarches administratives en ligne rapides et sûres, livraison partout au Maroc.',
    'image_url', null),
  'features', jsonb_build_array(
    jsonb_build_object('icon', 'file-badge', 'title_ar', 'وثائق إدارية', 'title_fr', 'Documents administratifs', 'text_ar', 'أكثر من 40 خدمة إلكترونية', 'text_fr', 'Plus de 40 services en ligne'),
    jsonb_build_object('icon', 'shopping-bag', 'title_ar', 'متجر أونلاين', 'title_fr', 'Boutique en ligne', 'text_ar', 'اطلب أدواتك من البيت', 'text_fr', 'Commandez depuis chez vous'),
    jsonb_build_object('icon', 'package', 'title_ar', 'توصيل لكل المغرب', 'title_fr', 'Livraison au Maroc', 'text_ar', 'أو الاستلام من المحل', 'text_fr', 'Ou retrait en boutique'),
    jsonb_build_object('icon', 'sparkles', 'title_ar', 'سرية وأمان', 'title_fr', 'Sécurité', 'text_ar', 'وثائقك محمية ولا يراها غيرنا', 'text_fr', 'Vos documents sont protégés')),
  'about', jsonb_build_object(
    'title_ar', 'من نحن', 'title_fr', 'Qui sommes-nous',
    'text_ar', 'سويت هاوس مكتبة في قلب تطوان، نوفر الأدوات المدرسية والمكتبية ونساعدكم في إنجاز كل إجراءاتكم الإدارية والإلكترونية دون عناء التنقل.',
    'text_fr', 'Sweet House est une librairie au cœur de Tétouan : fournitures scolaires et de bureau, et accompagnement dans toutes vos démarches administratives en ligne.'),
  'faq', jsonb_build_array(
    jsonb_build_object('q_ar', 'كيف أتابع طلبي؟', 'q_fr', 'Comment suivre ma demande ?',
      'a_ar', 'من صفحة "تتبّع الطلب" برقم التتبّع ورقم هاتفك، وستصلك رسالة واتساب عند جاهزية الوثيقة.',
      'a_fr', 'Depuis la page « Suivi » avec votre code et votre téléphone. Vous recevrez aussi un message WhatsApp.'),
    jsonb_build_object('q_ar', 'هل وثائقي في أمان؟', 'q_fr', 'Mes documents sont-ils en sécurité ?',
      'a_ar', 'نعم، تُحفظ في مكان مشفّر ولا يطّلع عليها إلا فريقنا لإنجاز طلبك.', 'a_fr', 'Oui, ils sont stockés de façon sécurisée et seule notre équipe y accède.'),
    jsonb_build_object('q_ar', 'كيف أدفع؟', 'q_fr', 'Comment payer ?',
      'a_ar', 'نقداً في المحل، أو بتحويل بنكي، أو عند الاستلام بالنسبة للطلبات الموصّلة.', 'a_fr', 'En boutique, par virement, ou à la livraison.')),
  'sections', jsonb_build_object('features', true, 'featured', true, 'services', true, 'about', true, 'faq', true),
  'seo', jsonb_build_object('description_ar', 'مكتبة سويت هاوس بتطوان: أدوات مدرسية ومكتبية وخدمات إدارية وإلكترونية مع التوصيل لكل المغرب.',
                            'description_fr', 'Librairie Sweet House à Tétouan : fournitures, services administratifs en ligne, livraison au Maroc.'),
  'legal', jsonb_build_object(
    'privacy_ar', 'نجمع المعلومات التي تقدمونها (الاسم، الهاتف، الوثائق) فقط لإنجاز طلباتكم. لا نشارك معطياتكم مع أي طرف ثالث إلا الإدارات المعنية بطلبكم. يمكنكم طلب حذف معطياتكم في أي وقت عبر التواصل معنا. وفقاً للقانون 09-08 المتعلق بحماية الأشخاص الذاتيين تجاه معالجة المعطيات ذات الطابع الشخصي.',
    'privacy_fr', 'Nous collectons vos informations (nom, téléphone, documents) uniquement pour traiter vos demandes. Elles ne sont partagées qu’avec les administrations concernées. Vous pouvez demander leur suppression à tout moment, conformément à la loi 09-08.',
    'terms_ar', 'الأسعار المعروضة بالدرهم وشاملة للضريبة. مدة الإنجاز تقديرية وقد تتغير حسب الإدارة المعنية. الطلب يُعتبر مؤكداً بعد تواصلنا معكم.',
    'terms_fr', 'Les prix sont en dirhams TTC. Les délais sont indicatifs et dépendent des administrations. Une commande est confirmée après notre contact.')
), true)
on conflict (key) do nothing;

update public.settings set value = value || jsonb_build_object('templates', jsonb_build_object(
  'order_received', 'مرحباً {name} 👋\nتوصلنا بطلبكم رقم {number} بمبلغ {total}.\nسنتواصل معكم لتأكيده. للتتبّع: {link}\n— مكتبة سويت هاوس',
  'order_confirmed', 'مرحباً {name}، تم تأكيد طلبكم رقم {number} ✅\nللتتبّع: {link}',
  'order_shipped', 'مرحباً {name}، طلبكم رقم {number} في الطريق إليكم 🚚\n{link}',
  'order_ready', 'مرحباً {name}، طلبكم رقم {number} جاهز للاستلام من المحل 🛍️',
  'debt_reminder', 'مرحباً {name} 👋\nنذكّركم بأن الرصيد المتبقي في حسابكم لدى مكتبة سويت هاوس هو {amount}.\nشكراً لثقتكم 🌟'))
where key = 'whatsapp' and not (value ? 'templates');

-- Public read of request statuses / website already allowed. Staff read of
-- customer docs is via signed URLs created with the staff session.
