-- =====================================================================
-- Staff add products from the till. A product added by an employee is sold
-- in the shop at once but stays off the online store until the owner reviews
-- it; any edit by the owner counts as the review. The owner gets one
-- notification (kept up to date) instead of one per product.
-- Employees with products.manage may also fix the name / price / category /
-- cost of a simple product from the till (pos_update_product, logged).
-- =====================================================================

alter table public.products add column if not exists created_by uuid references public.employees(id) on delete set null;
alter table public.products add column if not exists needs_review boolean not null default false;

create or replace function public.products_review_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid := public.current_employee_id();
  -- an employee who is not the owner (null employee = SQL editor / server jobs: left alone)
  v_staff boolean := v_emp is not null and not coalesce((select is_owner from employees where id = v_emp), false);
begin
  if tg_op = 'INSERT' then
    -- save_product upserts: only a really new row is stamped
    if not exists (select 1 from products where id = new.id) then
      new.created_by := coalesce(new.created_by, v_emp);
      if v_staff then
        new.needs_review := true;
        new.is_online := false;
      end if;
    end if;
  elsif v_staff then
    new.created_by := old.created_by;
    if old.needs_review then
      new.needs_review := true;
      new.is_online := false;
    end if;
  elsif v_emp is not null then
    new.needs_review := false;
  end if;
  return new;
end $$;
drop trigger if exists products_review on public.products;
create trigger products_review before insert or update on public.products
  for each row execute function public.products_review_guard();

create or replace function public.products_review_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_body text;
begin
  if new.needs_review then
    v_body := 'بانتظار المراجعة: ' || (select count(*) from products where needs_review and deleted_at is null)
           || ' · آخرها «' || new.name_ar || '» من ' || coalesce((select full_name from employees where id = new.created_by), '?');
    update notifications set body = v_body where type = 'products_review' and read_at is null;
    if not found then
      perform public.notify('products_review', 'info', 'منتجات جديدة أضافها الموظفون', 'Nouveaux produits ajoutés par l''équipe', v_body, '/products');
    end if;
  end if;
  return null;
end $$;
drop trigger if exists products_review_notify on public.products;
create trigger products_review_notify after insert on public.products
  for each row execute function public.products_review_notify();

-- Fix a simple product from the till: name, sale price, category and (with products.view_cost) purchase price.
create or replace function public.pos_update_product(p_variant uuid, p_name text, p_price bigint, p_category uuid, p_cost bigint default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_pid uuid;
  v_old_name text;
  v_old_price bigint;
begin
  if not public.has_perm('products.manage') then raise exception 'forbidden'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name_required'; end if;
  if p_price is null or p_price <= 0 or coalesce(p_cost, 0) < 0 then raise exception 'invalid_amount'; end if;
  select v.product_id, v.price, p.name_ar into v_pid, v_old_price, v_old_name
    from product_variants v join products p on p.id = v.product_id
   where v.id = p_variant and v.deleted_at is null and p.deleted_at is null;
  if v_pid is null then raise exception 'variant_not_found'; end if;

  update products set name_ar = trim(p_name),
         name_fr = case when name_fr = name_ar then trim(p_name) else name_fr end,
         category_id = p_category
   where id = v_pid;
  update product_variants set price = p_price where id = p_variant;
  if p_cost is not null and public.has_perm('products.view_cost') then
    insert into product_costs (variant_id, cost, updated_at) values (p_variant, p_cost, now())
    on conflict (variant_id) do update set cost = excluded.cost, updated_at = now();
  end if;

  perform public.log_activity('custom', 'products', v_pid::text, trim(p_name),
    jsonb_build_object('from_pos', true, 'old_name', v_old_name, 'old_price', v_old_price, 'price', p_price));
  return v_pid;
end $$;
revoke execute on function public.pos_update_product(uuid, text, bigint, uuid, bigint) from public, anon;
