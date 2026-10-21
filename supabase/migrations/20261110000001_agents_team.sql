-- =====================================================================
-- Agents as a team: personas, owner preferences, reactions (👍 🤷 👎 ⏰),
-- conversation under each suggestion, morning brief, monthly report card,
-- and three new agents: followup (daily), requests (on each new online
-- request), content (weekly). Plus settings for the site helper and the
-- POS helper (assistants, not scheduled agents).
-- =====================================================================

alter table public.agents
  add column persona_name text,
  add column avatar       text,
  add column personality  text,
  add column color        text,
  add column tone_hz      int not null default 660;   -- in-app chime per agent

update public.agents set persona_name = 'عمّي الحارس', avatar = '🦉', color = '#6366F1', tone_hz = 523,
  personality = 'هادئ ودقيق وحكيم. لا يزعج إلا لشيء مهم، ويطمئن المالك حين يكون كل شيء عادياً.' where key = 'monitor';
update public.agents set persona_name = 'سي المقتصد', avatar = '🐿️', color = '#D97706', tone_hz = 784,
  personality = 'عملي ويحب التوفير، يعرف المواسم ويفكر في السيولة قبل الكمية.' where key = 'purchases';

insert into public.agents (key, name_ar, name_fr, description_ar, schedule_ar, monthly_runs, sort, persona_name, avatar, color, tone_hz, personality) values
  ('followup', 'وكيلة المتابعة', 'Suivi', 'تذكّر بالطلبات القريبة من التأخر، والوثائق الجاهزة التي لم تُستلم، والديون القديمة، وطلبات المساعدة المنسية، وتجهّز الرسائل.', 'كل صباح 9:00', 40, 3,
   'لالة زهور', '🌸', '#DB2777', 880, 'منظّمة ولطيفة وحازمة. تكتب رسائل مهذبة للزبائن ولا تنسى أحداً.'),
  ('requests', 'وكيل الطلبات', 'Demandes', 'يراجع كل طلب خدمة جديد من الموقع: هل المعلومات كاملة ومنطقية، ويقترح من يتكفل به ورسالة للزبون إن نقص شيء.', 'عند كل طلب جديد', 300, 4,
   'سي الكاتب', '📋', '#0891B2', 698, 'دقيق في الإجراءات الإدارية المغربية، مختصر، يكتشف الأخطاء الصغيرة.'),
  ('content', 'وكيل المحتوى', 'Contenu', 'يكتب أوصاف المنتجات بالعربية والفرنسية، ويقترح رسائل قائمة البث ومنشورات فيسبوك وإنستغرام حسب الموسم.', 'كل خميس 10:00', 8, 5,
   'الفنّان', '🎨', '#16A34A', 988, 'مبدع ومرح، يكتب بأسلوب قريب من الناس في تطوان، بدون مبالغة.'),
  ('brief', 'قهوة الصباح', 'Café du matin', 'كل صباح: ملخص واحد لما قاله الفريق وما ينتظرك اليوم.', 'كل صباح 8:00', 40, 0,
   'سويتي', '☕', '#E8590C', 660, 'ودودة ومتفائلة، تلخّص في 3 نقاط وتحتفل بالأيام الجيدة.')
on conflict (key) do nothing;

-- Owner preferences (how the team talks to him)
insert into public.settings (key, value, is_public) values ('agent_prefs', jsonb_build_object(
  'call_me', 'سي ياسر', 'language', 'darija', 'detail', 'short',
  'quiet_from', '22:00', 'quiet_to', '08:00', 'quiet_days', jsonb_build_array(0), 'sounds', true), false)
on conflict (key) do nothing;

-- Reactions, snooze and conversation on each suggestion
alter table public.agent_suggestions
  add column feedback      text check (feedback in ('up', 'meh', 'down')),
  add column snooze_until  timestamptz,
  add column thread        jsonb not null default '[]'::jsonb,   -- [{role:'owner'|'agent', text, at}]
  add column ref_id        uuid;                                 -- e.g. the service request
