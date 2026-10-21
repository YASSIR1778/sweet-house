-- =====================================================================
-- Marketing team, phase 1
--  · campaign_links: a short code per post (?src=CODE) → clicks, requests, orders
--  · promo_codes: a code said in the shop (e.g. FB10) → sales per channel
--  · marketing_plan: the planner's themes for the coming weeks
--  · agents: planner, facebook, instagram, tiktok, whatsapp, offers, analyst
-- =====================================================================

create table public.campaign_links (
  code          text primary key,
  channel       text not null check (channel in ('facebook', 'instagram', 'tiktok', 'whatsapp', 'google', 'other')),
  path          text not null default '/',
  label         text,
  suggestion_id uuid references public.agent_suggestions(id) on delete set null,
  clicks        int not null default 0,
  created_at    timestamptz not null default now()
);
create table public.promo_codes (
  code          text primary key check (code = upper(code) and length(code) between 3 and 20),
  channel       text not null default 'other',
  label         text,
  discount_pct  numeric(5,2) not null default 0 check (discount_pct between 0 and 50),
  active        boolean not null default true,
  uses          int not null default 0,
  ends_on       date,
  suggestion_id uuid references public.agent_suggestions(id) on delete set null,
  created_at    timestamptz not null default now()
);
create table public.marketing_plan (
  month      date primary key,           -- first day of the month
  plan       jsonb not null default '[]', -- [{week_start, theme, why, services, products, channels, offer}]
  updated_at timestamptz not null default now()
);
alter table public.service_requests add column source_code text references public.campaign_links(code) on delete set null;
alter table public.online_orders    add column source_code text references public.campaign_links(code) on delete set null;
alter table public.sales            add column promo_code  text references public.promo_codes(code) on delete set null;

alter table public.campaign_links enable row level security;
alter table public.promo_codes    enable row level security;
alter table public.marketing_plan enable row level security;
create policy campaign_links_owner on public.campaign_links for all using (public.is_owner()) with check (public.is_owner());
create policy promo_codes_owner on public.promo_codes for all using (public.is_owner()) with check (public.is_owner());
create policy marketing_plan_owner on public.marketing_plan for all using (public.is_owner()) with check (public.is_owner());

-- Public: count a click on a campaign link
create or replace function public.track_click(p_code text)
returns void language sql security definer set search_path = public as $$
  update campaign_links set clicks = clicks + 1 where code = lower(left(trim(p_code), 30));
$$;
grant execute on function public.track_click(text) to anon, authenticated;

-- Public: right after a request/order is sent, attach the campaign it came from
create or replace function public.attribute_online(p_tracking text, p_src text)
returns void language plpgsql security definer set search_path = public as $$
declare v_src text := lower(left(trim(coalesce(p_src, '')), 30));
begin
  if not exists (select 1 from campaign_links where code = v_src) then return; end if;
  update service_requests set source_code = v_src
   where tracking_code = upper(trim(p_tracking)) and source_code is null and created_at > now() - interval '1 hour';
  update online_orders set source_code = v_src
   where tracking_code = upper(trim(p_tracking)) and source_code is null and created_at > now() - interval '1 hour';
end $$;
grant execute on function public.attribute_online(text, text) to anon, authenticated;

-- POS: check a promo code, then attach it to the sale just made
create or replace function public.promo_lookup(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('code', code, 'label', label, 'discount_pct', discount_pct, 'channel', channel)
  from promo_codes where code = upper(trim(p_code)) and active and (ends_on is null or ends_on >= current_date) and public.is_staff()
$$;
create or replace function public.sale_set_promo(p_sale uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v_code text := upper(trim(p_code));
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  if not exists (select 1 from promo_codes where code = v_code and active) then raise exception 'promo_invalid'; end if;
  update sales set promo_code = v_code where id = p_sale and promo_code is null and created_at > now() - interval '30 minutes';
  if found then update promo_codes set uses = uses + 1 where code = v_code; end if;
end $$;

-- What each channel brought (owner dashboard + analyst agent)
create or replace function public.marketing_stats_internal(p_days int default 30)
returns jsonb language sql stable security definer set search_path = public as $$
  with f as (select now() - make_interval(days => p_days) since),
  ch as (select unnest(array['facebook', 'instagram', 'tiktok', 'whatsapp', 'google', 'other']) channel),
  links as (
    select l.channel, sum(l.clicks) clicks from campaign_links l, f where l.created_at >= f.since - interval '60 days' group by 1),
  req as (
    select l.channel, count(*) n, coalesce(sum(r.price), 0) rev from service_requests r join campaign_links l on l.code = r.source_code, f where r.created_at >= f.since group by 1),
  ord as (
    select l.channel, count(*) n, coalesce(sum(o.total), 0) rev from online_orders o join campaign_links l on l.code = o.source_code, f where o.created_at >= f.since and o.status <> 'cancelled' group by 1),
  pos as (
    select p.channel, count(*) n, coalesce(sum(s.total), 0) rev from sales s join promo_codes p on p.code = s.promo_code, f where s.created_at >= f.since and s.status = 'completed' group by 1)
  select jsonb_build_object(
    'days', p_days,
    'note', 'المبالغ بالسنتيم',
    'channels', (select jsonb_agg(jsonb_build_object('channel', ch.channel, 'clicks', coalesce(links.clicks, 0),
        'requests', coalesce(req.n, 0), 'requests_revenue', coalesce(req.rev, 0), 'orders', coalesce(ord.n, 0), 'orders_revenue', coalesce(ord.rev, 0),
        'shop_sales', coalesce(pos.n, 0), 'shop_revenue', coalesce(pos.rev, 0),
        'revenue', coalesce(req.rev, 0) + coalesce(ord.rev, 0) + coalesce(pos.rev, 0)))
      from ch left join links using (channel) left join req using (channel) left join ord using (channel) left join pos using (channel)),
    'top_links', (select coalesce(jsonb_agg(x), '[]') from (
        select jsonb_build_object('code', l.code, 'channel', l.channel, 'label', l.label, 'clicks', l.clicks,
          'requests', (select count(*) from service_requests r where r.source_code = l.code),
          'orders', (select count(*) from online_orders o where o.source_code = l.code)) x
          from campaign_links l, f where l.created_at >= f.since order by l.clicks desc limit 15) t),
    'promo_codes', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'channel', channel, 'discount_pct', discount_pct, 'uses', uses, 'active', active)), '[]') from promo_codes),
    'total_revenue_period', (select coalesce(sum(total), 0) from sales, f where status = 'completed' and created_at >= f.since))
