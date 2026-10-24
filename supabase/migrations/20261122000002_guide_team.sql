-- Who can receive a guide. Phones stay private (column revoked from the API):
-- they are returned only to the owner / service managers, for the WhatsApp button.
create or replace function public.guide_team()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'full_name', e.full_name, 'color', e.color, 'avatar_url', e.avatar_url,
                                               'phone', case when public.has_perm('services.manage') then e.phone end)
                            order by e.full_name), '[]')
    from employees e
   where e.is_active and e.deleted_at is null and e.id is distinct from public.current_employee_id()
     and (public.has_perm('services.manage') or public.has_perm('requests.manage'))
$$;