create index agent_suggestions_ref_idx on public.agent_suggestions (ref_id);

create or replace function public.agent_react(p_id uuid, p_feedback text, p_reason text default null, p_remember boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v agent_suggestions;
begin
  if not public.is_owner() then raise exception 'forbidden'; end if;
  if p_feedback not in ('up', 'meh', 'down', 'snooze', 'reset') then raise exception 'invalid_status'; end if;
  if p_feedback = 'snooze' then
    update agent_suggestions set snooze_until = date_trunc('day', now() at time zone 'Africa/Casablanca') at time zone 'Africa/Casablanca' + interval '1 day 8 hours'
     where id = p_id returning * into v;
  elsif p_feedback = 'reset' then
    update agent_suggestions set status = 'new', feedback = null, reason = null, decided_by = null, decided_at = null where id = p_id returning * into v;
  else
    update agent_suggestions set feedback = p_feedback, status = case when p_feedback = 'down' then 'rejected' else 'accepted' end,
           reason = nullif(trim(coalesce(p_reason, '')), ''), decided_by = public.current_employee_id(), decided_at = now(), snooze_until = null
     where id = p_id returning * into v;
    if p_remember and length(trim(coalesce(p_reason, ''))) > 1 then
      insert into agent_memory (agent_key, note, created_by)
      values (v.agent_key, left(trim(p_reason), 500) || ' (بخصوص: ' || left(v.title, 120) || ')', public.current_employee_id());
    end if;
  end if;
  if v.id is null then raise exception 'not_found'; end if;
end $$;

-- Past reactions, so each agent sees what the owner found useful (read by the Edge Function)
create or replace function public.agent_feedback_digest(p_agent text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('title', title, 'feedback', feedback, 'reason', reason) order by decided_at desc), '[]')
  from (select * from agent_suggestions where agent_key = p_agent and feedback is not null order by decided_at desc limit 30) s
$$;
revoke execute on function public.agent_feedback_digest(text) from public, anon, authenticated;
grant execute on function public.agent_feedback_digest(text) to service_role;

-- Pending count ignores snoozed items
create or replace function public.agent_pending_count()
returns int language sql stable security definer set search_path = public as $$
  select case when public.is_owner() then (select count(*)::int from agent_suggestions
    where status = 'new' and (snooze_until is null or snooze_until <= now()) and agent_key <> 'brief') else 0 end
$$;

-- Morning brief
create table public.agent_briefs (
  day        date primary key,
  text       text not null,
  points     jsonb not null default '[]'::jsonb,   -- [{avatar, text, link}]
  celebrate  boolean not null default false,
  seen_at    timestamptz,
  created_at timestamptz not null default now()
);
alter table public.agent_briefs enable row level security;
create policy agent_briefs_owner on public.agent_briefs for select using (public.is_owner());
create policy agent_briefs_seen on public.agent_briefs for update using (public.is_owner()) with check (public.is_owner());

-- Monthly report card per agent (this month vs last month)
create or replace function public.agents_report_card()
returns jsonb language sql stable security definer set search_path = public as $$
  with m as (select date_trunc('month', now()) cur, date_trunc('month', now()) - interval '1 month' prev)
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', a.key, 'persona_name', a.persona_name, 'avatar', a.avatar, 'color', a.color, 'model', a.model,
    'cur', (select jsonb_build_object('total', count(*), 'up', count(*) filter (where feedback = 'up'), 'meh', count(*) filter (where feedback = 'meh'),
              'down', count(*) filter (where feedback = 'down'), 'danger', count(*) filter (where severity = 'danger'))
            from agent_suggestions s, m where s.agent_key = a.key and s.created_at >= m.cur),
    'prev', (select jsonb_build_object('total', count(*), 'up', count(*) filter (where feedback = 'up'), 'down', count(*) filter (where feedback = 'down'))
            from agent_suggestions s, m where s.agent_key = a.key and s.created_at >= m.prev and s.created_at < m.cur),
    'learned', (select coalesce(jsonb_agg(note order by created_at desc), '[]') from agent_memory x, m where x.agent_key = a.key and x.created_at >= m.cur),
    'runs', (select jsonb_build_object('count', count(*), 'tokens_in', coalesce(sum(input_tokens), 0), 'tokens_out', coalesce(sum(output_tokens), 0))
            from agent_runs r, m where r.agent_key = a.key and r.started_at >= m.cur and r.ok)) order by a.sort), '[]')
  from agents a where public.is_owner()
