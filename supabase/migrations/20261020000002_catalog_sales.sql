-- =====================================================================
-- Sweet House — catalog (products, services), customers, sales, stock
-- =====================================================================

-- ---------------------------------------------------------------------
-- Product categories & products
-- ---------------------------------------------------------------------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references public.categories(id) on delete set null,
  name_ar    text not null,
  name_fr    text not null,
  icon       text,
  color      text not null default '#FF6B35',
  image_url  text,
  sort       int  not null default 0,
  is_online  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger categories_updated before update on public.categories
  for each row execute function public.set_updated_at();

create table public.products (
  id              uuid primary key default gen_random_uuid(),
  category_id     uuid references public.categories(id) on delete set null,
  name_ar         text not null,
  name_fr         text not null,
  description_ar  text,
  description_fr  text,
  brand           text,
  images          text[] not null default '{}',
  tax_rate        numeric(5,2) not null default 20,
  track_stock     boolean not null default true,
  low_stock_alert numeric(12,3) not null default 5,
  has_variants    boolean not null default false,
  is_online       boolean not null default false,
  is_featured     boolean not null default false,
  sort            int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create trigger products_updated before update on public.products
  for each row execute function public.set_updated_at();
create index products_category_idx on public.products (category_id) where deleted_at is null;

-- A product always has at least one variant (the default one).
create table public.product_variants (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products(id) on delete cascade,
  name_ar          text,
  name_fr          text,
  sku              text,
  barcode          text,
  price            bigint not null check (price >= 0),
  compare_at_price bigint,
  stock_qty        numeric(12,3) not null default 0,
  image_url        text,
  is_default       boolean not null default false,
  sort             int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create trigger variants_updated before update on public.product_variants
  for each row execute function public.set_updated_at();
create unique index variants_barcode_uq on public.product_variants (barcode)
  where barcode is not null and deleted_at is null;
create index variants_product_idx on public.product_variants (product_id);

-- Packaging: sell a box of N units with its own barcode and price.
create table public.product_packs (
  id         uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  name_ar    text not null,
  name_fr    text not null,
  factor     numeric(12,3) not null check (factor > 0),
  barcode    text,
  price      bigint not null check (price >= 0),
  sort       int not null default 0,
  deleted_at timestamptz
);
create unique index packs_barcode_uq on public.product_packs (barcode)
  where barcode is not null and deleted_at is null;

-- Purchase cost per base unit, hidden from staff without products.view_cost.
create table public.product_costs (
  variant_id uuid primary key references public.product_variants(id) on delete cascade,
  cost       bigint not null default 0 check (cost >= 0),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Services: counter services (copies, scan…) and administrative e-services
-- ---------------------------------------------------------------------
create table public.service_categories (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('counter', 'admin')),
  name_ar    text not null,
  name_fr    text not null,
  icon       text,
  color      text not null default '#FF6B35',
  sort       int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger service_categories_updated before update on public.service_categories
  for each row execute function public.set_updated_at();

create table public.services (
  id                 uuid primary key default gen_random_uuid(),
  category_id        uuid references public.service_categories(id) on delete set null,
  kind               text not null check (kind in ('counter', 'admin')),
  system_key         text unique,
  name_ar            text not null,
  name_fr            text not null,
  description_ar     text,
  description_fr     text,
  pricing_mode       text not null default 'fixed' check (pricing_mode in ('fixed', 'tiered', 'open')),
  price              bigint not null default 0 check (price >= 0),
  unit_ar            text,
  unit_fr            text,
  tax_rate           numeric(5,2) not null default 20,
  icon               text,
  image_url          text,
  pos_quick          boolean not null default false,
  pos_color          text,
  pos_sort           int not null default 0,
  is_online          boolean not null default true,
  duration_ar        text,
  duration_fr        text,
  official_url       text,
  required_documents jsonb not null default '[]'::jsonb, -- [{name_ar,name_fr,required}]
  fields             jsonb not null default '[]'::jsonb, -- [{key,label_ar,label_fr,type,required,options}]
  sort               int not null default 0,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);
create trigger services_updated before update on public.services
  for each row execute function public.set_updated_at();

create table public.service_price_tiers (
  id         uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  min_qty    numeric(12,3) not null check (min_qty > 0),
  unit_price bigint not null check (unit_price >= 0),
  unique (service_id, min_qty)
);

-- ---------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------
create table public.customers (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  phone        text,
  email        text,
  company_name text,
  ice          text,
  address      text,
  city         text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create trigger customers_updated before update on public.customers
  for each row execute function public.set_updated_at();
create unique index customers_phone_uq on public.customers (phone)
  where phone is not null and deleted_at is null;

-- ---------------------------------------------------------------------
-- Sales
-- ---------------------------------------------------------------------
create table public.sales (
  id             uuid primary key default gen_random_uuid(),
  number         text not null unique,
  status         text not null default 'completed' check (status in ('completed', 'voided')),
  customer_id    uuid references public.customers(id),
  employee_id    uuid not null references public.employees(id),
  device_id      uuid references public.devices(id),
  shift_id       uuid,
  subtotal       bigint not null default 0,  -- before any discount
  discount_total bigint not null default 0,  -- line + order discounts
  total          bigint not null default 0,
  tax_total      bigint not null default 0,
  cash_received  bigint not null default 0,
  change_given   bigint not null default 0,
  paid_cash      bigint not null default 0,  -- cash kept in drawer
  paid_card      bigint not null default 0,
  paid_credit    bigint not null default 0,
  note           text,
  source         text not null default 'pos',
  voided_at      timestamptz,
  voided_by      uuid references public.employees(id),
  void_reason    text,
  created_at     timestamptz not null default now()
);
create index sales_created_idx on public.sales (created_at desc);
create index sales_employee_idx on public.sales (employee_id, created_at desc);

create table public.sale_items (
  id                  uuid primary key default gen_random_uuid(),
  sale_id             uuid not null references public.sales(id) on delete cascade,
  line_no             int not null,
  item_type           text not null check (item_type in ('product', 'service')),
  product_id          uuid references public.products(id),
  variant_id          uuid references public.product_variants(id),
  pack_id             uuid references public.product_packs(id),
  service_id          uuid references public.services(id),
  name_ar             text not null,
  name_fr             text not null,
  qty                 numeric(12,3) not null check (qty > 0),
  base_qty            numeric(12,3) not null,
  unit_price          bigint not null,
  original_unit_price bigint not null,
  discount            bigint not null default 0,
  total               bigint not null,
  tax_rate            numeric(5,2) not null default 0,
  unit_cost           bigint not null default 0
);
create index sale_items_sale_idx on public.sale_items (sale_id);

-- ---------------------------------------------------------------------
-- Stock movements (stock_qty on variants is maintained from here)
-- ---------------------------------------------------------------------
create table public.stock_movements (
  id          bigint generated always as identity primary key,
  variant_id  uuid not null references public.product_variants(id) on delete cascade,
  qty_change  numeric(12,3) not null,
  reason      text not null check (reason in ('initial', 'sale', 'void', 'refund', 'purchase', 'adjustment', 'inventory')),
  ref_id      uuid,
  note        text,
  employee_id uuid references public.employees(id),
  created_at  timestamptz not null default now()
);
create index stock_movements_variant_idx on public.stock_movements (variant_id, created_at desc);

create or replace function public.apply_stock_movement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update product_variants set stock_qty = stock_qty + new.qty_change where id = new.variant_id;
  return new;
end $$;
create trigger stock_movements_apply after insert on public.stock_movements
  for each row execute function public.apply_stock_movement();

-- ---------------------------------------------------------------------
-- Audit triggers
-- ---------------------------------------------------------------------
create trigger audit_categories after insert or update or delete on public.categories
  for each row execute function public.audit_row();
create trigger audit_products after insert or update or delete on public.products
  for each row execute function public.audit_row();
create trigger audit_service_categories after insert or update or delete on public.service_categories
  for each row execute function public.audit_row();
create trigger audit_services after insert or update or delete on public.services
  for each row execute function public.audit_row();
create trigger audit_customers after insert or update or delete on public.customers
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.categories          enable row level security;
alter table public.products            enable row level security;
alter table public.product_variants    enable row level security;
alter table public.product_packs       enable row level security;
alter table public.product_costs       enable row level security;
alter table public.service_categories  enable row level security;
alter table public.services            enable row level security;
alter table public.service_price_tiers enable row level security;
alter table public.customers           enable row level security;
alter table public.sales               enable row level security;
alter table public.sale_items          enable row level security;
alter table public.stock_movements     enable row level security;

-- Website visitors see published, non-deleted catalog rows.
create policy categories_read on public.categories for select
  using (public.is_staff() or (is_online and deleted_at is null));
create policy categories_write on public.categories for all
  using (public.has_perm('products.manage')) with check (public.has_perm('products.manage'));

create policy products_read on public.products for select
  using (public.is_staff() or (is_online and deleted_at is null));
create policy products_write on public.products for update
  using (public.has_perm('products.manage')) with check (public.has_perm('products.manage'));

create policy variants_read on public.product_variants for select
  using (public.is_staff() or (deleted_at is null and exists (
    select 1 from products p where p.id = product_id and p.is_online and p.deleted_at is null)));

create policy packs_read on public.product_packs for select using (public.is_staff());

create policy costs_read on public.product_costs for select using (public.has_perm('products.view_cost'));

create policy service_categories_read on public.service_categories for select
  using (public.is_staff() or deleted_at is null);
create policy service_categories_write on public.service_categories for all
  using (public.has_perm('services.manage')) with check (public.has_perm('services.manage'));

create policy services_read on public.services for select
  using (public.is_staff() or (is_online and is_active and deleted_at is null));
create policy services_write on public.services for update
  using (public.has_perm('services.manage')) with check (public.has_perm('services.manage'));

create policy tiers_read on public.service_price_tiers for select using (true);

create policy customers_read on public.customers for select using (public.is_staff());
create policy customers_insert on public.customers for insert
  with check (public.has_perm('pos.sell') or public.has_perm('customers.manage'));
create policy customers_update on public.customers for update
  using (public.has_perm('customers.manage')) with check (public.has_perm('customers.manage'));

create policy sales_read on public.sales for select
  using (employee_id = public.current_employee_id() or public.has_perm('reports.sales'));
create policy sale_items_read on public.sale_items for select
  using (exists (select 1 from sales s where s.id = sale_id));

create policy stock_read on public.stock_movements for select
  using (public.has_perm('products.manage') or public.has_perm('stock.adjust'));

-- Unit cost on sale lines is only exposed through report functions.
revoke select on public.sale_items from anon, authenticated;
grant select (id, sale_id, line_no, item_type, product_id, variant_id, pack_id, service_id,
              name_ar, name_fr, qty, base_qty, unit_price, original_unit_price, discount, total, tax_rate)
  on public.sale_items to authenticated;
revoke insert, update, delete on public.sale_items, public.sales, public.stock_movements from anon, authenticated;

-- ---------------------------------------------------------------------
-- Internal EAN-13 barcodes (prefix 200 = in-store use)
-- ---------------------------------------------------------------------
create sequence public.internal_barcode_seq start 1;

create or replace function public.ean13_check_digit(d12 text)
returns int language sql immutable as $$
  select (10 - (sum(substr(d12, i, 1)::int * case when i % 2 = 0 then 3 else 1 end) % 10)) % 10
  from generate_series(1, 12) i
$$;

create or replace function public.generate_barcode()
returns text language plpgsql security definer set search_path = public as $$
declare
  code text;
begin
  loop
    code := '200' || lpad(nextval('internal_barcode_seq')::text, 9, '0');
    code := code || public.ean13_check_digit(code)::text;
    exit when not exists (select 1 from product_variants where barcode = code)
          and not exists (select 1 from product_packs where barcode = code);
  end loop;
  return code;
end $$;

-- ---------------------------------------------------------------------
-- save_product: product + variants + packs + costs in one transaction
-- p = {id?, category_id, name_ar, name_fr, ..., variants:[{id?, name_ar, name_fr, sku,
--      barcode, price, compare_at_price, cost?, initial_stock?, packs:[{id?, name_ar,
--      name_fr, factor, barcode, price}]}]}
-- ---------------------------------------------------------------------
create or replace function public.save_product(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pid uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
  is_new boolean := not exists (select 1 from products where id = pid);
  v jsonb; pk jsonb;
  vid uuid; pkid uuid;
  keep_variants uuid[] := '{}';
  keep_packs uuid[];
  bc text;
  vsort int := 0; psort int;
  can_cost boolean := public.has_perm('products.view_cost');
begin
  if not public.has_perm('products.manage') then raise exception 'forbidden'; end if;
  if jsonb_array_length(coalesce(p->'variants', '[]')) = 0 then raise exception 'variant_required'; end if;

  insert into products (id, category_id, name_ar, name_fr, description_ar, description_fr, brand, images,
                        tax_rate, track_stock, low_stock_alert, has_variants, is_online, is_featured, sort)
  values (pid, nullif(p->>'category_id', '')::uuid, p->>'name_ar', coalesce(nullif(p->>'name_fr', ''), p->>'name_ar'),
          p->>'description_ar', p->>'description_fr', p->>'brand',
          coalesce(array(select jsonb_array_elements_text(p->'images')), '{}'),
          coalesce((p->>'tax_rate')::numeric, 20), coalesce((p->>'track_stock')::boolean, true),
          coalesce((p->>'low_stock_alert')::numeric, 5), jsonb_array_length(p->'variants') > 1,
          coalesce((p->>'is_online')::boolean, false), coalesce((p->>'is_featured')::boolean, false),
          coalesce((p->>'sort')::int, 0))
  on conflict (id) do update set
    category_id = excluded.category_id, name_ar = excluded.name_ar, name_fr = excluded.name_fr,
    description_ar = excluded.description_ar, description_fr = excluded.description_fr,
    brand = excluded.brand, images = excluded.images, tax_rate = excluded.tax_rate,
    track_stock = excluded.track_stock, low_stock_alert = excluded.low_stock_alert,
    has_variants = excluded.has_variants, is_online = excluded.is_online,
    is_featured = excluded.is_featured, sort = excluded.sort;

  for v in select * from jsonb_array_elements(p->'variants') loop
    vid := coalesce(nullif(v->>'id', '')::uuid, gen_random_uuid());
    bc := nullif(trim(v->>'barcode'), '');
    if bc is not null and (
         exists (select 1 from product_variants where barcode = bc and id <> vid and deleted_at is null)
      or exists (select 1 from product_packs where barcode = bc and deleted_at is null)) then
      raise exception 'barcode_exists:%', bc;
    end if;
    if bc is null then bc := public.generate_barcode(); end if;

    insert into product_variants (id, product_id, name_ar, name_fr, sku, barcode, price, compare_at_price,
                                  image_url, is_default, sort, deleted_at)
    values (vid, pid, nullif(v->>'name_ar', ''), nullif(v->>'name_fr', ''), nullif(v->>'sku', ''), bc,
            coalesce((v->>'price')::bigint, 0), nullif(v->>'compare_at_price', '')::bigint,
            nullif(v->>'image_url', ''), vsort = 0, vsort, null)
    on conflict (id) do update set
      name_ar = excluded.name_ar, name_fr = excluded.name_fr, sku = excluded.sku, barcode = excluded.barcode,
      price = excluded.price, compare_at_price = excluded.compare_at_price, image_url = excluded.image_url,
      is_default = excluded.is_default, sort = excluded.sort, deleted_at = null
    where product_variants.product_id = pid;
    keep_variants := keep_variants || vid;

    if can_cost and v ? 'cost' then
      insert into product_costs (variant_id, cost, updated_at)
      values (vid, coalesce((v->>'cost')::bigint, 0), now())
      on conflict (variant_id) do update set cost = excluded.cost, updated_at = now();
    end if;

    if coalesce((v->>'initial_stock')::numeric, 0) <> 0
       and not exists (select 1 from stock_movements where variant_id = vid) then
      insert into stock_movements (variant_id, qty_change, reason, employee_id)
      values (vid, (v->>'initial_stock')::numeric, 'initial', public.current_employee_id());
    end if;

    keep_packs := '{}'; psort := 0;
    for pk in select * from jsonb_array_elements(coalesce(v->'packs', '[]')) loop
      pkid := coalesce(nullif(pk->>'id', '')::uuid, gen_random_uuid());
      bc := nullif(trim(pk->>'barcode'), '');
      if bc is not null and (
           exists (select 1 from product_variants where barcode = bc and deleted_at is null)
        or exists (select 1 from product_packs where barcode = bc and id <> pkid and deleted_at is null)) then
        raise exception 'barcode_exists:%', bc;
      end if;
      if bc is null then bc := public.generate_barcode(); end if;
      insert into product_packs (id, variant_id, name_ar, name_fr, factor, barcode, price, sort, deleted_at)
      values (pkid, vid, pk->>'name_ar', coalesce(nullif(pk->>'name_fr', ''), pk->>'name_ar'),
              (pk->>'factor')::numeric, bc, coalesce((pk->>'price')::bigint, 0), psort, null)
      on conflict (id) do update set
        name_ar = excluded.name_ar, name_fr = excluded.name_fr, factor = excluded.factor,
        barcode = excluded.barcode, price = excluded.price, sort = excluded.sort, deleted_at = null;
      keep_packs := keep_packs || pkid;
      psort := psort + 1;
    end loop;
    update product_packs set deleted_at = now()
     where variant_id = vid and deleted_at is null and not (id = any(keep_packs));

    vsort := vsort + 1;
  end loop;

  update product_variants set deleted_at = now()
   where product_id = pid and deleted_at is null and not (id = any(keep_variants));

  return pid;
end $$;

-- Manual stock adjustment (with reason).
create or replace function public.adjust_stock(p_variant uuid, p_change numeric, p_note text)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  q numeric;
begin
  if not public.has_perm('stock.adjust') then raise exception 'forbidden'; end if;
  if p_change = 0 then raise exception 'zero_change'; end if;
  insert into stock_movements (variant_id, qty_change, reason, note, employee_id)
  values (p_variant, p_change, 'adjustment', p_note, public.current_employee_id());
  select stock_qty into q from product_variants where id = p_variant;
  perform public.log_activity('custom', 'stock', p_variant::text,
    (select pr.name_ar from product_variants v join products pr on pr.id = v.product_id where v.id = p_variant),
    jsonb_build_object('change', p_change, 'note', p_note, 'new_qty', q));
  return q;
end $$;

-- ---------------------------------------------------------------------
-- save_service: service + price tiers
-- ---------------------------------------------------------------------
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
                        fields, sort, is_active)
  values (sid, nullif(p->>'category_id', '')::uuid, coalesce(p->>'kind', 'counter'), p->>'name_ar',
          coalesce(nullif(p->>'name_fr', ''), p->>'name_ar'), p->>'description_ar', p->>'description_fr',
          coalesce(p->>'pricing_mode', 'fixed'), coalesce((p->>'price')::bigint, 0), p->>'unit_ar', p->>'unit_fr',
          coalesce((p->>'tax_rate')::numeric, 20), p->>'icon', p->>'image_url',
          coalesce((p->>'pos_quick')::boolean, false), p->>'pos_color', coalesce((p->>'pos_sort')::int, 0),
          coalesce((p->>'is_online')::boolean, true), p->>'duration_ar', p->>'duration_fr', p->>'official_url',
          coalesce(p->'required_documents', '[]'), coalesce(p->'fields', '[]'),
          coalesce((p->>'sort')::int, 0), coalesce((p->>'is_active')::boolean, true))
  on conflict (id) do update set
    category_id = excluded.category_id, kind = excluded.kind, name_ar = excluded.name_ar,
    name_fr = excluded.name_fr, description_ar = excluded.description_ar, description_fr = excluded.description_fr,
    pricing_mode = case when services.system_key is null then excluded.pricing_mode else services.pricing_mode end,
    price = excluded.price, unit_ar = excluded.unit_ar, unit_fr = excluded.unit_fr, tax_rate = excluded.tax_rate,
    icon = excluded.icon, image_url = excluded.image_url, pos_quick = excluded.pos_quick,
    pos_color = excluded.pos_color, pos_sort = excluded.pos_sort, is_online = excluded.is_online,
    duration_ar = excluded.duration_ar, duration_fr = excluded.duration_fr, official_url = excluded.official_url,
    required_documents = excluded.required_documents, fields = excluded.fields, sort = excluded.sort,
    is_active = excluded.is_active;

  delete from service_price_tiers where service_id = sid;
  for t in select * from jsonb_array_elements(coalesce(p->'tiers', '[]')) loop
    insert into service_price_tiers (service_id, min_qty, unit_price)
    values (sid, (t->>'min_qty')::numeric, (t->>'unit_price')::bigint)
    on conflict do nothing;
  end loop;
  return sid;
end $$;

create or replace function public.service_unit_price(p_service uuid, p_qty numeric)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(
    (select t.unit_price from service_price_tiers t
      where t.service_id = s.id and s.pricing_mode = 'tiered' and t.min_qty <= p_qty
      order by t.min_qty desc limit 1),
    s.price)
  from services s where s.id = p_service
$$;

-- ---------------------------------------------------------------------
-- POS catalogue snapshot (also cached on the device for offline use)
-- ---------------------------------------------------------------------
create or replace function public.pos_catalog()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'categories', coalesce((select jsonb_agg(to_jsonb(c) order by c.sort, c.name_ar)
                            from categories c where c.deleted_at is null), '[]'),
    'products', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'category_id', p.category_id, 'name_ar', p.name_ar, 'name_fr', p.name_fr,
        'image', p.images[1], 'tax_rate', p.tax_rate, 'track_stock', p.track_stock,
        'low_stock_alert', p.low_stock_alert, 'has_variants', p.has_variants,
        'variants', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', v.id, 'name_ar', v.name_ar, 'name_fr', v.name_fr, 'sku', v.sku, 'barcode', v.barcode,
            'price', v.price, 'stock_qty', v.stock_qty, 'image_url', v.image_url,
            'packs', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', k.id, 'name_ar', k.name_ar, 'name_fr', k.name_fr, 'factor', k.factor,
                'barcode', k.barcode, 'price', k.price) order by k.sort), '[]')
              from product_packs k where k.variant_id = v.id and k.deleted_at is null)
          ) order by v.sort), '[]')
          from product_variants v where v.product_id = p.id and v.deleted_at is null)
      ) order by p.sort, p.name_ar) from products p where p.deleted_at is null), '[]'),
    'services', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'category_id', s.category_id, 'kind', s.kind, 'system_key', s.system_key,
        'name_ar', s.name_ar, 'name_fr', s.name_fr, 'pricing_mode', s.pricing_mode, 'price', s.price,
        'unit_ar', s.unit_ar, 'unit_fr', s.unit_fr, 'tax_rate', s.tax_rate, 'icon', s.icon,
        'pos_quick', s.pos_quick, 'pos_color', s.pos_color, 'pos_sort', s.pos_sort,
        'tiers', (select coalesce(jsonb_agg(jsonb_build_object('min_qty', t.min_qty, 'unit_price', t.unit_price)
                   order by t.min_qty), '[]') from service_price_tiers t where t.service_id = s.id)
      ) order by s.pos_sort, s.sort, s.name_ar)
      from services s where s.deleted_at is null and s.is_active), '[]'),
    'service_categories', coalesce((select jsonb_agg(to_jsonb(c) order by c.sort)
                            from service_categories c where c.deleted_at is null), '[]')
  )
  where public.is_staff()
