-- The nationality-certificate circular n° 17 is dated by its publication on adala.justice.gov.ma (February 2026), not by its signature.
update public.service_guides
   set tips_ar = replace(tips_ar, 'حسب الدورية المشتركة رقم 17 (وزارة العدل والخارجية، فبراير 2026)', 'حسب الدورية المشتركة رقم 17 لوزارتي العدل والخارجية (منشورة في بوابة عدالة، فبراير 2026)')
 where service_id = (select id from public.services where name_ar = 'شهادة الجنسية المغربية' and deleted_at is null limit 1)
   and updated_by is null;
