-- Ignore heartbeat-style columns in the audit diff (devices.last_seen_at was
-- creating one log row per POS request).
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  n jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  o jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  r jsonb := coalesce(n, o);
  act text := lower(tg_op);
  diff jsonb;
  lbl text := coalesce(r->>'name_ar', r->>'full_name', r->>'number', r->>'name', r->>'key');
begin
  if tg_op = 'UPDATE' then
    if (o->>'deleted_at') is null and (n->>'deleted_at') is not null then act := 'trash';
    elsif (o->>'deleted_at') is not null and (n->>'deleted_at') is null then act := 'restore';
    end if;
    select jsonb_object_agg(k, jsonb_build_object('from', o->k, 'to', n->k)) into diff
      from jsonb_object_keys(n) k
     where k not in ('updated_at', 'last_seen_at') and (o->k) is distinct from (n->k);
    if diff is null then return new; end if;
  end if;
  perform public.log_activity(act, tg_table_name, r->>coalesce(nullif(tg_argv[0], ''), 'id'), lbl, diff);
  return coalesce(new, old);
end $$;

delete from public.activity_log
 where entity = 'devices' and action = 'update'
   and changes ?& array['last_seen_at'] and (select count(*) from jsonb_object_keys(changes)) = 1;
