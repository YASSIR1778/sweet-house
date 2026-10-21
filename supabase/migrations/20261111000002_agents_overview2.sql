-- agents_overview: include schedule, thresholds, notify mode and custom fields
create or replace function public.agents_overview()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', a.key, 'name_ar', a.name_ar, 'name_fr', a.name_fr, 'description_ar', a.description_ar, 'enabled', a.enabled,
    'model', a.model, 'monthly_runs', a.monthly_runs, 'schedule_ar', a.schedule_ar,
    'persona_name', a.persona_name, 'avatar', a.avatar, 'personality', a.personality, 'color', a.color, 'tone_hz', a.tone_hz,
    'schedule', a.schedule, 'thresholds', a.thresholds, 'notify_mode', a.notify_mode, 'is_custom', a.is_custom, 'custom_job', a.custom_job, 'sources', a.sources,
    'last_run', (select jsonb_build_object('at', r.started_at, 'ok', r.ok, 'error', r.error, 'summary', r.summary, 'trigger', r.trigger)
                   from agent_runs r where r.agent_key = a.key and coalesce(r.summary, '') <> 'محادثة' order by r.started_at desc limit 1),
    'month', (select jsonb_build_object('runs', count(*) filter (where coalesce(r.summary, '') <> 'محادثة'), 'tokens_in', coalesce(sum(input_tokens), 0), 'tokens_out', coalesce(sum(output_tokens), 0))
                from agent_runs r where r.agent_key = a.key and r.started_at >= date_trunc('month', now())),
    'suggestions', (select jsonb_build_object('total', count(*), 'accepted', count(*) filter (where status = 'accepted'),
                      'rejected', count(*) filter (where status = 'rejected'), 'new', count(*) filter (where status = 'new'))
                from agent_suggestions s where s.agent_key = a.key),
    'memory', (select count(*) from agent_memory m where m.agent_key = a.key)) order by a.sort), '[]')
  from agents a where public.is_owner()
$$;
