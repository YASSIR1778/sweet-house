-- one thank-you per phone number
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
    'customers', (select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'phone', x.phone, 'what', x.what, 'ref', x.ref)), '[]') from (
        select distinct on (public.phone_digits(s.phone)) * from served s
         where not exists (select 1 from review_asks a where a.phone = public.phone_digits(s.phone) and a.asked_at > now() - interval '180 days')
           -- not if there was a refund or a complaint today
           and not exists (select 1 from help_requests h where public.phone_digits(h.phone) = public.phone_digits(s.phone) and h.created_at > now() - interval '7 days' and h.status = 'new')
         order by public.phone_digits(s.phone) limit 15) x),
    'asked_total', (select count(*) from review_asks),
    'asked_30d', (select count(*) from review_asks where asked_at > now() - interval '30 days'),
    'plan', (select coalesce(jsonb_agg(p.plan), '[]') from marketing_plan p where p.month >= date_trunc('month', now() at time zone 'Africa/Casablanca')::date))
$$;
