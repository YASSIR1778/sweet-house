-- A finished document can be downloaded from the site only once the request
-- is paid. Before, a request with price 0 (every service still priced
-- «حسب الطلب») was downloadable without paying.
do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.track(text,text)'::regprocedure);
  v_new := replace(replace(v_def,
    '(v_r.payment_status = ''paid'' or v_r.price = 0)', 'v_r.payment_status = ''paid'''),
    'v_r.payment_status <> ''paid'' and v_r.price > 0', 'v_r.payment_status <> ''paid''');
  if v_new = v_def then raise exception 'track(): pattern not found'; end if;
  execute v_new;

  v_def := pg_get_functiondef('public.resolve_tracking(text,text)'::regprocedure);
  v_new := replace(v_def, '(r.payment_status = ''paid'' or r.price = 0)', 'r.payment_status = ''paid''');
  if v_new = v_def then raise exception 'resolve_tracking(): pattern not found'; end if;
  execute v_new;
end $$;