$$;
revoke execute on function public.marketing_stats_internal(int) from public, anon, authenticated;
grant execute on function public.marketing_stats_internal(int) to service_role;
create or replace function public.marketing_stats(p_days int default 30)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.marketing_stats_internal(p_days) where public.is_owner()
$$;

-- Data for the marketing agents (service role only)
create or replace function public.agent_marketing_data(p_channel text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'today', (now() at time zone 'Africa/Casablanca')::date,
    'weekday', to_char(now() at time zone 'Africa/Casablanca', 'Day'),
    'note', 'المبالغ بالسنتيم',
    'store', (select jsonb_build_object('name', value->>'name_ar', 'address', value->>'address_ar', 'phone', value->>'phone', 'whatsapp', value->>'whatsapp') from settings where key = 'store'),
    'plan', (select coalesce(jsonb_agg(p.plan order by p.month), '[]') from marketing_plan p
              where p.month >= date_trunc('month', now() at time zone 'Africa/Casablanca')::date - interval '1 month'),
    'online_services', (select coalesce(jsonb_agg(jsonb_build_object('name', name_ar, 'price', price, 'duration', duration_ar, 'id', id, 'abroad', abroad)), '[]') from (
        select * from services where kind = 'admin' and is_online and is_active and deleted_at is null order by sort) s),
    'shop_services', (select coalesce(jsonb_agg(jsonb_build_object('name', name_ar, 'price', price)), '[]') from (
        select * from services where kind = 'counter' and is_active and deleted_at is null order by sort limit 20) s),
    'top_products_30d', (select coalesce(jsonb_agg(jsonb_build_object('name', name_ar, 'qty', q)), '[]') from (
        select i.name_ar, sum(i.qty) q from sale_items i join sales s on s.id = i.sale_id
         where s.status = 'completed' and s.created_at > now() - interval '30 days' and i.item_type = 'product' group by 1 order by 2 desc limit 15) t),
    'products', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name_ar, 'price', (select min(v.price) from product_variants v where v.product_id = p.id and v.deleted_at is null),
                  'stock', (select sum(v.stock_qty) from product_variants v where v.product_id = p.id and v.deleted_at is null), 'online', p.is_online)), '[]')
        from (select * from products where deleted_at is null order by created_at desc limit 60) p),
    'stale_products', (select coalesce(jsonb_agg(jsonb_build_object('name', p.name_ar, 'stock', v.stock_qty, 'price', v.price, 'cost', pc.cost)), '[]') from product_variants v
        join products p on p.id = v.product_id left join product_costs pc on pc.variant_id = v.id
       where v.deleted_at is null and p.deleted_at is null and v.stock_qty > 0
         and not exists (select 1 from sale_items i join sales s on s.id = i.sale_id where i.variant_id = v.id and s.status = 'completed' and s.created_at > now() - interval '60 days')),
    'recent_posts_this_channel', (select coalesce(jsonb_agg(left(x, 200)), '[]') from (
        select p->>'text' x from agent_suggestions s, jsonb_array_elements(s.payload->'posts') p
         where (p_channel is null or p->>'channel' = p_channel) and s.created_at > now() - interval '45 days' order by s.created_at desc limit 12) t),
    'performance_30d', public.marketing_stats_internal(30),
    'broadcast', (select jsonb_build_object('subscribers', (select count(*) from broadcast_subscribers),
        'topics', (select coalesce(jsonb_agg(jsonb_build_object('name', t.name_ar, 'subscribers', (select count(*) from broadcast_subscribers b where t.id = any(b.topics)))), '[]') from broadcast_topics t where t.is_active)))
    )
