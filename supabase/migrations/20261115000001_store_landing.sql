-- =====================================================================
-- Store: every product can be an ad landing page
--  · products.landing: headline, benefits, video, sections, FAQ, reviews,
--    quantity offers (1 / 2 / 3 …), free delivery, guarantee
--  · submit_order: honours a quantity offer and free delivery of the page
--  · settings "tracking": Meta / TikTok pixel IDs (public identifiers)
-- =====================================================================

alter table public.products add column landing jsonb not null default '{}'::jsonb;

insert into public.settings (key, value, is_public) values
  ('tracking', jsonb_build_object('meta_pixel_id', '', 'tiktok_pixel_id', ''), true)
on conflict (key) do nothing;

-- Same rules as before + item.offer_qty (price from the product's landing offers)
-- + landing free delivery when every item's page offers it.
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
  v_line bigint;
  v_unit bigint;
  v_offer jsonb;
  v_sub bigint := 0;
  v_fee bigint := 0;
  v_free boolean := true;
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

    -- quantity offer from the landing page ("2 بـ 199 درهم")
    v_line := round(v_qty * v_var.price)::bigint;
    if (v_it->>'offer_qty') is not null then
      select o into v_offer from jsonb_array_elements(coalesce(v_pr.landing->'offers', '[]')) o
       where (o->>'qty')::numeric = v_qty and (o->>'price')::bigint > 0 limit 1;
      if v_offer is not null and (v_offer->>'price')::bigint < v_line then v_line := (v_offer->>'price')::bigint; end if;
    end if;
    v_unit := round(v_line / v_qty)::bigint;
    if not coalesce((v_pr.landing->>'free_delivery')::boolean, false) then v_free := false; end if;

    insert into online_order_items (order_id, product_id, variant_id, name_ar, name_fr, image, qty, unit_price, unit_cost, total)
    values (v_id, v_pr.id, v_var.id, v_pr.name_ar || coalesce(' - ' || v_var.name_ar, ''), v_pr.name_fr || coalesce(' - ' || v_var.name_fr, ''),
            coalesce(v_var.image_url, v_pr.images[1]), v_qty, v_unit,
            coalesce((select cost from product_costs where variant_id = v_var.id), 0), v_line);
    v_sub := v_sub + v_line;
  end loop;

  if v_method = 'delivery' and not v_free then
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
