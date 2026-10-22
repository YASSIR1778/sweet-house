-- «+0600000003» (abroad form adds +, customer typed a Moroccan 06…) was kept
-- as an international number: a leading 0 after + / 00 means a Moroccan local number.
create or replace function public.normalize_phone(p text)
returns text language sql immutable set search_path = public as $$
  select case
    when (trim(coalesce(p, '')) like '+%' or regexp_replace(coalesce(p, ''), '\D', '', 'g') like '00%')
         and regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^00', '') not like '212%'
         and regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^00', '') not like '0%'
      then regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^00', '')
    else '212' || public.phone_digits(p) end
$$;