$$;

-- Ping an employee from a follow-up suggestion (targeted notification)
create or replace function public.agent_ping_staff(p_employee uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'forbidden'; end if;
  insert into notifications (type, severity, title_ar, title_fr, body, link, target_employee)
  values ('agent_ping', 'warning', '🌸 تذكير من المدير', 'Rappel', left(p_text, 500), '/requests', p_employee);
end $$;

-- Apply product descriptions proposed by the content agent
create or replace function public.agent_apply_description(p_product uuid, p_ar text, p_fr text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'forbidden'; end if;
  update products set description_ar = coalesce(nullif(trim(p_ar), ''), description_ar), description_fr = coalesce(nullif(trim(p_fr), ''), description_fr) where id = p_product;
end $$;

-- ---------------------------------------------------------------------
-- Data for the new agents (service role only)
-- ---------------------------------------------------------------------
create or replace function public.agent_followup_data()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'now', now() at time zone 'Africa/Casablanca',
    'note', 'المبالغ بالسنتيم',
    'requests_due', (select coalesce(jsonb_agg(x), '[]') from (
        select r->>'id' id, r->>'number' number, r->>'customer_name' customer, r->>'service_name_ar' service, r->>'status' status,
               r->>'due_at' due_at, (r->>'late')::boolean late, r->'assignee'->>'id' assignee_id, r->'assignee'->>'full_name' assignee
          from jsonb_array_elements(public.requests_list(500)) r
         where r->>'status' in ('received', 'processing', 'waiting_docs')
           and ((r->>'late')::boolean or (r->>'due_at')::timestamptz < now() + interval '12 hours') limit 40) x),
    'ready_not_collected', (select coalesce(jsonb_agg(jsonb_build_object('number', r.number, 'customer', r.customer_name, 'phone', r.phone,
                 'service', r.service_name_ar, 'tracking_code', r.tracking_code, 'ready_days', round(extract(epoch from now() - r.updated_at) / 86400)
               )), '[]')
        from service_requests r where r.status = 'ready' and r.updated_at < now() - interval '2 days'
         and not exists (select 1 from request_files f where f.request_id = r.id and f.kind = 'deliverable' and f.downloaded_at is not null)),
    'old_debts', (select coalesce(jsonb_agg(jsonb_build_object('customer', b.full_name, 'phone', b.phone, 'balance', b.balance,
                 'days', round(extract(epoch from now() - b.last_charge_at) / 86400))), '[]')
        from (select * from customer_balances where balance > 0 and last_charge_at < now() - interval '30 days' order by balance desc limit 20) b),
    'help_waiting', (select coalesce(jsonb_agg(jsonb_build_object('name', h.name, 'phone', h.phone, 'service', h.service_name_ar, 'question', left(h.question, 200),
                 'hours', round(extract(epoch from now() - h.created_at) / 3600))), '[]')
        from help_requests h where h.status = 'new' and h.created_at < now() - interval '1 hour'),
    'employees', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', full_name)), '[]') from employees where deleted_at is null and is_active),
    'templates', (select value->'templates' from settings where key = 'whatsapp'))
$$;

create or replace function public.agent_request_data(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'request', (select jsonb_build_object('id', r.id, 'number', r.number, 'service', r.service_name_ar, 'customer', r.customer_name, 'phone_ok', length(public.phone_digits(r.phone)) >= 9,
                 'email', r.email, 'fields', r.fields, 'notes', r.notes, 'status', r.status, 'price', r.price, 'payment_method', r.payment_method,
                 'abroad', r.abroad, 'country', r.country, 'created_at', r.created_at, 'tracking_code', r.tracking_code)
                from service_requests r where r.id = p_id),
    'files', (select coalesce(jsonb_agg(jsonb_build_object('kind', f.kind, 'name', f.name)), '[]') from request_files f where f.request_id = p_id and f.deleted_at is null),
    'service', (select jsonb_build_object('fields', s.fields, 'required_documents', s.required_documents, 'duration_ar', s.duration_ar, 'target_hours', s.target_hours)
                from service_requests r join services s on s.id = r.service_id where r.id = p_id),
    'staff_load', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.full_name,
                 'open_tasks', (select count(*) from service_requests x where x.assigned_to = e.id and x.status in ('received', 'processing', 'waiting_docs')),
                 'on_shift', exists (select 1 from shifts sh where sh.employee_id = e.id and sh.status = 'open'))), '[]')
        from employees e where e.deleted_at is null and e.is_active and 'requests.manage' = any(public.employee_permissions(e.id))))
