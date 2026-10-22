-- Security advisor "function_search_path_mutable": pin search_path on the
-- remaining helper functions (all others already set it).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.proname in ('set_updated_at', 'ean13_check_digit', 'push_perm_for', 'phone_digits', 'random_code',
                        'sale_section', 'normalize_phone', 'owner_only_setting', 'ai_price')
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path = public', f.sig);
  end loop;
end $$;