$$;

-- ---------------------------------------------------------------------
-- create_sale: validates prices/discounts server side, numbers the
-- receipt, moves stock. Idempotent on p.id (safe to retry / sync offline).
-- p = {id, customer_id?, device_id?, note?, discount (order level, centimes),
--      payments:{cash, card}, items:[{type:'product'|'service', variant_id?, pack_id?,
--      service_id?, qty, unit_price, discount}]}
-- ---------------------------------------------------------------------
create or replace function public.get_sale(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(s) || jsonb_build_object(
    'employee_name', e.full_name,
    'customer', case when c.id is null then null
                else jsonb_build_object('id', c.id, 'full_name', c.full_name, 'phone', c.phone) end,
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
        'line_no', i.line_no, 'item_type', i.item_type, 'name_ar', i.name_ar, 'name_fr', i.name_fr,
        'qty', i.qty, 'unit_price', i.unit_price, 'original_unit_price', i.original_unit_price,
        'discount', i.discount, 'total', i.total, 'tax_rate', i.tax_rate,
        'variant_id', i.variant_id, 'pack_id', i.pack_id, 'service_id', i.service_id
      ) order by i.line_no), '[]') from sale_items i where i.sale_id = s.id))
  from sales s
  join employees e on e.id = s.employee_id
  left join customers c on c.id = s.customer_id
  where s.id = p_id
    and (s.employee_id = public.current_employee_id()
         or public.has_perm('reports.sales') or public.has_perm('pos.reprint'))
