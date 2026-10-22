-- Customers type the number they were shown (CMD-00001 / SH-00001) in the
-- tracking page: accept it as well as the tracking code (phone still required).
do $$
declare
  v_def text := pg_get_functiondef('public.track(text,text)'::regprocedure);
  v_new text;
begin
  v_new := replace(v_def, 'where tracking_code = upper(trim(p_code))', 'where (tracking_code = upper(trim(p_code)) or number = upper(trim(p_code)))');
  if v_new = v_def then raise exception 'track(): pattern not found'; end if;
  execute v_new;
end $$;
