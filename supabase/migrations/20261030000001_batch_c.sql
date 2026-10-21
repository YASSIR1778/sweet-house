-- =====================================================================
-- Batch C: AI helpers (17 read a national ID card, 18 writing assistant,
-- 23 read the Riyad statement). The Edge Function "ai" calls Claude with
-- the owner's own API key (secret ANTHROPIC_API_KEY). Images are sent for
-- reading only and are never stored by the function.
-- =====================================================================

insert into public.settings (key, value, is_public) values ('ai', jsonb_build_object(
  'enabled', true,
  'model_fast', 'claude-haiku-5-5',     -- reading images (ID card, statement)
  'model_smart', 'claude-sonnet-5-5',   -- writing letters / requests
  'monthly_limit', 500                  -- max AI uses per month (cost guard)
), false)
on conflict (key) do nothing;

create table public.ai_usage (
  id            bigint generated always as identity primary key,
  employee_id   uuid references public.employees(id),
  action        text not null,
  model         text,
  input_tokens  int,
  output_tokens int,
  ok            boolean not null default true,
  created_at    timestamptz not null default now()
);
create index ai_usage_created_idx on public.ai_usage (created_at desc);
alter table public.ai_usage enable row level security;
create policy ai_usage_read on public.ai_usage for select using (public.is_owner() or public.has_perm('settings.manage'));

-- Monthly summary for the settings page
create or replace function public.ai_usage_summary()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'month_count', (select count(*) from ai_usage where created_at >= date_trunc('month', now())),
    'by_action', (select coalesce(jsonb_object_agg(action, n), '{}') from (
        select action, count(*) n from ai_usage where created_at >= date_trunc('month', now()) group by 1) t),
    'tokens_in', (select coalesce(sum(input_tokens), 0) from ai_usage where created_at >= date_trunc('month', now())),
    'tokens_out', (select coalesce(sum(output_tokens), 0) from ai_usage where created_at >= date_trunc('month', now())))
  where public.is_owner() or public.has_perm('settings.manage')
$$;