$$;

create or replace function public.create_sale(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid := public.current_employee_id();
  v_sid uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
  v_it jsonb;
  v_ln int := 0;
  v_var product_variants; v_pr products; v_pk product_packs; v_sv services;
  v_qty numeric; v_factor numeric; v_expected bigint; v_unit bigint; v_ldisc bigint; v_ltotal bigint;
  v_name_ar text; v_name_fr text; v_rate numeric; v_cost bigint;
  v_subtotal bigint := 0; v_line_net bigint := 0;
  v_order_disc bigint := greatest(coalesce((p->>'discount')::bigint, 0), 0);
  v_total bigint;
  v_cash bigint := greatest(coalesce((p->'payments'->>'cash')::bigint, 0), 0);
  v_card bigint := greatest(coalesce((p->'payments'->>'card')::bigint, 0), 0);
  v_change bigint := 0;
  v_num text;
  v_tax numeric;
  v_any_disc boolean := v_order_disc > 0;
begin
  if v_emp is null or not public.has_perm('pos.sell') then raise exception 'forbidden'; end if;
  if exists (select 1 from sales where id = v_sid) then return public.get_sale(v_sid); end if;
  if jsonb_array_length(coalesce(p->'items', '[]')) = 0 then raise exception 'empty_sale'; end if;

  v_num := public.next_doc_number('receipt');
  insert into sales (id, number, customer_id, employee_id, device_id, note)
  values (v_sid, v_num, nullif(p->>'customer_id', '')::uuid, v_emp, nullif(p->>'device_id', '')::uuid, p->>'note');

  for v_it in select * from jsonb_array_elements(p->'items') loop
    v_ln := v_ln + 1;
    v_qty := (v_it->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'invalid_qty'; end if;
    v_ldisc := greatest(coalesce((v_it->>'discount')::bigint, 0), 0);
    if v_ldisc > 0 then v_any_disc := true; end if;
    v_pk := null; v_var := null; v_pr := null; v_sv := null;

    if v_it->>'type' = 'product' then
      select * into v_var from product_variants where id = (v_it->>'variant_id')::uuid and deleted_at is null;
      if not found then raise exception 'variant_not_found'; end if;
      select * into v_pr from products where id = v_var.product_id;
      v_factor := 1; v_expected := v_var.price;
      v_name_ar := v_pr.name_ar || coalesce(' - ' || v_var.name_ar, '');
      v_name_fr := v_pr.name_fr || coalesce(' - ' || v_var.name_fr, '');
      if nullif(v_it->>'pack_id', '') is not null then
        select * into v_pk from product_packs
         where id = (v_it->>'pack_id')::uuid and variant_id = v_var.id and deleted_at is null;
        if not found then raise exception 'pack_not_found'; end if;
        v_factor := v_pk.factor; v_expected := v_pk.price;
        v_name_ar := v_name_ar || ' (' || v_pk.name_ar || ')';
        v_name_fr := v_name_fr || ' (' || v_pk.name_fr || ')';
      end if;
      v_rate := v_pr.tax_rate;
      v_cost := round(coalesce((select c.cost from product_costs c where c.variant_id = v_var.id), 0) * v_factor)::bigint;
    elsif v_it->>'type' = 'service' then
      select * into v_sv from services where id = (v_it->>'service_id')::uuid and deleted_at is null and is_active;
      if not found then raise exception 'service_not_found'; end if;
      v_factor := 1;
      v_expected := case when v_sv.pricing_mode = 'open' then null else public.service_unit_price(v_sv.id, v_qty) end;
      v_name_ar := v_sv.name_ar; v_name_fr := v_sv.name_fr; v_rate := v_sv.tax_rate; v_cost := 0;
    else
      raise exception 'invalid_item_type';
    end if;

    v_unit := coalesce((v_it->>'unit_price')::bigint, v_expected);
    if v_unit is null or v_unit < 0 then raise exception 'invalid_price'; end if;
    if v_sv.pricing_mode = 'open' and v_unit = 0 then raise exception 'invalid_price'; end if;
    if v_expected is not null and v_unit <> v_expected and not public.has_perm('pos.price_override') then
      raise exception 'price_override_forbidden';
    end if;

    v_ltotal := round(v_unit * v_qty)::bigint - v_ldisc;
    if v_ltotal < 0 then raise exception 'discount_exceeds_line'; end if;
    v_subtotal := v_subtotal + round(coalesce(v_expected, v_unit) * v_qty)::bigint;
    v_line_net := v_line_net + v_ltotal;

    insert into sale_items (sale_id, line_no, item_type, product_id, variant_id, pack_id, service_id,
                            name_ar, name_fr, qty, base_qty, unit_price, original_unit_price, discount,
                            total, tax_rate, unit_cost)
    values (v_sid, v_ln, v_it->>'type', v_pr.id, v_var.id, v_pk.id, v_sv.id,
            v_name_ar, v_name_fr, v_qty, v_qty * v_factor, v_unit, coalesce(v_expected, v_unit), v_ldisc,
            v_ltotal, v_rate, v_cost);

    if v_it->>'type' = 'product' and v_pr.track_stock then
      insert into stock_movements (variant_id, qty_change, reason, ref_id, employee_id)
      values (v_var.id, -(v_qty * v_factor), 'sale', v_sid, v_emp);
    end if;
  end loop;

  if v_order_disc > v_line_net then raise exception 'discount_exceeds_total'; end if;
  v_total := v_line_net - v_order_disc;

  if v_any_disc then
    if not public.has_perm('pos.discount') then raise exception 'discount_forbidden'; end if;
    if v_subtotal > 0 and (v_subtotal - v_total) * 100.0 / v_subtotal > public.my_max_discount() + 0.001 then
      raise exception 'discount_above_limit';
    end if;
  end if;

  if v_card > v_total then raise exception 'card_exceeds_total'; end if;
  if v_cash + v_card < v_total then raise exception 'insufficient_payment'; end if;
  v_change := v_cash + v_card - v_total;

  select coalesce(sum(i.total * i.tax_rate / (100 + i.tax_rate)), 0) into v_tax
    from sale_items i where i.sale_id = v_sid;
  if v_line_net > 0 then v_tax := v_tax * v_total / v_line_net; end if;

  update sales s set
    subtotal = v_subtotal, discount_total = v_subtotal - v_total, total = v_total,
    tax_total = round(v_tax), cash_received = v_cash, change_given = v_change,
    paid_cash = v_cash - v_change, paid_card = v_card
  where s.id = v_sid;

  perform public.log_activity('insert', 'sales', v_sid::text, v_num, jsonb_build_object('total', v_total));
  return public.get_sale(v_sid);
end $$;

create or replace function public.void_sale(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s sales;
begin
  if not public.has_perm('pos.void') then raise exception 'forbidden'; end if;
  select * into s from sales where id = p_id for update;
  if not found then raise exception 'sale_not_found'; end if;
  if s.status = 'voided' then raise exception 'already_voided'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  update sales set status = 'voided', voided_at = now(), voided_by = public.current_employee_id(),
                   void_reason = p_reason
   where id = p_id;
  insert into stock_movements (variant_id, qty_change, reason, ref_id, employee_id)
  select i.variant_id, i.base_qty, 'void', p_id, public.current_employee_id()
    from sale_items i join products pr on pr.id = i.product_id
   where i.sale_id = p_id and i.item_type = 'product' and pr.track_stock;
  perform public.log_activity('custom', 'sales', p_id::text, s.number,
    jsonb_build_object('voided', true, 'reason', p_reason, 'total', s.total));
  return public.get_sale(p_id);
end $$;

-- Recent sales for the POS history screen
create or replace function public.recent_sales(p_limit int default 50, p_search text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]') from (
    select jsonb_build_object('id', s.id, 'number', s.number, 'status', s.status, 'total', s.total,
             'paid_cash', s.paid_cash, 'paid_card', s.paid_card, 'created_at', s.created_at,
             'employee_name', e.full_name, 'customer_name', c.full_name) x
    from sales s join employees e on e.id = s.employee_id left join customers c on c.id = s.customer_id
    where (s.employee_id = public.current_employee_id() or public.has_perm('reports.sales') or public.has_perm('pos.reprint'))
      and (p_search is null or s.number ilike '%' || p_search || '%' or c.full_name ilike '%' || p_search || '%')
    order by s.created_at desc
    limit p_limit
  ) t
$$;

-- Dashboard summary (phase 1 version)
create or replace function public.dashboard_summary(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  res jsonb;
  can_profit boolean := public.has_perm('reports.profit');
begin
  if not public.has_perm('reports.sales') then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'sales_count', count(*),
    'revenue', coalesce(sum(total), 0),
    'cash', coalesce(sum(paid_cash), 0),
    'card', coalesce(sum(paid_card), 0),
    'discounts', coalesce(sum(discount_total), 0),
    'tax', coalesce(sum(tax_total), 0),
    'avg_ticket', coalesce(round(avg(total)), 0)
  ) into res
  from sales where status = 'completed' and created_at >= p_from and created_at < p_to;

  if can_profit then
    res := res || jsonb_build_object('gross_profit', (
      select coalesce(sum(i.total - i.unit_cost * i.qty), 0)
        from sale_items i join sales s on s.id = i.sale_id
       where s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to));
  end if;

  res := res || jsonb_build_object(
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'revenue', r, 'count', c) order by d), '[]')
               from (select date_trunc('day', created_at at time zone 'Africa/Casablanca')::date d,
                            sum(total) r, count(*) c
                       from sales where status = 'completed' and created_at >= p_from and created_at < p_to
                      group by 1) t),
    'top_items', (select coalesce(jsonb_agg(t order by t.revenue desc), '[]') from (
                    select i.name_ar, i.name_fr, sum(i.qty) qty, sum(i.total) revenue
                      from sale_items i join sales s on s.id = i.sale_id
                     where s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to
                     group by i.name_ar, i.name_fr order by sum(i.total) desc limit 8) t),
    'by_employee', (select coalesce(jsonb_agg(t order by t.revenue desc), '[]') from (
                    select e.full_name, e.color, count(*) count, sum(s.total) revenue
                      from sales s join employees e on e.id = s.employee_id
                     where s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to
                     group by e.full_name, e.color) t),
    'low_stock', (select coalesce(jsonb_agg(t), '[]') from (
                    select p.id, p.name_ar, p.name_fr, v.name_ar variant_ar, v.stock_qty, p.low_stock_alert
                      from product_variants v join products p on p.id = v.product_id
                     where p.deleted_at is null and v.deleted_at is null and p.track_stock
                       and v.stock_qty <= p.low_stock_alert
                     order by v.stock_qty limit 10) t)
  );
  return res;