$$;

create or replace function public.agent_content_data()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'today', (now() at time zone 'Africa/Casablanca')::date,
    'store', (select value->>'name_ar' from settings where key = 'store'),
    'products_without_description', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name_ar', p.name_ar, 'name_fr', p.name_fr,
                 'category', c.name_ar, 'price', (select min(v.price) from product_variants v where v.product_id = p.id and v.deleted_at is null))), '[]')
        from (select * from products where deleted_at is null and coalesce(trim(description_ar), '') = '' order by created_at desc limit 12) p
        left join categories c on c.id = p.category_id),
    'top_products_30d', (select coalesce(jsonb_agg(jsonb_build_object('name', name_ar, 'qty', q)), '[]') from (
        select i.name_ar, sum(i.qty) q from sale_items i join sales s on s.id = i.sale_id
         where s.status = 'completed' and s.created_at > now() - interval '30 days' group by 1 order by 2 desc limit 10) t),
    'online_services', (select coalesce(jsonb_agg(jsonb_build_object('name', name_ar, 'price', price, 'duration', duration_ar)), '[]') from (
        select * from services where kind = 'admin' and is_online and is_active and deleted_at is null order by sort limit 25) s),
    'recent_broadcasts', (select coalesce(jsonb_agg(left(b.title || ': ' || b.message, 200)), '[]') from (select * from broadcasts order by created_at desc limit 5) b))
$$;

revoke execute on function public.agent_followup_data() from public, anon, authenticated;
revoke execute on function public.agent_request_data(uuid) from public, anon, authenticated;
revoke execute on function public.agent_content_data() from public, anon, authenticated;
grant execute on function public.agent_followup_data() to service_role;
grant execute on function public.agent_request_data(uuid) to service_role;
grant execute on function public.agent_content_data() to service_role;

-- Brief data: yesterday's agent suggestions + today's tasks
create or replace function public.agent_brief_data()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'today', (now() at time zone 'Africa/Casablanca')::date,
    'yesterday_report', public.daily_report_text(((now() at time zone 'Africa/Casablanca')::date - 1)),
    'record_check', (select jsonb_build_object(
        'yesterday', (select coalesce(sum(total), 0) from sales where status = 'completed'
                       and created_at >= (((now() at time zone 'Africa/Casablanca')::date - 1)::timestamp at time zone 'Africa/Casablanca')
                       and created_at < (((now() at time zone 'Africa/Casablanca')::date)::timestamp at time zone 'Africa/Casablanca')),
        'best_previous_day', (select coalesce(max(t), 0) from (select date_trunc('day', created_at at time zone 'Africa/Casablanca') d, sum(total) t
                       from sales where status = 'completed' and created_at < (((now() at time zone 'Africa/Casablanca')::date - 1)::timestamp at time zone 'Africa/Casablanca')
                       group by 1) x))),
    'team', (select coalesce(jsonb_agg(jsonb_build_object('agent', a.persona_name, 'avatar', a.avatar, 'severity', s.severity, 'title', s.title, 'link', s.link)), '[]')
        from agent_suggestions s join agents a on a.key = s.agent_key
       where s.status = 'new' and s.agent_key <> 'brief' and s.created_at > now() - interval '36 hours'),
    'tasks', public.today_tasks_for_owner())
