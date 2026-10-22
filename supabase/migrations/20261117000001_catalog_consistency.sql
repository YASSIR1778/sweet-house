-- Catalog ↔ website consistency
--  · a new or imported product is visible on the store by default (it can be hidden)
--  · save_bank_account only changes the bank details; the payment methods
--    stay as set in the website editor (⚙️ shared → online payments)
alter table public.products alter column is_online set default true;

create or replace function public.save_bank_account(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('settings.manage') then raise exception 'forbidden'; end if;
  update settings set value = value || jsonb_build_object('bank_name', coalesce(p->>'bank_name', ''), 'rib', coalesce(p->>'rib', ''),
    'account_holder', coalesce(p->>'account_holder', ''),
    'bank_transfer', coalesce((p->>'bank_transfer')::boolean, (value->>'bank_transfer')::boolean, true),
    'in_store', coalesce((p->>'in_store')::boolean, (value->>'in_store')::boolean, true),
    'cod', coalesce((p->>'cod')::boolean, (value->>'cod')::boolean, true))
   where key = 'online_payments';
  update settings set value = value || jsonb_build_object('bank_name', coalesce(p->>'bank_name', ''), 'rib', coalesce(p->>'rib', '')) where key = 'invoice';
end $$;
