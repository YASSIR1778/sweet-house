-- =====================================================================
-- «شهادة عدم الخضوع للضريبة على الدخل», as customers call it. The DGI list of
-- individual attestations has no document by that name: a person without
-- income gets the «attestation de revenu» requested on form AAP049B-16I
-- (attestation de revenu / dossier de bourse, with a sworn declaration and an
-- «sans emploi» box). Steps follow that form, read on tax.gov.ma on 2026-10-28.
-- Added HIDDEN from the website (is_online = false) until the owner reviews it.
-- No video: none found that shows this paper request.
-- =====================================================================

with s as (
  insert into public.services (category_id, kind, name_ar, name_fr, description_ar, description_fr, pricing_mode, price, tax_rate,
                               is_online, is_active, duration_ar, duration_fr, official_url, required_documents, fields, sort, icon, abroad)
  select c.id, 'admin', $t$شهادة عدم الخضوع للضريبة على الدخل$t$, $t$Attestation de non-imposition à l’IR (attestation de revenu)$t$,
         $t$تحضير طلب «شهادة الدخل» لمن ليس له دخل أو لا يصرّح بدخله، وهي ما يُعرف بشهادة عدم الخضوع للضريبة على الدخل وتُطلب غالباً في ملفات المنح. نملأ الاستمارة الرسمية AAP049B مع التصريح بالشرف ونطبعها، ويودعها الزبون بمصلحة الضرائب.$t$,
         $t$Préparation de la demande d’attestation de revenu (formulaire AAP049B avec déclaration sur l’honneur) pour les personnes sans revenu ou non soumises à la déclaration, souvent exigée pour les bourses. Dépôt par le client au service des impôts.$t$,
         'fixed', 2000, 20,
         false, true, $t$التحضير فوري، والشهادة حسب مصلحة الضرائب$t$, $t$Préparation immédiate, délivrance selon le service des impôts$t$,
         $t$https://www.tax.gov.ma/wps/portal/DGI/Vos-impots-procedures/Attestations/attestations/attestations%20des%20particuliers/$t$,
         $j$[{"name_ar": "صورة البطاقة الوطنية (الوجهان)", "name_fr": "CIN (recto-verso)", "required": true}, {"name_ar": "شهادة الأجر أو المعاش للسنة الماضية (للأجير أو المتقاعد فقط)", "name_fr": "Attestation de salaire ou de pension (salarié ou retraité)", "required": false}]$j$::jsonb,
         $j$[{"key": "purpose", "label_ar": "الغرض", "label_fr": "Objet", "type": "select", "required": true, "options": ["ملف المنحة / Dossier de bourse", "ملف آخر / Autre dossier"]}, {"key": "situation", "label_ar": "وضعية الزبون", "label_fr": "Situation", "type": "select", "required": true, "options": ["بدون عمل ولا دخل / Sans emploi", "أجير أو متقاعد / Salarié ou retraité", "يصرّح بدخله سنوياً / Soumis à la déclaration"]}, {"key": "year", "label_ar": "السنة المعنية", "label_fr": "Année", "type": "text", "required": true}]$j$::jsonb,
         106, c.icon, false
    from public.service_categories c
   where c.id = 'a2493b2a-9cc3-46bb-a3ea-c915baf02768' and c.deleted_at is null
     and not exists (select 1 from public.services x where x.name_ar = $t$شهادة عدم الخضوع للضريبة على الدخل$t$ and x.deleted_at is null)
   limit 1
  returning id
)
insert into public.service_guides (service_id, steps, tips_ar, links, video_url, require_ref, templates)
select id, $j$[
  {"title": "حمّل الاستمارة الرسمية AAP049B-16I «طلب (شهادة الدخل / ملف المنحة) - تصريح بالشرف» من صفحة النماذج في موقع الضرائب واطبعها", "url": "https://www.tax.gov.ma/wps/portal/DGI/Vos-impots-procedures/Formulaires-fiscaux?concerned_person=&tax=&category=Demande&form_num=aap049&btnsubmit=Recherche", "url_label": "النموذج", "required": true},
  {"title": "في أعلى الاستمارة ضع علامة على «ملف المنحة» إن كانت الشهادة لملف منحة، وإلا على «شهادة الدخل»", "required": true},
  {"title": "املأ هوية الزبون من بطاقته: الاسم الكامل، عنوان السكن (الموطن الجبائي)، رقم البطاقة والهاتف، ورقم التعريف الضريبي أو CNSS أو رقم التأجير إن كان له", "required": true},
  {"title": "التصريح بالشرف (لمن لا يصرّح بدخله سنوياً): اكتب السنة المعنية، ثم ضع علامة «عاطل عن العمل» إن لم يكن له أي دخل، أو اكتب المبلغ الصافي الخاضع للضريبة لأجره أو معاشه إن كان أجيراً أو متقاعداً", "required": true},
  {"title": "أرفق نسخة البطاقة الوطنية، ومعها شهادة الأجر أو المعاش للسنة الماضية إن كان أجيراً أو متقاعداً", "required": true},
  {"title": "يكتب الزبون المكان والتاريخ ويوقّع بنفسه، ثم يودع الطلب بمصلحة الضرائب التابع لها عنوان سكنه ويتسلّم منها الشهادة", "required": true},
  {"title": "بديل إلكتروني: إن كان للزبون حساب SIMPL تُطلب «شهادة الدخل» من فضاء الشهادات (خدمة «الشهادات الضريبية للأفراد»)", "url": "https://attestation.tax.gov.ma/attestations/", "url_label": "SIMPL", "required": false}
]$j$::jsonb,
       $t$لا توجد في قائمة شهادات الأفراد بموقع المديرية العامة للضرائب شهادة باسم «عدم الخضوع للضريبة على الدخل»: ما يُسلَّم لمن لا دخل له هو «شهادة الدخل» بهذا الطلب والتصريح بالشرف. المعلومات غير الصحيحة في التصريح تعرّض صاحبه للمقتضيات القانونية (مكتوب في الاستمارة). إن كان المطلوب إثبات عدم امتلاك سكن (دعم السكن مثلاً) فتلك «شهادة عدم الخضوع لرسم السكن» في خدمة «الشهادات الضريبية للأفراد». الاستمارة لا تطلب لمن هو بلا عمل إلا نسخة البطاقة والتصريح بالشرف؛ إن طلبت مصلحة الضرائب وثيقة أخرى فاكتبها في «اقترح تعديلاً».$t$,
       $j$[{"label": "تحميل الاستمارة AAP049B (PDF)", "url": "https://www.tax.gov.ma/wps/wcm/connect/2318ae95-b8bb-4d88-b3c1-5a38b55814b9/aap_049b_16i.pdf?MOD=AJPERES"}, {"label": "شهادات الأفراد في موقع الضرائب", "url": "https://www.tax.gov.ma/wps/portal/DGI/Vos-impots-procedures/Attestations/attestations/attestations%20des%20particuliers/"}, {"label": "الموعد الجبائي", "url": "https://tax.rdv.gov.ma"}]$j$::jsonb,
       null, false, '[]'::jsonb from s;

-- The general tax-attestations guide points staff to the new service (only if nobody edited that guide).
update public.service_guides
   set tips_ar = coalesce(tips_ar, '') || ' لمن لا دخل له أو لملف منحة: استعمل خدمة «شهادة عدم الخضوع للضريبة على الدخل».'
 where service_id = (select id from public.services where name_ar = $t$الشهادات الضريبية للأفراد (الدخل، عدم الخضوع لرسم السكن…)$t$ and deleted_at is null limit 1)
   and updated_by is null and position('شهادة عدم الخضوع للضريبة على الدخل' in coalesce(tips_ar, '')) = 0;
