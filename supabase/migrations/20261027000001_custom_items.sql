-- Cashier can sell an item that is not in the catalog (typed name + price).
insert into public.permissions (key, group_key, name_ar, name_fr, sort)
values ('pos.custom_item', 'pos', 'بيع منتج أو خدمة غير موجودة (يدوياً)', 'Vendre un article libre (saisi à la main)', 18)
on conflict (key) do nothing;

update public.roles set permissions = array_append(permissions, 'pos.custom_item')
 where not is_owner and 'pos.sell' = any(permissions) and not ('pos.custom_item' = any(permissions));

alter table public.sale_items drop constraint sale_items_item_type_check;
alter table public.sale_items add constraint sale_items_item_type_check check (item_type in ('product', 'service', 'custom'));

-- Owner sees what was sold by hand, to add it to the catalog later.
create or replace function public.custom_items_report(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(t order by t.count desc), '[]') from (
    select i.name_ar as name, count(*) count, sum(i.qty) qty, sum(i.total) revenue, round(avg(i.unit_price)) avg_price, max(s.created_at) last_at
      from sale_items i join sales s on s.id = i.sale_id
     where i.item_type = 'custom' and s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to
     group by i.name_ar) t
  where public.has_perm('reports.sales')
$$;

create or replace function public.create_sale(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid := public.current_employee_id();
  v_sid uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
  v_device uuid := nullif(p->>'device_id', '')::uuid;
  v_shift uuid;
  v_customer uuid := nullif(p->>'customer_id', '')::uuid;
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
  v_credit bigint := greatest(coalesce((p->'payments'->>'credit')::bigint, 0), 0);
  v_change bigint := 0;
  v_num text;
  v_tax numeric;
  v_any_disc boolean := v_order_disc > 0;
  v_low record;
begin
  if v_emp is null or not public.has_perm('pos.sell') then raise exception 'forbidden'; end if;
  if exists (select 1 from sales where id = v_sid) then return public.get_sale(v_sid); end if;
  if jsonb_array_length(coalesce(p->'items', '[]')) = 0 then raise exception 'empty_sale'; end if;
  if v_device is not null then
    select id into v_shift from shifts where device_id = v_device and status = 'open';
  end if;

  v_num := public.next_doc_number('receipt');
  insert into sales (id, number, customer_id, employee_id, device_id, shift_id, note)
  values (v_sid, v_num, v_customer, v_emp, v_device, v_shift, p->>'note');

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
      if v_sv.system_key = 'riyad_fee' and not public.has_perm('riyad.fee') then raise exception 'forbidden'; end if;
      v_factor := 1;
      v_expected := case when v_sv.pricing_mode = 'open' then null else public.service_unit_price(v_sv.id, v_qty) end;
      v_name_ar := v_sv.name_ar; v_name_fr := v_sv.name_fr; v_rate := v_sv.tax_rate; v_cost := 0;
    elsif v_it->>'type' = 'custom' then
      -- Free item typed by the cashier (not in the catalog)
      if not public.has_perm('pos.custom_item') then raise exception 'forbidden'; end if;
      v_name_ar := left(trim(coalesce(v_it->>'name', '')), 120);
      if length(v_name_ar) < 2 then raise exception 'name_required'; end if;
      v_name_fr := v_name_ar;
      v_factor := 1;
      v_expected := null;
      v_rate := coalesce(nullif(v_it->>'tax_rate', '')::numeric, (select (value->>'default_tax_rate')::numeric from settings where key = 'legal'), 20);
      v_cost := 0;
    else
      raise exception 'invalid_item_type';
    end if;

    v_unit := coalesce((v_it->>'unit_price')::bigint, v_expected);
    if v_unit is null or v_unit < 0 then raise exception 'invalid_price'; end if;
    if v_sv.pricing_mode = 'open' and v_unit = 0 then raise exception 'invalid_price'; end if;
    if v_it->>'type' = 'custom' and v_unit <= 0 then raise exception 'invalid_price'; end if;
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

  if v_credit > 0 then
    if not public.has_perm('pos.credit_sale') then raise exception 'credit_forbidden'; end if;
    if v_customer is null then raise exception 'customer_required'; end if;
  end if;
  if v_card + v_credit > v_total then raise exception 'card_exceeds_total'; end if;
  if v_cash + v_card + v_credit < v_total then raise exception 'insufficient_payment'; end if;
  v_change := v_cash + v_card + v_credit - v_total;

  select coalesce(sum(i.total * i.tax_rate / (100 + i.tax_rate)), 0) into v_tax from sale_items i where i.sale_id = v_sid;
  if v_line_net > 0 then v_tax := v_tax * v_total / v_line_net; end if;

  update sales s set
    subtotal = v_subtotal, discount_total = v_subtotal - v_total, total = v_total,
    tax_total = round(v_tax), cash_received = v_cash, change_given = v_change,
    paid_cash = v_cash - v_change, paid_card = v_card, paid_credit = v_credit
  where s.id = v_sid;

  if v_credit > 0 then
    insert into customer_ledger (customer_id, type, amount, sale_id, shift_id, employee_id)
    values (v_customer, 'sale_credit', v_credit, v_sid, v_shift, v_emp);
  end if;

  -- low stock notifications (once when crossing the threshold)
  for v_low in
    select p.name_ar, p.name_fr, v.stock_qty, p.low_stock_alert, i.base_qty
      from sale_items i join product_variants v on v.id = i.variant_id join products p on p.id = v.product_id
     where i.sale_id = v_sid and p.track_stock and v.stock_qty <= p.low_stock_alert and v.stock_qty + i.base_qty > p.low_stock_alert
  loop
    perform public.notify('low_stock', 'warning', 'مخزون منخفض: ' || v_low.name_ar, 'Stock faible : ' || v_low.name_fr,
      v_low.stock_qty::text, '/products');
  end loop;

  perform public.log_activity('insert', 'sales', v_sid::text, v_num, jsonb_build_object('total', v_total));
  return public.get_sale(v_sid);
end $$;