$$;

-- today_tasks() depends on auth; give the brief an owner-agnostic version
create or replace function public.today_tasks_for_owner()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'requests_new', (select count(*) from service_requests where status = 'received'),
    'requests_late', (select count(*) from jsonb_array_elements(public.requests_list(500)) r where (r->>'late')::boolean),
    'help_new', (select count(*) from help_requests where status = 'new'),
    'orders_new', (select count(*) from online_orders where status = 'new'),
    'low_stock', (select count(*) from product_variants v join products p on p.id = v.product_id where v.deleted_at is null and p.deleted_at is null and p.track_stock and v.stock_qty <= p.low_stock_alert),
    'riyad_balance', public.riyad_balance())
$$;
revoke execute on function public.agent_brief_data() from public, anon, authenticated;
revoke execute on function public.today_tasks_for_owner() from public, anon, authenticated;
grant execute on function public.agent_brief_data() to service_role;
grant execute on function public.today_tasks_for_owner() to service_role;

-- New online request → requests agent (only requests made by customers on the site)
create or replace function public.agent_on_new_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.created_by_staff, false) then return new; end if;
  if not exists (select 1 from agents where key = 'requests' and enabled) then return new; end if;
  perform net.http_post(
    url := 'https://gvvcrjxmansmmrnxdrnw.supabase.co/functions/v1/agents',
    body := jsonb_build_object('agent', 'requests', 'ref_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-agent-key', (select secret from agent_secret where id = 1)),
    timeout_milliseconds := 60000);
  return new;
exception when others then
  return new;
end $$;
create trigger agent_on_new_request after insert on public.service_requests
  for each row execute function public.agent_on_new_request();

-- Schedules (UTC; Morocco = UTC+1)
select cron.unschedule(jobid) from cron.job where jobname in ('sweet-house-agent-followup', 'sweet-house-agent-content', 'sweet-house-agent-brief');
select cron.schedule('sweet-house-agent-brief', '0 7 * * *', $c$select public.agent_trigger('brief')$c$);
select cron.schedule('sweet-house-agent-followup', '0 8 * * *', $c$select public.agent_trigger('followup')$c$);
select cron.schedule('sweet-house-agent-content', '0 9 * * 4', $c$select public.agent_trigger('content')$c$);

-- ---------------------------------------------------------------------
-- Assistants: site helper (public, cheap model, daily cap) and POS helper
-- ---------------------------------------------------------------------
insert into public.settings (key, value, is_public) values ('helpers', jsonb_build_object(
  'site_enabled', true, 'site_daily_limit', 150, 'site_name', 'مرشد سويت هاوس', 'site_avatar', '🧭',
  'pos_enabled', true, 'pos_name', 'سويتي', 'model_fast', 'claude-haiku-5-5'), false)
on conflict (key) do nothing;

create table public.helper_usage (
  id         bigint generated always as identity primary key,
  channel    text not null check (channel in ('site', 'pos')),
  ip_hash    text,
  service_id uuid,
  question   text,
  escalated  boolean not null default false,
  input_tokens int, output_tokens int,
  created_at timestamptz not null default now()
);
create index helper_usage_idx on public.helper_usage (channel, created_at desc);
alter table public.helper_usage enable row level security;
create policy helper_usage_owner on public.helper_usage for select using (public.is_owner());
