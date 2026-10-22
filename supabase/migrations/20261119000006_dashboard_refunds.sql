-- Dashboard revenue and gross profit now match the reports: refunds of the period are deducted.
do $$
declare
  v_def text := pg_get_functiondef('public.dashboard_summary(timestamptz,timestamptz)'::regprocedure);
  v_new text;
begin
  v_new := replace(v_def, E'  if can_profit then\n',
    E'  res := res || jsonb_build_object(''refunds'', (select coalesce(sum(total), 0) from refunds where created_at >= p_from and created_at < p_to), ''gross_revenue'', res->''revenue'');\n'
    '  res := res || jsonb_build_object(''revenue'', (res->>''gross_revenue'')::numeric - (res->>''refunds'')::numeric);\n\n'
    '  if can_profit then\n');
  v_new := replace(v_new, E's.created_at < p_to));\n  end if;\n',
    E's.created_at < p_to));\n    res := res || jsonb_build_object(''gross_profit'', (res->>''gross_profit'')::numeric - (res->>''refunds'')::numeric);\n  end if;\n');
  if position('gross_revenue' in v_new) = 0 or position('''gross_profit'', (res' in v_new) = 0 then
    raise exception 'dashboard_summary(): pattern not found';
  end if;
  execute v_new;
end $$;