$$;
revoke execute on function public.agent_marketing_data(text) from public, anon, authenticated;
grant execute on function public.agent_marketing_data(text) to service_role;

-- The content agent now writes product descriptions only (posts moved to channel agents)
update public.agents set description_ar = 'يكتب أوصاف المنتجات بالعربية والفرنسية (المنشورات صارت عند وكلاء القنوات).', thresholds = '{"descriptions":8}' where key = 'content';

insert into public.agents (key, name_ar, name_fr, description_ar, persona_name, avatar, color, tone_hz, personality, schedule, schedule_ar, notify_mode, monthly_runs, sort, thresholds) values
  ('planner', 'المخطِّط', 'Planificateur', 'يضع رزنامة الحملات للأسابيع القادمة حسب المواسم المغربية (الدخول المدرسي، الباك، الصيف، الضرائب، رمضان…) ويوزّع المواضيع على باقي الفريق.',
   'سي المخطِّط', '📅', '#0F766E', 587, 'استراتيجي هادئ، يفكر قبل الموسم بأسبوعين، يختار موضوعاً واحداً قوياً لكل أسبوع.',
   '{"hour":20,"minute":0,"days":[0]}', 'الأحد 20:00', 'push', 8, 10, '{}'),
  ('facebook', 'وكيل فيسبوك', 'Facebook', 'منشورات فيسبوك بالدارجة حول موضوع الأسبوع: خدمة بثمنها ومدتها، نصيحة، عرض، ونص جاهز لمجموعات تطوان.',
   'سي الفيسبوكي', '📘', '#1877F2', 622, 'قريب من الناس، يكتب كأنه جار في الحي، واضح ومباشر، يذكر الثمن والمدة.',
   '{"hour":9,"minute":30,"days":[1,3,5]}', 'إثنين، أربعاء، جمعة 9:30', 'brief', 20, 11, '{"posts":2}'),
  ('instagram', 'وكيل إنستغرام', 'Instagram', 'منشورات وستوريات وأفكار ريلز: صور المنتجات، كاروسيل الوثائق المطلوبة، هدايا وأدوات مدرسية.',
   'لالة إنستا', '📸', '#E1306C', 932, 'شابة وأنيقة، جمل قصيرة، إيموجي باعتدال، تفكر في الصورة قبل النص.',
   '{"hour":11,"minute":0,"days":[2,4,6]}', 'ثلاثاء، خميس، سبت 11:00', 'brief', 20, 12, '{"posts":2}'),
  ('tiktok', 'وكيل تيك توك', 'TikTok', 'سيناريوهات فيديوهات قصيرة (20-40 ثانية) تصوّرها الموظفة بالهاتف: نصائح إدارية، أخطاء شائعة، كواليس المحل.',
   'المخرج', '🎬', '#111827', 1047, 'مبدع وعفوي، يبدأ بجملة تشد الانتباه في أول 3 ثوانٍ، ويكتب المشاهد خطوة بخطوة.',
   '{"hour":12,"minute":0,"days":[3]}', 'الأربعاء 12:00', 'brief', 8, 13, '{"posts":2}'),
  ('whatsapp', 'وكيل واتساب', 'WhatsApp', 'رسائل قائمة البث لكل شريحة في وقتها (أولياء الأمور، الطلبة، مغاربة العالم…) وتذكير من بدأ طلباً ولم يكمله.',
   'ساعي البريد', '💬', '#25D366', 784, 'مهذب وشخصي، رسائل قصيرة لها سبب واضح، لا يزعج، ويعطي دائماً طريقة لإلغاء الاشتراك.',
   '{"hour":18,"minute":0,"days":[4]}', 'الخميس 18:00', 'push', 8, 14, '{"posts":2}'),
  ('offers', 'وكيل العروض', 'Offres', 'يقترح عروضاً رابحة: باقات (باك الدخول المدرسي)، تصريف المنتجات الراكدة، خدمتان معاً، وكود عرض لكل قناة. يحسب الهامش قبل الاقتراح.',
   'التاجر', '🎯', '#B45309', 698, 'تاجر سوق ذكي، يعرف أن العرض الجيد يبيع ولا يخسر، يحسب كل درهم.',
   '{"hour":9,"minute":0,"days":[1]}', 'الإثنين 9:00', 'push', 8, 15, '{"max_discount_pct":15}'),
  ('analyst', 'المحلل', 'Analyste', 'كل إثنين: أي قناة جلبت زبائن ومالاً، أي منشور نجح، وماذا نكرر أو نوقف الأسبوع القادم.',
   'المحلل', '📈', '#4338CA', 494, 'دقيق وصريح، يتكلم بالأرقام، يقول ما نجح وما فشل بدون مجاملة، ويقترح خطوة واحدة واضحة.',
   '{"hour":8,"minute":30,"days":[1]}', 'الإثنين 8:30', 'push', 8, 16, '{}')
on conflict (key) do nothing;
