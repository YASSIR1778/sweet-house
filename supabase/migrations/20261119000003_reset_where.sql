-- «ابدأ العمل الحقيقي» failed from the dashboard with «DELETE requires a WHERE
-- clause»: Supabase's safeupdate guard rejects whole-table DELETE/UPDATE coming
-- through the API (the SQL editor does not have it). Make every statement explicit.
do $$
declare
  v_def text := pg_get_functiondef('public.reset_test_data(jsonb)'::regprocedure);
  v_new text;
begin
  v_new := regexp_replace(v_def, 'delete from ([a-z_]+);', 'delete from \1 where true;', 'g');
  v_new := replace(v_new, 'update devices set current_employee = null;', 'update devices set current_employee = null where true;');
  v_new := replace(v_new, 'from stock_movements m where m.variant_id = v.id), 0);', 'from stock_movements m where m.variant_id = v.id), 0) where true;');
  if v_new = v_def then raise exception 'reset_test_data(): nothing replaced'; end if;
  execute v_new;
end $$;