end $$;

-- ---------------------------------------------------------------------
-- Trash: everything soft-deleted, across tables
-- ---------------------------------------------------------------------
create or replace function public.trash_list()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(t order by t.deleted_at desc), '[]') from (
    select 'products' entity, id, name_ar label, deleted_at from products where deleted_at is not null
    union all select 'categories', id, name_ar, deleted_at from categories where deleted_at is not null
    union all select 'services', id, name_ar, deleted_at from services where deleted_at is not null
    union all select 'service_categories', id, name_ar, deleted_at from service_categories where deleted_at is not null
    union all select 'customers', id, full_name, deleted_at from customers where deleted_at is not null
    union all select 'employees', id, full_name, deleted_at from employees where deleted_at is not null
    union all select 'roles', id, name_ar, deleted_at from roles where deleted_at is not null
  ) t
  where public.has_perm('trash.manage')
$$;

create or replace function public.trash_restore(p_entity text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('trash.manage') then raise exception 'forbidden'; end if;
  if p_entity not in ('products', 'categories', 'services', 'service_categories', 'customers', 'employees', 'roles') then
    raise exception 'invalid_entity';
  end if;
  execute format('update public.%I set deleted_at = null where id = $1', p_entity) using p_id;
end $$;

create or replace function public.trash_purge(p_entity text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'forbidden'; end if;
  if p_entity not in ('products', 'categories', 'services', 'service_categories', 'customers', 'roles') then
    raise exception 'invalid_entity';
  end if;
  -- Rows referenced by sales stay (history must remain intact).
  begin
    execute format('delete from public.%I where id = $1 and deleted_at is not null', p_entity) using p_id;
  exception when foreign_key_violation then
    raise exception 'in_use_cannot_purge';
  end;
end $$;

-- Soft delete helper used by the dashboard (one function, checked per entity)
create or replace function public.trash_move(p_entity text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  needed text := case p_entity
    when 'products' then 'products.delete' when 'categories' then 'products.manage'
    when 'services' then 'services.manage' when 'service_categories' then 'services.manage'
    when 'customers' then 'customers.manage' when 'employees' then 'employees.manage'
    when 'roles' then 'employees.manage' end;
begin
  if needed is null then raise exception 'invalid_entity'; end if;
  if not public.has_perm(needed) then raise exception 'forbidden'; end if;
  execute format('update public.%I set deleted_at = now() where id = $1 and deleted_at is null', p_entity) using p_id;
end $$;

-- ---------------------------------------------------------------------
-- Storage: public media bucket (product images, logo, website images)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'])
on conflict (id) do nothing;

create policy media_read on storage.objects for select using (bucket_id = 'media');
create policy media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_staff());
create policy media_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.is_staff());
create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (public.has_perm('products.manage') or public.has_perm('website.edit') or public.has_perm('settings.manage')));
