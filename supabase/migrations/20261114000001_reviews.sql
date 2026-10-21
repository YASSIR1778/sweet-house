-- =====================================================================
-- Marketing phase 2: Google reviews agent ⭐
--  · each evening: customers served today who were happy → a WhatsApp
--    thank-you with the "review us on Google" link (never twice in 6 months)
--  · weekly Google post; ready replies when the owner pastes a review
-- =====================================================================

create table public.review_asks (
  phone      text primary key,          -- digits only
  name       text,
  source     text,
  asked_at   timestamptz not null default now()
);
alter table public.review_asks enable row level security;
create policy review_asks_owner on public.review_asks for select using (public.is_owner());

create or replace function public.review_mark_asked(p_phone text, p_name text default null, p_source text default 'agent')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  insert into review_asks (phone, name, source) values (public.phone_digits(p_phone), p_name, p_source)
  on conflict (phone) do update set asked_at = now(), name = coalesce(excluded.name, review_asks.name);
end $$;

create or replace function public.agent_reviews_data()
returns jsonb language sql stable security definer set search_path = public as $$
  with b as (select ((now() at time zone 'Africa/Casablanca')::date::timestamp at time zone 'Africa/Casablanca') f),
  served as (
    -- online/admin requests finished today
    select r.customer_name name, r.phone, 'خدمة: ' || r.service_name_ar what, r.number ref
      from service_requests r, b
     where r.status in ('ready', 'delivered') and r.updated_at >= b.f and length(public.phone_digits(r.phone)) >= 9
    union all
    -- known customers who bought today for 20 DH or more
    select c.full_name, c.phone, 'شراء من المحل', s.number
      from sales s join customers c on c.id = s.customer_id, b
     where s.status = 'completed' and s.created_at >= b.f and s.total >= 2000 and c.phone is not null and length(public.phone_digits(c.phone)) >= 9
  )
  select jsonb_build_object(
    'today', (now() at time zone 'Africa/Casablanca')::date,
    'weekday', extract(dow from now() at time zone 'Africa/Casablanca')::int,
    'review_url', (select nullif(value->>'google_review_url', '') from settings where key = 'store'),
    'store_name', (select value->>'name_ar' from settings where key = 'store'),
    'customers', (select coalesce(jsonb_agg(distinct jsonb_build_object('name', x.name, 'phone', x.phone, 'what', x.what, 'ref', x.ref)), '[]') from (
        select * from served s
         where not exists (select 1 from review_asks a where a.phone = public.phone_digits(s.phone) and a.asked_at > now() - interval '180 days')
           -- not if there was a refund or a complaint today
           and not exists (select 1 from help_requests h where public.phone_digits(h.phone) = public.phone_digits(s.phone) and h.created_at > now() - interval '7 days' and h.status = 'new')
         limit 15) x),
    'asked_total', (select count(*) from review_asks),
    'asked_30d', (select count(*) from review_asks where asked_at > now() - interval '30 days'),
    'plan', (select coalesce(jsonb_agg(p.plan), '[]') from marketing_plan p where p.month >= date_trunc('month', now() at time zone 'Africa/Casablanca')::date))
$$;
revoke execute on function public.agent_reviews_data() from public, anon, authenticated;
grant execute on function public.agent_reviews_data() to service_role;

insert into public.agents (key, name_ar, name_fr, description_ar, persona_name, avatar, color, tone_hz, personality, schedule, schedule_ar, notify_mode, monthly_runs, sort, thresholds) values
  ('reviews', 'وكيلة التقييمات', 'Avis Google', 'كل مساء: رسالة شكر على واتساب لزبائن اليوم الراضين مع رابط تقييم Google (مرة كل 6 أشهر لكل زبون). كل إثنين: منشور لصفحة Google. وتكتب الرد على أي تقييم تلصقه لها.',
   'نجمة', '⭐', '#F59E0B', 1175, 'ممتنة ودافئة، تشكر بصدق بدون إلحاح، رسائل قصيرة جداً، ولا تطلب أبداً تقييماً بخمس نجوم صراحة.',
   '{"hour":19,"minute":30,"days":[1,2,3,4,5,6]}', 'كل يوم 19:30 (عدا الأحد)', 'push', 40, 17, '{}')
on conflict (key) do nothing;
