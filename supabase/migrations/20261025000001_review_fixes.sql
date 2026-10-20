-- =====================================================================
-- Review fixes
--  1. Cashiers could read every employee's salary and notes → column grants.
--  2. Voiding a sale of an already closed shift broke that shift's figures.
--  3. Online revenue (shop orders, paid service requests) missing from profit.
--  4. Big discounts now notify the owner.
--  5. School supply lists ("اللوائح المدرسية") as an online request service.
-- =====================================================================

-- 1 ------------------------------------------------------------------
revoke select on public.employees from authenticated, anon;
grant select (id, auth_user_id, full_name, username, avatar_url, color, role_id, is_owner, can_use_pos, can_use_admin,
              is_active, deleted_at, created_at, updated_at) on public.employees to authenticated;

create or replace function public.employees_admin()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(e) order by e.is_owner desc, e.full_name), '[]')
  from employees e
  where e.deleted_at is null and public.has_perm('employees.manage')
$$;

-- 2 ------------------------------------------------------------------
create or replace function public.void_sale(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s sales;
begin
  if not public.has_perm('pos.void') then raise exception 'forbidden'; end if;
  select * into s from sales where id = p_id for update;
  if not found then raise exception 'sale_not_found'; end if;
  if s.status = 'voided' then raise exception 'already_voided'; end if;
  if exists (select 1 from refunds where sale_id = p_id) then raise exception 'sale_has_refunds'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if exists (select 1 from invoices where sale_id = p_id and kind = 'invoice' and status = 'issued') then raise exception 'sale_invoiced'; end if;
  -- After the shift is closed the cash was counted: use a refund instead.
  if s.shift_id is not null and exists (select 1 from shifts where id = s.shift_id and status = 'closed') then
    raise exception 'void_closed_shift';
  end if;
  update sales set status = 'voided', voided_at = now(), voided_by = public.current_employee_id(), void_reason = p_reason where id = p_id;
  insert into stock_movements (variant_id, qty_change, reason, ref_id, employee_id)
  select i.variant_id, i.base_qty, 'void', p_id, public.current_employee_id()
    from sale_items i join products pr on pr.id = i.product_id
   where i.sale_id = p_id and i.item_type = 'product' and pr.track_stock;
  if s.paid_credit > 0 then
    insert into customer_ledger (customer_id, type, amount, sale_id, note, employee_id)
    values (s.customer_id, 'adjustment', -s.paid_credit, p_id, 'إلغاء ' || s.number, public.current_employee_id());
  end if;
  perform public.notify('sale_voided', 'warning', 'إلغاء بيع: ' || s.number, 'Vente annulée : ' || s.number,
    round(s.total / 100.0, 2)::text || ' DH · ' || p_reason, '/sales');
  perform public.log_activity('custom', 'sales', p_id::text, s.number, jsonb_build_object('voided', true, 'reason', p_reason, 'total', s.total));
  return public.get_sale(p_id);
end $$;

-- 4 ------------------------------------------------------------------
update public.settings set value = value || '{"discount_alert_percent": 20}'::jsonb where key = 'pos' and not (value ? 'discount_alert_percent');

create or replace function public.notify_big_discount()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_pct numeric;
  v_limit numeric := coalesce((select (value->>'discount_alert_percent')::numeric from settings where key = 'pos'), 20);
begin
  if new.subtotal > 0 and new.discount_total > 0 and (old.discount_total is distinct from new.discount_total) then
    v_pct := new.discount_total * 100.0 / new.subtotal;
    if v_pct >= v_limit then
      perform public.notify('big_discount', 'warning', 'تخفيض كبير: ' || round(v_pct) || '%', 'Remise importante : ' || round(v_pct) || '%',
        new.number || ' · ' || (select full_name from employees where id = new.employee_id), '/sales');
    end if;
  end if;
  return new;
end $$;
create trigger sales_big_discount after update of discount_total on public.sales for each row execute function public.notify_big_discount();

-- 5 ------------------------------------------------------------------
with c as (
  insert into public.service_categories (kind, name_ar, name_fr, icon, color, sort)
  values ('admin', 'اللوائح المدرسية', 'Listes scolaires', 'backpack', '#16A34A', 0)
  returning id
)
insert into public.services (category_id, kind, system_key, name_ar, name_fr, description_ar, description_fr, pricing_mode, price,
                             is_online, duration_ar, duration_fr, required_documents, fields, sort, icon)
select id, 'admin', 'school_list', 'تحضير اللائحة المدرسية', 'Préparation de la liste scolaire',
       'صوّر اللائحة المدرسية وأرسلها، نحضّر لك كل الأدوات ونرسل لك الثمن، ثم تستلمها من المحل أو نوصلها لك.',
       'Envoyez la photo de la liste ; nous préparons tout et vous envoyons le prix. Retrait ou livraison.',
       'fixed', 0, true, '24 - 48 ساعة', '24 - 48 h',
       '[{"name_ar":"صورة اللائحة المدرسية","name_fr":"Photo de la liste","required":true}]'::jsonb,
       '[{"key":"student","label_ar":"اسم التلميذ","label_fr":"Nom de l''élève","type":"text","required":false},{"key":"level","label_ar":"المستوى الدراسي","label_fr":"Niveau","type":"text","required":true},{"key":"school","label_ar":"المؤسسة","label_fr":"Établissement","type":"text","required":false},{"key":"pickup","label_ar":"طريقة الاستلام","label_fr":"Réception","type":"select","required":true,"options":["من المحل / En boutique","التوصيل / Livraison"]},{"key":"budget","label_ar":"الجودة المفضلة","label_fr":"Gamme","type":"select","required":false,"options":["اقتصادية / Économique","متوسطة / Standard","ممتازة / Premium"]}]'::jsonb,
       0, 'backpack'
from c;

-- 3 ------------------------------------------------------------------
-- online figures are folded into report() through a wrapper so the
-- existing function body stays untouched.
create or replace function public.report_full(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb := public.report(p_from, p_to);
  o jsonb := public.online_summary(p_from, p_to);
  v_online bigint := coalesce((o->>'orders_paid')::bigint, 0) + coalesce((o->>'requests_paid')::bigint, 0);
  v_ocogs bigint := coalesce((o->>'orders_cogs')::bigint, 0);
begin
  v := v || jsonb_build_object('online_revenue', v_online, 'online_cogs', v_ocogs, 'online', o);
  if v ? 'net_profit' then
    v := v || jsonb_build_object('gross_profit', (v->>'gross_profit')::bigint + v_online - v_ocogs,
                                 'net_profit', (v->>'net_profit')::bigint + v_online - v_ocogs);
  end if;
  return v;
end $$;
