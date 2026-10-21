-- save_service: target duration, abroad flag and the internal guide
create or replace function public.save_service(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  sid uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
  t jsonb;
begin
  if not public.has_perm('services.manage') then raise exception 'forbidden'; end if;
  insert into services (id, category_id, kind, name_ar, name_fr, description_ar, description_fr,
                        pricing_mode, price, unit_ar, unit_fr, tax_rate, icon, image_url, pos_quick, pos_color,
                        pos_sort, is_online, duration_ar, duration_fr, official_url, required_documents,
                        fields, sort, is_active, target_hours, abroad)
  values (sid, nullif(p->>'category_id', '')::uuid, coalesce(p->>'kind', 'counter'), p->>'name_ar',
          coalesce(nullif(p->>'name_fr', ''), p->>'name_ar'), p->>'description_ar', p->>'description_fr',
          coalesce(p->>'pricing_mode', 'fixed'), coalesce((p->>'price')::bigint, 0), p->>'unit_ar', p->>'unit_fr',
          coalesce((p->>'tax_rate')::numeric, 20), p->>'icon', p->>'image_url',
          coalesce((p->>'pos_quick')::boolean, false), p->>'pos_color', coalesce((p->>'pos_sort')::int, 0),
          coalesce((p->>'is_online')::boolean, true), p->>'duration_ar', p->>'duration_fr', p->>'official_url',
          coalesce(p->'required_documents', '[]'), coalesce(p->'fields', '[]'),
          coalesce((p->>'sort')::int, 0), coalesce((p->>'is_active')::boolean, true),
          nullif(p->>'target_hours', '')::int, coalesce((p->>'abroad')::boolean, false))
  on conflict (id) do update set
    category_id = excluded.category_id, kind = excluded.kind, name_ar = excluded.name_ar,
    name_fr = excluded.name_fr, description_ar = excluded.description_ar, description_fr = excluded.description_fr,
    pricing_mode = case when services.system_key is null then excluded.pricing_mode else services.pricing_mode end,
    price = excluded.price, unit_ar = excluded.unit_ar, unit_fr = excluded.unit_fr, tax_rate = excluded.tax_rate,
    icon = excluded.icon, image_url = excluded.image_url, pos_quick = excluded.pos_quick,
    pos_color = excluded.pos_color, pos_sort = excluded.pos_sort, is_online = excluded.is_online,
    duration_ar = excluded.duration_ar, duration_fr = excluded.duration_fr, official_url = excluded.official_url,
    required_documents = excluded.required_documents, fields = excluded.fields, sort = excluded.sort,
    is_active = excluded.is_active, target_hours = excluded.target_hours, abroad = excluded.abroad;

  delete from service_price_tiers where service_id = sid;
  for t in select * from jsonb_array_elements(coalesce(p->'tiers', '[]')) loop
    insert into service_price_tiers (service_id, min_qty, unit_price)
    values (sid, (t->>'min_qty')::numeric, (t->>'unit_price')::bigint)
    on conflict do nothing;
  end loop;
  if p ? 'guide' and jsonb_typeof(p->'guide') = 'object' then
    insert into service_guides (service_id, steps_ar, tips_ar, links, images, updated_by)
    values (sid, nullif(trim(p->'guide'->>'steps_ar'), ''), nullif(trim(p->'guide'->>'tips_ar'), ''),
            coalesce(p->'guide'->'links', '[]'), coalesce(p->'guide'->'images', '[]'), public.current_employee_id())
    on conflict (service_id) do update set steps_ar = excluded.steps_ar, tips_ar = excluded.tips_ar,
      links = excluded.links, images = excluded.images, updated_by = excluded.updated_by;
  end if;
  return sid;
end $$;

-- Request detail: internal guide + target duration
create or replace function public.request_detail(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(r) || jsonb_build_object(
    'service', (select jsonb_build_object('id', s.id, 'fields', s.fields, 'required_documents', s.required_documents, 'official_url', s.official_url,
                                          'target_hours', s.target_hours)
                  from services s where s.id = r.service_id),
    'guide', (select to_jsonb(g) - 'service_id' from service_guides g where g.service_id = r.service_id),
    'due_at', (select r.created_at + make_interval(hours => s.target_hours) from services s where s.id = r.service_id and s.target_hours is not null),
    'done_at', public.request_done_at(r.id),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('status', h.status, 'note', h.note, 'created_at', h.created_at, 'employee_name', e.full_name) order by h.created_at), '[]')
                  from request_history h left join employees e on e.id = h.employee_id where h.request_id = r.id),
    'files', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'name', f.name, 'path', f.path, 'size', f.size, 'mime', f.mime, 'created_at', f.created_at) order by f.created_at), '[]')
                from request_files f where f.request_id = r.id and f.deleted_at is null))
  from service_requests r
  where r.id = p_id and (public.has_perm('requests.manage') or public.has_perm('requests.view_documents'))
$$;
