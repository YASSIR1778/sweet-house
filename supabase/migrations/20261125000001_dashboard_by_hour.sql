-- «اليوم» on the dashboard: the period's sales by hour (Morocco time), so the chart can show the day hour by hour.
do $$
declare
  v_def text := pg_get_functiondef('public.dashboard_summary(timestamptz,timestamptz)'::regprocedure);
  v_new text;
begin
  if position('by_hour' in v_def) > 0 then return; end if;
  v_new := replace(v_def, E'    ''top_items'', (select',
    E'    ''by_hour'', (select coalesce(jsonb_agg(jsonb_build_object(''hour'', h, ''revenue'', r, ''count'', c) order by h), ''[]'')\n'
    '                from (select extract(hour from created_at at time zone ''Africa/Casablanca'')::int h, sum(total) r, count(*) c\n'
    '                        from sales where status = ''completed'' and created_at >= p_from and created_at < p_to\n'
    '                       group by 1) t),\n'
    '    ''top_items'', (select');
  if position('by_hour' in v_new) = 0 then
    raise exception 'dashboard_summary(): pattern not found';
  end if;
  execute v_new;
end $$;
