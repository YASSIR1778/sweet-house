-- Track customer downloads of ready documents, and allow free-form
-- "other service" requests when the customer does not find their document.

alter table public.request_files add column downloaded_at timestamptz;
alter table public.request_files add column download_count int not null default 0;

-- Called by the public-files Edge Function (service role) after a download link is issued.
create or replace function public.record_download(p_file uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_f request_files;
  v_r service_requests;
begin
  update request_files set downloaded_at = coalesce(downloaded_at, now()), download_count = download_count + 1
   where id = p_file returning * into v_f;
  if not found then return; end if;
  select * into v_r from service_requests where id = v_f.request_id;
  insert into request_history (request_id, status, note) values (v_r.id, v_r.status, 'customer_downloaded:' || v_f.name);
  if v_f.download_count = 1 then
    insert into notifications (type, severity, title_ar, title_fr, body, link)
    values ('document_downloaded', 'success', 'الزبون حمّل وثيقته', 'Le client a téléchargé son document', v_r.number || ' · ' || v_r.customer_name, '/requests');
  end if;
  -- A ready document that the customer downloaded is considered delivered.
  if v_r.status = 'ready' then
    update service_requests set status = 'delivered' where id = v_r.id;
    insert into request_history (request_id, status, note) values (v_r.id, 'delivered', 'auto_after_download');
  end if;
end $$;
revoke execute on function public.record_download(uuid) from public, anon, authenticated;
grant execute on function public.record_download(uuid) to service_role;

-- Customer uploads after the last staff action = "new documents" badge
create or replace function public.requests_list(p_limit int default 1000)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]') from (
    select to_jsonb(r) - 'internal_notes' - 'fields' || jsonb_build_object(
      'files_count', (select count(*) from request_files f where f.request_id = r.id and f.kind <> 'deliverable' and f.deleted_at is null),
      'deliverables_count', (select count(*) from request_files f where f.request_id = r.id and f.kind = 'deliverable' and f.deleted_at is null),
      'downloaded', exists (select 1 from request_files f where f.request_id = r.id and f.kind = 'deliverable' and f.downloaded_at is not null),
      'new_docs', (select count(*) from request_files f where f.request_id = r.id and f.kind <> 'deliverable' and f.deleted_at is null
                     and f.uploaded_by is null
                     and f.created_at > coalesce((select max(h.created_at) from request_history h where h.request_id = r.id and h.employee_id is not null), r.created_at + interval '5 minutes'))) x
    from service_requests r order by r.created_at desc limit p_limit) t
  where public.has_perm('requests.manage') or public.has_perm('requests.view_documents')
$$;

-- "Other / custom request" service
with c as (
  insert into public.service_categories (kind, name_ar, name_fr, icon, color, sort)
  values ('admin', 'طلبات أخرى', 'Autres demandes', 'sparkles', '#FF6B35', 99)
  returning id
)
insert into public.services (category_id, kind, system_key, name_ar, name_fr, description_ar, description_fr, pricing_mode, price,
                             is_online, duration_ar, duration_fr, required_documents, fields, sort, icon)
select id, 'admin', 'custom_request', 'لم تجد خدمتك؟ اشرح لنا طلبك', 'Vous ne trouvez pas ? Décrivez votre demande',
       'اكتب ما تحتاجه بالتفصيل وارفع الوثائق المتوفرة لديك، وسنتواصل معك بالسعر والمدة.',
       'Décrivez votre besoin et joignez vos documents ; nous vous recontactons avec le prix et le délai.',
       'fixed', 0, true, 'حسب الطلب', 'Selon la demande',
       '[{"name_ar":"أي وثائق متعلقة بطلبك","name_fr":"Tout document utile","required":false}]'::jsonb,
       '[{"key":"subject","label_ar":"ما الوثيقة أو الخدمة التي تحتاجها؟","label_fr":"Quel document ou service ?","type":"text","required":true},{"key":"details","label_ar":"اشرح طلبك بالتفصيل","label_fr":"Expliquez votre demande","type":"textarea","required":true}]'::jsonb,
       0, 'sparkles'
from c;
