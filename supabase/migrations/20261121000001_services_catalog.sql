-- =====================================================================
-- Services catalog, October 2026.
-- * 24 new administrative services, each with a staff guide (steps read on
--   the official portals on 2026-10-24), documents, request fields, a recent
--   explainer video and a price. Added HIDDEN from the website (is_online =
--   false) until the owner reviews them.
-- * Prices for the existing services (our fee only: official fees are paid
--   separately and the description says so), videos where the guide had none.
-- * «موعد التأشيرة» becomes form & file help only (no appointment selling);
--   the generic NARSA service follows the Barid Bank / Barid Cash procedure.
-- Never overwrites a guide or a video the owner wrote.
-- =====================================================================

insert into public.service_categories (kind, name_ar, name_fr, icon, color, sort)
select 'admin', 'شؤون المواطن', 'Démarches citoyennes', 'shield-check', '#65A30D', 14
where not exists (select 1 from public.service_categories where kind = 'admin' and name_ar = 'شؤون المواطن' and deleted_at is null);

-- Certificat de nationalité marocaine
with s as (
  insert into public.services (category_id, kind, name_ar, name_fr, description_ar, description_fr, pricing_mode, price, tax_rate,
                               is_online, is_active, duration_ar, duration_fr, official_url, required_documents, fields, sort, icon, abroad)
  select c.id, 'admin', $t$شهادة الجنسية المغربية$t$, $t$Certificat de nationalité marocaine$t$, $t$طلب شهادة الجنسية المغربية عبر منصة وزارة العدل، وتصل الشهادة الرقمية إلى البريد الإلكتروني. الرسم الرسمي 50 درهماً يُؤدّى على حدة.$t$, $t$Demande en ligne du certificat de nationalité (ministère de la Justice), reçu par e-mail. Frais officiels de 50 DH en plus.$t$, 'fixed', 6000, 20,
         false, true, $t$حسب المحكمة$t$, $t$Selon le tribunal$t$, $t$https://nationalitemarocaine.justice.gov.ma$t$, $j$[{"name_ar": "نسخة كاملة من رسم الولادة (مصادق عليها أو بأبوستيل للمزداد بالخارج)", "name_fr": "Copie intégrale d’acte de naissance", "required": true}, {"name_ar": "صورة فوتوغرافية", "name_fr": "Photo", "required": true}, {"name_ar": "وثيقة تثبت جنسية الأب (عقد ازدياده أو بطاقته أو شهادة وفاته) حسب الحالة", "name_fr": "Justificatif du père selon le cas", "required": false}, {"name_ar": "شهادة السكنى إن كان للزبون عنوان بالمغرب", "name_fr": "Certificat de résidence", "required": false}, {"name_ar": "صورة البطاقة الوطنية (الوجهان)", "name_fr": "CIN (recto-verso)", "required": true}]$j$::jsonb, $j$[{"key": "case", "label_ar": "وضعية الطالب", "label_fr": "Situation", "type": "select", "required": true, "options": ["مغربي حامل للبطاقة الوطنية / Titulaire CNIE", "مزداد من أب مغربي بدون بطاقة / Père marocain", "مزداد من أم مغربية / Mère marocaine", "جنسية مكتسبة بقرار / Acquise par décret"]}, {"key": "delivery_email", "label_ar": "البريد الإلكتروني لاستلام الشهادة", "label_fr": "E-mail de réception", "type": "text", "required": true}]$j$::jsonb, 100, c.icon, true
    from public.service_categories c
   where c.id = '29520af1-81ed-4ea9-91c9-2958d80b35b5' and c.deleted_at is null
     and not exists (select 1 from public.services x where x.name_ar = $t$شهادة الجنسية المغربية$t$ and x.deleted_at is null)
   limit 1
  returning id
)
insert into public.service_guides (service_id, steps, tips_ar, links, video_url, require_ref, templates)
select id, $j$[{"title": "افتح منصة شهادة الجنسية ← «طلب جديد»", "required": true, "url": "https://nationalitemarocaine.justice.gov.ma/Pages/NouvelleDemande", "url_label": "المنصة"}, {"title": "اختر وضعية الطالب، وافتح «الوثائق المطلوبة» الخاصة بها", "required": true}, {"title": "حمّل الوثائق ممسوحة بوضوح (رسم الولادة الكامل، وترجمته للعربية إن كان بلغة أجنبية)", "required": true}, {"title": "أدِّ رسم الخدمة 50 درهماً إلكترونياً، واكتب رقم الطلب في «مرجع الإنجاز»", "required": true}, {"title": "أخبر الزبون: تصله رسالة من المحكمة لتقديم أصول الوثائق (مغاربة العالم: في أقرب قنصلية)، ثم تصله الشهادة على بريده", "required": true}, {"title": "تابع الطلب من «تتبع الطلب»", "required": false, "url": "https://nationalitemarocaine.justice.gov.ma/Pages/SuiviDemande", "url_label": "التتبّع"}]$j$::jsonb, $t$حسب الدورية المشتركة رقم 17 (وزارة العدل والخارجية، فبراير 2026): بعد الإيداع والأداء تراجع المحكمة الابتدائية الوثائق المحمّلة، ثم تُقدَّم الأصول (لمغاربة الخارج في القنصلية)، والشهادة رقمية تصل بالبريد الإلكتروني. يمكن أيضاً استعمال تطبيق Mahakim Mobile.$t$, $j$[]$j$::jsonb, $t$https://www.youtube.com/watch?v=sFC4PXr-9TQ$t$, true, '[]'::jsonb from s;

-- Extrait de fiche anthropométrique (ePolice)
with s as (
  insert into public.services (category_id, kind, name_ar, name_fr, description_ar, description_fr, pricing_mode, price, tax_rate,
                               is_online, is_active, duration_ar, duration_fr, official_url, required_documents, fields, sort, icon, abroad)
  select c.id, 'admin', $t$نسخة من بطاقة السوابق (ePolice)$t$, $t$Extrait de fiche anthropométrique (ePolice)$t$, $t$طلب نسخة من بطاقة السوابق (حسن السيرة) من المديرية العامة للأمن الوطني عن بعد، للمقيمين بالمغرب حاملي البطاقة الوطنية الإلكترونية. واجب التنبر يُؤدّى على حدة.$t$, $t$Extrait de fiche anthropométrique (DGSN) à distance, pour les résidents titulaires de la CNIE électronique. Timbre en plus.$t$, 'fixed', 3000, 20,
         false, true, $t$حسب مكان الاستلام$t$, $t$Selon le lieu de retrait$t$, $t$https://www.epolice.ma/request-service$t$, $j$[{"name_ar": "البطاقة الوطنية الإلكترونية + الهاتف المفعّلة عليه الهوية الرقمية", "name_fr": "CNIE électronique + téléphone avec l’identité numérique", "required": true}]$j$::jsonb, $j$[{"key": "pickup", "label_ar": "مكان الاستلام المفضل", "label_fr": "Lieu de retrait souhaité", "type": "text", "required": false}]$j$::jsonb, 101, c.icon, false
    from public.service_categories c
   where c.id = '29520af1-81ed-4ea9-91c9-2958d80b35b5' and c.deleted_at is null
     and not exists (select 1 from public.services x where x.name_ar = $t$نسخة من بطاقة السوابق (ePolice)$t$ and x.deleted_at is null)
   limit 1
  returning id
)
insert into public.service_guides (service_id, steps, tips_ar, links, video_url, require_ref, templates)
select id, $j$[{"title": "افتح ePolice ← «نسخة من بطاقة السوابق» واقبل الشروط العامة", "required": true, "url": "https://www.epolice.ma/request-service", "url_label": "ePolice"}, {"title": "تعريف الزبون عن بعد بهويته الرقمية (تطبيق «Mon Identité Numérique» على هاتفه + بطاقته): الزبون حاضر", "required": true}, {"title": "بعد موافقة الزبون: الملء التلقائي من معطيات البطاقة، ثم اختر مكان الاستلام", "required": true}, {"title": "أدِّ واجب التنبر عبر الإنترنت أو لدى أحد مزودي خدمات الأداء", "required": true}, {"title": "اطبع وصل الطلب وسلّمه للزبون: يُدلي به لاستلام النسخة من المكان المختار، واكتب رقمه في «مرجع الإنجاز»", "required": true}]$j$::jsonb, $t$الخدمة للمواطنين المقيمين بالمغرب. تتطلب هوية رقمية مفعّلة (انظر خدمة «تفعيل الهوية الرقمية»). الهوية للزبون نفسه: لا تستعمل هاتفك ولا بطاقتك.$t$, $j$[]$j$::jsonb, $t$https://www.youtube.com/watch?v=VbbQj4AmSCg$t$, true, '[]'::jsonb from s;

-- Activation de l’identité numérique
with s as (
  insert into public.services (category_id, kind, name_ar, name_fr, description_ar, description_fr, pricing_mode, price, tax_rate,
                               is_online, is_active, duration_ar, duration_fr, official_url, required_documents, fields, sort, icon, abroad)
  select c.id, 'admin', $t$تفعيل الهوية الرقمية (Mon Identité Numérique)$t$, $t$Activation de l’identité numérique$t$, $t$نساعدك على تنزيل تطبيق «هويتي الرقمية» ونسخ بطاقتك الوطنية الإلكترونية على هاتفك، لتدخل للخدمات الرقمية بدون كلمة سر. الخدمة الرسمية مجانية.$t$, $t$Installation de l’application « Mon Identité Numérique » et duplication de la CNIE sur le smartphone. Service officiel gratuit.$t$, 'fixed', 3000, 20,
         false, true, $t$نفس اليوم$t$, $t$Le jour même$t$, $t$https://www.identitenumerique.ma$t$, $j$[{"name_ar": "البطاقة الوطنية الإلكترونية الجديدة", "name_fr": "Nouvelle CNIE électronique", "required": true}]$j$::jsonb, $j$[{"key": "phone_model", "label_ar": "نوع الهاتف (يجب أن يدعم NFC)", "label_fr": "Modèle du téléphone (NFC)", "type": "text", "required": false}]$j$::jsonb, 102, c.icon, false
    from public.service_categories c
   where c.kind = 'admin' and c.name_ar = 'شؤون المواطن' and c.deleted_at is null
     and not exists (select 1 from public.services x where x.name_ar = $t$تفعيل الهوية الرقمية (Mon Identité Numérique)$t$ and x.deleted_at is null)
   limit 1
  returning id
)
insert into public.service_guides (service_id, steps, tips_ar, links, video_url, require_ref, templates)
select id, $j$[{"title": "تأكد أن الزبون يحمل البطاقة الإلكترونية الجديدة وأن هاتفه يدعم NFC", "required": true, "url": "https://www.identitenumerique.ma", "url_label": "البوابة"}, {"title": "نزّل تطبيق «Mon Identité Numérique» من المتجر الرسمي على هاتف الزبون", "required": true}, {"title": "اتبع «نسخ البطاقة على الهاتف»: قراءة البطاقة بـNFC والتحقق الوجهي، والرمز السري يختاره الزبون بنفسه", "required": true}, {"title": "جرّب الدخول لخدمة شريكة (ePolice أو تعويضاتي) للتأكد", "required": false}]$j$::jsonb, $t$الرمز السري يكتبه الزبون بنفسه ولا تحتفظ به أبداً. كل استعمال للهوية يظهر في البوابة الشخصية للزبون.$t$, $j$[]$j$::jsonb, $t$https://www.youtube.com/watch?v=JblOIBa1KBY$t$, false, '[]'::jsonb from s;

-- Achat du e-timbre (passeport, permis international…)
with s as (
  insert into public.services (category_id, kind, name_ar, name_fr, description_ar, description_fr, pricing_mode, price, tax_rate,
                               is_online, is_active, duration_ar, duration_fr, official_url, required_documents, fields, sort, icon, abroad)
  select c.id, 'admin', $t$شراء الطابع الإلكتروني (جواز، رخصة دولية…)$t$, $t$Achat du e-timbre (passeport, permis international…)$t$, $t$شراء الطابع الإلكتروني الرسمي لجواز السفر أو الرخصة الدولية للسياقة أو رخصة الصيد أو حمل السلاح، وتسليمك رقمه. قيمة الطابع تُؤدّى على حدة.$t$, $t$Achat du timbre électronique officiel (passeport, permis international, chasse, port d’arme). Valeur du timbre en plus.$t$, 'fixed', 1000, 20,
         false, true, $t$فوري$t$, $t$Immédiat$t$, $t$https://timbre-fiscal.tax.gov.ma/etimfisc$t$, $j$[]$j$::jsonb, $j$[{"key": "stamp", "label_ar": "نوع الطابع", "label_fr": "Timbre", "type": "select", "required": true, "options": ["جواز السفر / Passeport", "الرخصة الدولية للسياقة / Permis international", "رخصة الصيد / Permis de chasse", "حمل السلاح / Port d’arme"]}, {"key": "qty", "label_ar": "العدد", "label_fr": "Quantité", "type": "text", "required": false}]$j$::jsonb, 103, c.icon, false
    from public.service_categories c
   where c.id = 'a2493b2a-9cc3-46bb-a3ea-c915baf02768' and c.deleted_at is null
     and not exists (select 1 from public.services x where x.name_ar = $t$شراء الطابع الإلكتروني (جواز، رخصة دولية…)$t$ and x.deleted_at is null)
   limit 1
  returning id
)
insert into public.service_guides (service_id, steps, tips_ar, links, video_url, require_ref, templates)
select id, $j$[{"title": "افتح بوابة الطابع الإلكتروني", "required": true, "url": "https://timbre-fiscal.tax.gov.ma/etimfisc", "url_label": "e-Timbre"}, {"title": "اختر الطابع والعدد ثم «إضافة الطابع»", "required": true}, {"title": "أدخل رقم هاتف الزبون مرتين", "required": true}, {"title": "أدِّ بالبطاقة البنكية، أو اختر «الدفع عن طريق الوسطاء»", "required": true}, {"title": "سلّم الزبون رقم الطابع (أو استعمله مباشرة في طلب الجواز) واكتبه في «مرجع الإنجاز»", "required": true}]$j$::jsonb, $t$المتوفر حالياً في البوابة: طابع جواز السفر، والرخصة الدولية للسياقة، ورخصة الصيد، وحمل السلاح. طابع الجواز يُشترى أيضاً من passeport.ma.$t$, $j$[]$j$::jsonb, $t$https://www.youtube.com/watch?v=orLn7B9pfxI$t$, true, '[]'::jsonb from s;

-- Attestations fiscales des particuliers
with s as (
  insert into public.services (category_id, kind, name_ar, name_fr, description_ar, description_fr, pricing_mode, price, tax_rate,
                               is_online, is_active, duration_ar, duration_fr, official_url, required_documents, fields, sort, icon, abroad)
  select c.id, 'admin', $t$الشهادات الضريبية للأفراد (الدخل، عدم الخضوع لرسم السكن…)$t$, $t$Attestations fiscales des particuliers$t$, $t$طلب شهادة الدخل أو شهادة عدم الخضوع لرسم السكن ورسم الخدمات الجماعية أو شهادة الإقامة الجبائية من المديرية العامة للضرائب (مطلوبة للمنح والدعم والملفات).$t$, $t$Attestation de revenu, de non-imposition TH/TSC ou de résidence fiscale (DGI), souvent exigée pour les bourses et aides.$t$, 'fixed', 5000, 20,
         false, true, $t$24 - 72 ساعة$t$, $t$24 - 72 h$t$, $t$https://www.tax.gov.ma/wps/portal/DGI/Vos-impots-procedures/Attestations/attestations/attestations%20des%20particuliers/$t$, $j$[{"name_ar": "صورة البطاقة الوطنية (الوجهان)", "name_fr": "CIN (recto-verso)", "required": true}, {"name_ar": "شهادة الأجر أو المعاش للسنة الماضية (لغير المصرّحين بالدخل)", "name_fr": "Attestation de salaire ou de pension", "required": false}]$j$::jsonb, $j$[{"key": "type", "label_ar": "نوع الشهادة", "label_fr": "Attestation", "type": "select", "required": true, "options": ["شهادة الدخل / Revenu", "عدم الخضوع لرسم السكن والخدمات / Non-imposition TH-TSC", "الخضوع لرسم السكن / Imposition TH-TSC", "الإقامة الجبائية / Résidence fiscale"]}, {"key": "year", "label_ar": "السنة المعنية", "label_fr": "Année", "type": "text", "required": false}]$j$::jsonb, 104, c.icon, false
    from public.service_categories c
   where c.id = 'a2493b2a-9cc3-46bb-a3ea-c915baf02768' and c.deleted_at is null
     and not exists (select 1 from public.services x where x.name_ar = $t$الشهادات الضريبية للأفراد (الدخل، عدم الخضوع لرسم السكن…)$t$ and x.deleted_at is null)
   limit 1
  returning id
)
insert into public.service_guides (service_id, steps, tips_ar, links, video_url, require_ref, templates)
select id, $j$[{"title": "للزبون حساب SIMPL: ادخل «TELESERVICES SIMPL - vos attestations» واختر الشهادة", "required": true, "url": "https://attestation.tax.gov.ma/attestations/", "url_label": "SIMPL"}, {"title": "بدون حساب: املأ الاستمارة الورقية (AAP049 للدخل، AAP009 لعدم الخضوع، AAP120 للخضوع) مع نسخة البطاقة، وتودَع بمصلحة الضرائب", "required": true}, {"title": "لغير المصرّحين بالدخل: أرفق شهادة الأجر أو المعاش للسنة السابقة", "required": false}, {"title": "عند الجاهزية حمّل الشهادة من نفس الفضاء وارفعها للزبون", "required": true}]$j$::jsonb, $t$الطلب الإلكتروني يتطلب الانخراط في خدمات SIMPL. للإيداع الورقي يمكن أخذ موعد من «الموعد الجبائي». لا تطلب الشهادة باسم غير صاحبها.$t$, $j$[{"label": "الموعد الجبائي", "url": "https://tax.rdv.gov.ma"}]$j$::jsonb, $t$https://www.youtube.com/watch?v=x_dH0l2FnCo$t$, true, '[]'::jsonb from s;

-- Paiement de la TH / TSC
with s as (
  insert into public.services (category_id, kind, name_ar, name_fr, description_ar, description_fr, pricing_mode, price, tax_rate,
                               is_online, is_active, duration_ar, duration_fr, official_url, required_documents, fields, sort, icon, abroad)
  select c.id, 'admin', $t$أداء رسم السكن ورسم الخدمات الجماعية$t$, $t$Paiement de la TH / TSC$t$, $t$الاطلاع على إشعار رسم السكن ورسم الخدمات الجماعية (النظافة) وأداؤه إلكترونياً. قيمة الضريبة تُؤدّى على حدة.$t$, $t$Consultation et paiement en ligne de la taxe d’habitation et de services communaux. Montant de la taxe en plus.$t$, 'fixed', 2000, 20,
         false, true, $t$فوري$t$, $t$Immédiat$t$, $t$https://www.tax.gov.ma$t$, $j$[{"name_ar": "الإشعار الضريبي أو رقم المادة", "name_fr": "Avis d’imposition", "required": false}]$j$::jsonb, $j$[{"key": "ref", "label_ar": "رقم الإشعار أو رقم التعريف الضريبي للسكن", "label_fr": "N° d’avis / identifiant", "type": "text", "required": false}]$j$::jsonb, 105, c.icon, false
    from public.service_categories c
   where c.id = 'a2493b2a-9cc3-46bb-a3ea-c915baf02768' and c.deleted_at is null
     and not exists (select 1 from public.services x where x.name_ar = $t$أداء رسم السكن ورسم الخدمات الجماعية$t$ and x.deleted_at is null)
   limit 1
  returning id
)
insert into public.service_guides (service_id, steps, tips_ar, links, video_url, require_ref, templates)
select id, $j$[{"title": "افتح بوابة المديرية العامة للضرائب (أو التطبيق البنكي للزبون) ← أداء رسم السكن ورسم الخدمات الجماعية", "required": true, "url": "https://www.tax.gov.ma", "url_label": "DGI"}, {"title": "أدخل مرجع الإشعار الضريبي", "required": true}, {"title": "تحقق من المبلغ والسنة مع الزبون قبل الأداء", "required": true}, {"title": "أدِّ بالبطاقة البنكية، واطبع الوصل وسلّمه للزبون", "required": true}]$j$::jsonb, $t$منذ 12 يونيو 2025 تدبّر المديرية العامة للضرائب هذين الرسمين (القانون 14.25). آخر أجل لسنة 2026 كان فاتح يونيو 2026، وبعده تُطبَّق غرامة 10% وزيادة 5% عن الشهر الأول و0.5% عن كل شهر إضافي. الأداء ممكن أيضاً في الوكالات البنكية ومؤسسات الأداء وقباضات الضرائب.$t$, $j$[]$j$::jsonb, $t$https://www.youtube.com/watch?v=c8W_n813q50$t$, true, '[]'::jsonb from s;

-- Renouvellement du permis de conduire
with s as (
  insert into public.services (category_id, kind, name_ar, name_fr, description_ar, description_fr, pricing_mode, price, tax_rate,
                               is_online, is_active, duration_ar, duration_fr, official_url, required_documents, fields, sort, icon, abroad)
  select c.id, 'admin', $t$تجديد رخصة السياقة (تبديل البطاقة)$t$, $t$Renouvellement du permis de conduire$t$, $t$تجهيز ملف تجديد رخصة السياقة (انتهاء الصلاحية أو التلف أو تغيير الهوية) وملء الاستمارة. الإيداع بحضورك في وكالة بريد بنك أو بريد كاش. الرسوم الرسمية 400 درهم تُؤدّى على حدة.$t$, $t$Dossier de renouvellement du permis (expiration, détérioration, changement d’identité). Dépôt à Al Barid Bank / Barid Cash. Frais officiels 400 DH en plus.$t$, 'fixed', 5000, 20,
         false, true, $t$حسب نارسا (رسالة SMS)$t$, $t$Selon NARSA (SMS)$t$, $t$https://khadamatnarsa.ma/fr/services/echange-de-mon-permis-de-conduire$t$, $j$[{"name_ar": "رخصة السياقة القديمة", "name_fr": "Ancien permis", "required": true}, {"name_ar": "صورة البطاقة الوطنية (الوجهان)", "name_fr": "CIN (recto-verso)", "required": true}, {"name_ar": "شهادة طبية من طبيب معتمد (أقل من 3 أشهر)", "name_fr": "Certificat médical agréé (< 3 mois)", "required": true}, {"name_ar": "صورتان 35×45 ملونتان بخلفية زرقاء", "name_fr": "2 photos 35×45 fond bleu", "required": true}]$j$::jsonb, $j$[{"key": "reason", "label_ar": "السبب", "label_fr": "Motif", "type": "select", "required": true, "options": ["انتهاء الصلاحية / Expiration", "تلف / Détérioration", "تغيير الهوية / Changement d’identité"]}]$j$::jsonb, 106, c.icon, false
    from public.service_categories c
   where c.id = 'a10da892-eb48-41c5-b298-c92acbe01e88' and c.deleted_at is null
     and not exists (select 1 from public.services x where x.name_ar = $t$تجديد رخصة السياقة (تبديل البطاقة)$t$ and x.deleted_at is null)
   limit 1
  returning id
)
insert into public.service_guides (service_id, steps, tips_ar, links, video_url, require_ref, templates)
select id, $j$[{"title": "حمّل الاستمارة الرسمية واملأها ليوقعها الزبون", "required": true, "url": "https://khadamatnarsa.ma/sites/default/files/2022-02/Formulaire%20de%20demande%20de%20renouvellement%20ou%20duplicata%20du%20permis%20de%20conduire.pdf", "url_label": "الاستمارة"}, {"title": "راجع الملف: البطاقة الوطنية، الشهادة الطبية (أقل من 3 أشهر، طبيب معتمد)، صورتان 35×45 بخلفية زرقاء، الرخصة القديمة", "required": true}, {"title": "تأكد من أداء الرسوم 400 درهم، وغرامة التأخير إن وُجدت (200 درهم + 10% عن كل شهر)", "required": true}, {"title": "وجّه الزبون لإيداع الملف في وكالة بريد بنك أو بريد كاش المعتمدة", "required": true, "url": "https://khadamatnarsa.ma/fr/abb", "url_label": "لائحة الوكالات"}, {"title": "اكتب رقم الإيداع في «مرجع الإنجاز»: تصل الزبون رسالة SMS عند جاهزية الرخصة", "required": true}]$j$::jsonb, $t$غرامة تجاوز أجل التجديد: 200 درهم مع زيادة 10% عن كل شهر تأخير (المادة 118 من مدونة السير). بعد رسالة SMS تُستلم الرخصة من نفس الوكالة التي أُودع فيها الملف.$t$, $j$[{"label": "تتبّع الملف (نارسا)", "url": "https://khadamatnarsa.ma/fr/suivi-des-dossiers"}]$j$::jsonb, $t$https://www.youtube.com/watch?v=27CvngR6BbI$t$, true, '[]'::jsonb from s;

-- Duplicata du permis de conduire
with s as (
  insert into public.services (category_id, kind, name_ar, name_fr, description_ar, description_fr, pricing_mode, price, tax_rate,
                               is_online, is_active, duration_ar, duration_fr, official_url, required_documents, fields, sort, icon, abroad)
  select c.id, 'admin', $t$نظير رخصة السياقة (ضياع أو سرقة)$t$, $t$Duplicata du permis de conduire$t$, $t$تجهيز ملف نظير رخصة السياقة في حالة الضياع أو السرقة. الإيداع بحضورك في بريد بنك أو بريد كاش. الرسوم الرسمية 400 درهم تُؤدّى على حدة.$t$, $t$Dossier de duplicata du permis (perte ou vol). Dépôt à Al Barid Bank / Barid Cash. Frais officiels 400 DH en plus.$t$, 'fixed', 5000, 20,
         false, true, $t$حسب نارسا (رسالة SMS)$t$, $t$Selon NARSA (SMS)$t$, $t$https://khadamatnarsa.ma/fr/services/duplicata-de-mon-permis-de-conduire$t$, $j$[{"name_ar": "تصريح بالضياع أو السرقة (الأمن الوطني أو الدرك)", "name_fr": "Déclaration de perte ou de vol", "required": true}, {"name_ar": "صورة البطاقة الوطنية (الوجهان)", "name_fr": "CIN (recto-verso)", "required": true}, {"name_ar": "شهادة طبية من طبيب معتمد (أقل من 3 أشهر)", "name_fr": "Certificat médical agréé (< 3 mois)", "required": true}, {"name_ar": "صورتان 35×45 ملونتان بخلفية زرقاء", "name_fr": "2 photos 35×45 fond bleu", "required": true}]$j$::jsonb, $j$[]$j$::jsonb, 107, c.icon, false
    from public.service_categories c
   where c.id = 'a10da892-eb48-41c5-b298-c92acbe01e88' and c.deleted_at is null
     and not exists (select 1 from public.services x where x.name_ar = $t$نظير رخصة السياقة (ضياع أو سرقة)$t$ and x.deleted_at is null)
   limit 1
  returning id
)
insert into public.service_guides (service_id, steps, tips_ar, links, video_url, require_ref, templates)
select id, $j$[{"title": "حمّل الاستمارة الرسمية (نفس استمارة التجديد) واملأها ليوقعها الزبون", "required": true, "url": "https://khadamatnarsa.ma/sites/default/files/2022-02/Formulaire%20de%20demande%20de%20renouvellement%20ou%20duplicata%20du%20permis%20de%20conduire.pdf", "url_label": "الاستمارة"}, {"title": "تأكد من تصريح الضياع أو السرقة (من القنصلية إن ضاعت الرخصة خارج المغرب)", "required": true}, {"title": "راجع باقي الوثائق: البطاقة، الشهادة الطبية، الصورتان", "required": true}, {"title": "أداء الرسوم 400 درهم، ثم الإيداع في بريد بنك أو بريد كاش", "required": true, "url": "https://khadamatnarsa.ma/fr/abb", "url_label": "لائحة الوكالات"}, {"title": "اكتب رقم الإيداع في «مرجع الإنجاز»: SMS عند الجاهزية", "required": true}]$j$::jsonb, $t$النظير يُستلم من نفس الوكالة التي أُودع فيها الملف.$t$, $j$[{"label": "تتبّع الملف (نارسا)", "url": "https://khadamatnarsa.ma/fr/suivi-des-dossiers"}]$j$::jsonb, $t$https://www.youtube.com/watch?v=Qx1hsezoTE0$t$, true, '[]'::jsonb from s;

-- Échange d’un permis étranger
with s as (
  insert into public.services (category_id, kind, name_ar, name_fr, description_ar, description_fr, pricing_mode, price, tax_rate,
                               is_online, is_active, duration_ar, duration_fr, official_url, required_documents, fields, sort, icon, abroad)
  select c.id, 'admin', $t$تبديل رخصة سياقة أجنبية برخصة مغربية$t$, $t$Échange d’un permis étranger$t$, $t$تجهيز ملف تبديل رخصة سياقة أجنبية برخصة مغربية (مغاربة العالم العائدون نهائياً، والأجانب المقيمون حسب اتفاقيات المعاملة بالمثل). الإيداع لدى المصلحة الإقليمية لنارسا. الرسوم الرسمية 700 درهم تُؤدّى على حدة.$t$, $t$Dossier d’échange d’un permis étranger contre un permis marocain (MRE de retour définitif, étrangers résidents). Dépôt au centre NARSA. Frais officiels 700 DH en plus.$t$, 'fixed', 10000, 20,
         false, true, $t$رخصة مؤقتة 60 يوماً ثم النهائية$t$, $t$Permis provisoire 60 jours puis définitif$t$, $t$https://khadamatnarsa.ma/fr/services/echange-de-mon-permis-de-conduire-etranger$t$, $j$[{"name_ar": "أصل الرخصة الأجنبية السارية + ترجمة عربية أو فرنسية", "name_fr": "Permis étranger original + traduction", "required": true}, {"name_ar": "البطاقة الوطنية أو جواز السفر", "name_fr": "CNIE ou passeport", "required": true}, {"name_ar": "شهادة طبية من طبيب معتمد (أقل من 3 أشهر)", "name_fr": "Certificat médical agréé (< 3 mois)", "required": true}, {"name_ar": "صورتان 35×45 ملونتان بخلفية زرقاء", "name_fr": "2 photos 35×45 fond bleu", "required": true}]$j$::jsonb, $j$[{"key": "country", "label_ar": "بلد إصدار الرخصة", "label_fr": "Pays de délivrance", "type": "text", "required": true}]$j$::jsonb, 108, c.icon, true
    from public.service_categories c
   where c.id = 'a10da892-eb48-41c5-b298-c92acbe01e88' and c.deleted_at is null
     and not exists (select 1 from public.services x where x.name_ar = $t$تبديل رخصة سياقة أجنبية برخصة مغربية$t$ and x.deleted_at is null)
   limit 1
  returning id
)
insert into public.service_guides (service_id, steps, tips_ar, links, video_url, require_ref, templates)
select id, $j$[{"title": "تحقق من الأهلية: مغربي عائد نهائياً (حتى بدون اتفاقية)، أو أجنبي مقيم ورخصته من بلد له اتفاقية مع المغرب", "required": true, "url": "https://khadamatnarsa.ma/fr/services/echange-de-mon-permis-de-conduire-etranger", "url_label": "الشروط والاتفاقيات"}, {"title": "حمّل استمارة التبديل من نفس الصفحة واملأها ليوقعها الزبون", "required": true}, {"title": "جهّز الملف: أصل الرخصة + الترجمة، البطاقة أو الجواز، الشهادة الطبية، الصورتان", "required": true}, {"title": "أداء الرسوم 700 درهم في إحدى قباضات الخزينة العامة للمملكة والاحتفاظ بالوصل", "required": true}, {"title": "الإيداع بحضور الزبون لدى المصلحة الإقليمية لنارسا (مركز التسجيل): يتسلم رخصة مؤقتة صالحة 60 يوماً", "required": true}, {"title": "بعد التحقق من صحة الرخصة مع البلد الأصلي تُسلَّم الرخصة النهائية", "required": false}]$j$::jsonb, $t$الرخصة الأجنبية السارية تسمح بالسياقة في المغرب سنة على الأكثر من بداية الإقامة. دول لها اتفاقية مع المغرب: إسبانيا، إيطاليا، بلجيكا، البرتغال، سويسرا، تركيا، تونس، السعودية، مصر… وفرنسا بالمعاملة بالمثل (اللائحة كاملة في صفحة نارسا). الأجنبي المقيم يضيف بطاقة الإقامة وشهادة السكنى (أقل من 3 أشهر).$t$, $j$[]$j$::jsonb, null, true, '[]'::jsonb from s;

-- Duplicata de la carte grise
with s as (
  insert into public.services (category_id, kind, name_ar, name_fr, description_ar, description_fr, pricing_mode, price, tax_rate,
                               is_online, is_active, duration_ar, duration_fr, official_url, required_documents, fields, sort, icon, abroad)
  select c.id, 'admin', $t$نظير البطاقة الرمادية (ضياع أو سرقة)$t$, $t$Duplicata de la carte grise$t$, $t$تجهيز ملف نظير البطاقة الرمادية في حالة الضياع أو السرقة. الإيداع في بريد بنك أو بريد كاش. الرسوم الرسمية: 405 درهم للسيارات (355 للدراجات فوق 125 سم³) تُؤدّى على حدة.$t$, $t$Dossier de duplicata de carte grise (perte ou vol). Dépôt à Al Barid Bank / Barid Cash. Frais officiels : 405 DH voitures, 355 DH motos > 125 cm³.$t$, 'fixed', 5000, 20,
         false, true, $t$حسب نارسا$t$, $t$Selon NARSA$t$, $t$https://khadamatnarsa.ma/fr/services/duplicata-de-ma-carte-grise$t$, $j$[{"name_ar": "تصريح بالضياع أو السرقة", "name_fr": "Déclaration de perte ou de vol", "required": true}, {"name_ar": "صورة البطاقة الوطنية (الوجهان)", "name_fr": "CIN (recto-verso)", "required": true}, {"name_ar": "وثائق إثبات السكن", "name_fr": "Justificatifs de résidence", "required": false}]$j$::jsonb, $j$[{"key": "plate", "label_ar": "رقم التسجيل", "label_fr": "Immatriculation", "type": "text", "required": true}]$j$::jsonb, 109, c.icon, false
    from public.service_categories c
   where c.id = 'a10da892-eb48-41c5-b298-c92acbe01e88' and c.deleted_at is null
     and not exists (select 1 from public.services x where x.name_ar = $t$نظير البطاقة الرمادية (ضياع أو سرقة)$t$ and x.deleted_at is null)
   limit 1
  returning id
)
insert into public.service_guides (service_id, steps, tips_ar, links, video_url, require_ref, templates)
select id, $j$[{"title": "املأ الاستمارة BI ليوقعها المالك (أو BII حسب طريقة شراء السيارة كما في صفحة الخدمة)", "required": true, "url": "https://khadamatnarsa.ma/sites/default/files/2022-03/FORMULE%20BI.pdf", "url_label": "الاستمارة BI"}, {"title": "تأكد من تصريح الضياع أو السرقة ووثائق السكن (الملحق 6)", "required": true, "url": "https://khadamatnarsa.ma/sites/default/files/2022-05/Doc%20Justif%20R%C3%A9sidence%20ANNEXE%206.pdf", "url_label": "الملحق 6"}, {"title": "أداء رسوم النظير", "required": true}, {"title": "الإيداع في بريد بنك أو بريد كاش مقابل وصل صالح 60 يوماً", "required": true, "url": "https://khadamatnarsa.ma/fr/abb", "url_label": "لائحة الوكالات"}, {"title": "اكتب رقم الوصل في «مرجع الإنجاز» وتابع الملف", "required": true}]$j$::jsonb, $t$الرسم 405 دراهم للسيارات والمقطورات فوق 1000 كلغ، و355 للدراجات فوق 125 سم³. لشاحنات نقل البضائع فوق 3.5 طن يلزم أيضاً إذن التسجيل من وزارة النقل.$t$, $j$[{"label": "تتبّع الملف (نارسا)", "url": "https://khadamatnarsa.ma/fr/suivi-des-dossiers"}, {"label": "الاستمارة BII", "url": "https://khadamatnarsa.ma/sites/default/files/2022-03/FORMULE%20BII.pdf"}]$j$::jsonb, null, true, '[]'::jsonb from s;

-- Mutation d’un véhicule
with s as (
  insert into public.services (category_id, kind, name_ar, name_fr, description_ar, description_fr, pricing_mode, price, tax_rate,
                               is_online, is_active, duration_ar, duration_fr, official_url, required_documents, fields, sort, icon, abroad)
  select c.id, 'admin', $t$نقل ملكية سيارة (البيع والشراء)$t$, $t$Mutation d’un véhicule$t$, $t$مرافقة البائع والمشتري في التصريح بالبيع والشراء عبر بوابة نقل ملكية العربات وتجهيز ملف البطاقة الرمادية الجديدة. الرسوم الرسمية تُؤدّى على حدة.$t$, $t$Déclaration de vente/achat sur le portail de mutation des véhicules et dossier de la nouvelle carte grise. Frais officiels en plus.$t$, 'fixed', 10000, 20,
         false, true, $t$حسب نارسا$t$, $t$Selon NARSA$t$, $t$https://khadamatnarsa.ma/fr/services/mutation-de-vehicules$t$, $j$[{"name_ar": "أصل البطاقة الرمادية باسم البائع", "name_fr": "Carte grise originale", "required": true}, {"name_ar": "بطاقتا البائع والمشتري", "name_fr": "CNIE vendeur et acheteur", "required": true}, {"name_ar": "محضر الفحص التقني الخاص بنقل الملكية", "name_fr": "PV de contrôle technique (mutation)", "required": true}, {"name_ar": "رفع اليد إن وُجد تعرض أو قرض", "name_fr": "Mainlevée si opposition", "required": false}]$j$::jsonb, $j$[{"key": "plate", "label_ar": "رقم التسجيل", "label_fr": "Immatriculation", "type": "text", "required": true}, {"key": "role", "label_ar": "أنت", "label_fr": "Vous êtes", "type": "select", "required": true, "options": ["المشتري / Acheteur", "البائع / Vendeur"]}]$j$::jsonb, 110, c.icon, false
    from public.service_categories c
   where c.id = 'a10da892-eb48-41c5-b298-c92acbe01e88' and c.deleted_at is null
     and not exists (select 1 from public.services x where x.name_ar = $t$نقل ملكية سيارة (البيع والشراء)$t$ and x.deleted_at is null)
   limit 1
  returning id
)
insert into public.service_guides (service_id, steps, tips_ar, links, video_url, require_ref, templates)
select id, $j$[{"title": "تحقق أولاً من التعرضات على السيارة (خدمة «الاطلاع على التعرضات»)", "required": true, "url": "https://khadamatnarsa.ma/fr/consultation-de-letat-des-oppositions", "url_label": "التعرضات"}, {"title": "التصريح بالبيع والشراء عبر بوابة نقل ملكية العربات (البائع والمشتري)", "required": true, "url": "https://www.mutationvehicule.ma", "url_label": "بوابة نقل الملكية"}, {"title": "تصحيح إمضاء البائع والمشتري معاً على الاستمارة BI", "required": true, "url": "https://khadamatnarsa.ma/sites/default/files/2022-03/FORMULE%20BI.pdf", "url_label": "الاستمارة BI"}, {"title": "ملف المشتري: وثائق السكن (الملحق 6)، أصل البطاقة الرمادية، محضر الفحص التقني، رفع اليد إن وُجد، وصل الرسوم", "required": true, "url": "https://khadamatnarsa.ma/sites/default/files/2022-05/Doc%20Justif%20R%C3%A9sidence%20ANNEXE%206.pdf", "url_label": "الملحق 6"}, {"title": "الإيداع في بريد بنك أو بريد كاش داخل 30 يوماً من تصحيح الإمضاء (وصل صالح 60 يوماً)", "required": true, "url": "https://khadamatnarsa.ma/fr/abb", "url_label": "لائحة الوكالات"}, {"title": "ذكّر البائع: يُخبر الإدارة بالتفويت داخل 15 يوماً من البيع", "required": true, "url": "https://khadamatnarsa.ma/fr/mutation-de-mon-vehicule", "url_label": "تصريح البائع"}]$j$::jsonb, $t$تجاوز الآجال يعرّض لغرامة إدارية. مع وجود تعرض لا يُقبل الملف إلا برفع اليد من الجهة المعنية.$t$, $j$[{"label": "تتبّع الملف (نارسا)", "url": "https://khadamatnarsa.ma/fr/suivi-des-dossiers"}]$j$::jsonb, $t$https://www.youtube.com/watch?v=qMRgYMLHmys$t$, true, '[]'::jsonb from s;

-- Déclaration du conducteur (avis de contravention)
with s as (
  insert into public.services (category_id, kind, name_ar, name_fr, description_ar, description_fr, pricing_mode, price, tax_rate,
                               is_online, is_active, duration_ar, duration_fr, official_url, required_documents, fields, sort, icon, abroad)
  select c.id, 'admin', $t$التصريح بالسائق (إشعار بمخالفة)$t$, $t$Déclaration du conducteur (avis de contravention)$t$, $t$إذا وصلك إشعار بمخالفة وكان شخص آخر يسوق السيارة، نجهّز لك استمارة التصريح بالسائق للإيداع داخل 30 يوماً من التوصل بالإشعار.$t$, $t$Déclaration du conducteur au moment de l’infraction, dans les 30 jours suivant la notification.$t$, 'fixed', 3000, 20,
         false, true, $t$حسب نارسا$t$, $t$Selon NARSA$t$, $t$https://khadamatnarsa.ma/fr/declaration$t$, $j$[{"name_ar": "إشعار المخالفة", "name_fr": "Avis de contravention", "required": true}, {"name_ar": "بطاقة السائق المصرَّح به", "name_fr": "CNIE du conducteur", "required": true}, {"name_ar": "رخصة سياقة السائق", "name_fr": "Permis du conducteur", "required": true}]$j$::jsonb, $j$[{"key": "notice", "label_ar": "رقم الإشعار", "label_fr": "N° de l’avis", "type": "text", "required": false}]$j$::jsonb, 111, c.icon, false
    from public.service_categories c
   where c.id = 'a10da892-eb48-41c5-b298-c92acbe01e88' and c.deleted_at is null
     and not exists (select 1 from public.services x where x.name_ar = $t$التصريح بالسائق (إشعار بمخالفة)$t$ and x.deleted_at is null)
   limit 1
  returning id
)
insert into public.service_guides (service_id, steps, tips_ar, links, video_url, require_ref, templates)
select id, $j$[{"title": "تحقق أن الأجل (30 يوماً من التوصل بالإشعار) لم ينته", "required": true, "url": "https://khadamatnarsa.ma/fr/declaration", "url_label": "نارسا"}, {"title": "املأ استمارة التصريح ليوقعها الطرفان (المالك والسائق)", "required": true, "url": "https://khadamatnarsa.ma/sites/default/files/2026-02/Formulaire_DEC_d%C3%A9claration_Du_Conducteur.pdf", "url_label": "الاستمارة"}, {"title": "أرفق نسخة بطاقة السائق ورخصته", "required": true}, {"title": "الإيداع في بريد بنك أو بريد كاش (المهنيون: بوابة Tasrih Saeq)", "required": true, "url": "https://khadamatnarsa.ma/fr/abb", "url_label": "لائحة الوكالات"}]$j$::jsonb, null, $j$[{"label": "Tasrih Saeq (للمهنيين)", "url": "https://tasrih-saeq.narsa.gov.ma/InfractionPro/"}]$j$::jsonb, null, true, '[]'::jsonb from s;

-- Vérifier les oppositions d’un véhicule
with s as (
  insert into public.services (category_id, kind, name_ar, name_fr, description_ar, description_fr, pricing_mode, price, tax_rate,
                               is_online, is_active, duration_ar, duration_fr, official_url, required_documents, fields, sort, icon, abroad)
  select c.id, 'admin', $t$الاطلاع على التعرضات قبل شراء سيارة$t$, $t$Vérifier les oppositions d’un véhicule$t$, $t$قبل شراء سيارة مستعملة: نتحقق لك من وجود تعرض (قرض، حجز…) على السيارة عبر خدمة نارسا.$t$, $t$Avant d’acheter un véhicule d’occasion : vérification des oppositions (crédit, saisie…) via NARSA.$t$, 'fixed', 2000, 20,
         false, true, $t$فوري$t$, $t$Immédiat$t$, $t$https://khadamatnarsa.ma/fr/consultation-de-letat-des-oppositions$t$, $j$[{"name_ar": "صورة البطاقة الرمادية", "name_fr": "Carte grise", "required": false}]$j$::jsonb, $j$[{"key": "plate", "label_ar": "رقم التسجيل", "label_fr": "Immatriculation", "type": "text", "required": true}]$j$::jsonb, 112, c.icon, false
    from public.service_categories c
   where c.id = 'a10da892-eb48-41c5-b298-c92acbe01e88' and c.deleted_at is null
     and not exists (select 1 from public.services x where x.name_ar = $t$الاطلاع على التعرضات قبل شراء سيارة$t$ and x.deleted_at is null)
   limit 1
  returning id
)
insert into public.service_guides (service_id, steps, tips_ar, links, video_url, require_ref, templates)
select id, $j$[{"title": "افتح خدمة «الاطلاع على وضعية التعرضات»", "required": true, "url": "https://khadamatnarsa.ma/fr/consultation-de-letat-des-oppositions", "url_label": "نارسا"}, {"title": "أدخل رقم التسجيل والمعطيات المطلوبة", "required": true}, {"title": "اطبع النتيجة وسلّمها للزبون، ونبّهه: لا نقل ملكية مع تعرض إلا برفع اليد", "required": true}]$j$::jsonb, null, $j$[]$j$::jsonb, $t$https://www.youtube.com/watch?v=dnjMjip2Jo8$t$, false, '[]'::jsonb from s;

-- Prestations familiales et sociales (Taawidaty)
with s as (
  insert into public.services (category_id, kind, name_ar, name_fr, description_ar, description_fr, pricing_mode, price, tax_rate,
                               is_online, is_active, duration_ar, duration_fr, official_url, required_documents, fields, sort, icon, abroad)
  select c.id, 'admin', $t$التعويضات العائلية والاجتماعية (تعويضاتي CNSS)$t$, $t$Prestations familiales et sociales (Taawidaty)$t$, $t$إيداع طلبات التعويضات العائلية والاجتماعية للأجراء والمتقاعدين عبر منصة «تعويضاتي»: الشهادة المدرسية للأبناء، إضافة مولود، التعويضات اليومية…$t$, $t$Dépôt des demandes de prestations familiales et sociales sur Taawidaty : scolarité des enfants, naissance, indemnités journalières…$t$, 'fixed', 5000, 20,
         false, true, $t$24 - 72 ساعة$t$, $t$24 - 72 h$t$, $t$https://taawidaty.cnss.ma$t$, $j$[{"name_ar": "صورة البطاقة الوطنية (الوجهان)", "name_fr": "CIN (recto-verso)", "required": true}, {"name_ar": "الشهادة المدرسية أو عقد الازدياد حسب الطلب", "name_fr": "Certificat de scolarité ou acte de naissance", "required": false}]$j$::jsonb, $j$[{"key": "type", "label_ar": "نوع الطلب", "label_fr": "Demande", "type": "select", "required": true, "options": ["الشهادة المدرسية للأبناء / Scolarité", "التعويضات العائلية / Allocations familiales", "إضافة مولود / Naissance", "التعويضات اليومية / Indemnités journalières", "أخرى / Autre"]}, {"key": "immat", "label_ar": "رقم التسجيل في CNSS", "label_fr": "N° d’immatriculation", "type": "text", "required": false}]$j$::jsonb, 113, c.icon, false
    from public.service_categories c
   where c.id = '0380241c-068c-441c-8f8f-52f1bfb73e0c' and c.deleted_at is null
     and not exists (select 1 from public.services x where x.name_ar = $t$التعويضات العائلية والاجتماعية (تعويضاتي CNSS)$t$ and x.deleted_at is null)
   limit 1
  returning id
)
insert into public.service_guides (service_id, steps, tips_ar, links, video_url, require_ref, templates)
select id, $j$[{"title": "افتح «تعويضاتي» وسجّل الدخول بالرمز OTP أو بالهوية الرقمية (الرمز يصل لهاتف الزبون)", "required": true, "url": "https://taawidaty.cnss.ma", "url_label": "تعويضاتي"}, {"title": "اختر نوع الطلب", "required": true}, {"title": "حمّل الوثائق (مثلاً الشهادة المدرسية للسنة الحالية لكل ابن مستفيد)", "required": true}, {"title": "أكّد الطلب واكتب رقمه في «مرجع الإنجاز»", "required": true}]$j$::jsonb, $t$الصندوق يطلق كل سنة عملية مراقبة تمدرس الأبناء المستفيدين (بلاغ 20/11/2025 للموسم 2025-2026). عدم إيداع الشهادة المدرسية قد يوقف التعويضات.$t$, $j$[]$j$::jsonb, $t$https://www.youtube.com/watch?v=Vs2RPpb9QYc$t$, true, '[]'::jsonb from s;

-- Rendez-vous CNSS
with s as (
  insert into public.services (category_id, kind, name_ar, name_fr, description_ar, description_fr, pricing_mode, price, tax_rate,
                               is_online, is_active, duration_ar, duration_fr, official_url, required_documents, fields, sort, icon, abroad)
  select c.id, 'admin', $t$حجز موعد في CNSS$t$, $t$Rendez-vous CNSS$t$, $t$حجز موعد في وكالة الصندوق الوطني للضمان الاجتماعي لتفادي الانتظار.$t$, $t$Prise de rendez-vous en agence CNSS pour éviter l’attente.$t$, 'fixed', 2000, 20,
         false, true, $t$نفس اليوم$t$, $t$Le jour même$t$, $t$https://cnss.rdv.gov.ma$t$, $j$[]$j$::jsonb, $j$[{"key": "reason", "label_ar": "سبب الموعد", "label_fr": "Motif", "type": "text", "required": true}]$j$::jsonb, 114, c.icon, false
    from public.service_categories c
   where c.id = '0380241c-068c-441c-8f8f-52f1bfb73e0c' and c.deleted_at is null
     and not exists (select 1 from public.services x where x.name_ar = $t$حجز موعد في CNSS$t$ and x.deleted_at is null)
   limit 1
  returning id
)
insert into public.service_guides (service_id, steps, tips_ar, links, video_url, require_ref, templates)
select id, $j$[{"title": "افتح منصة مواعيد CNSS", "required": true, "url": "https://cnss.rdv.gov.ma", "url_label": "المواعيد"}, {"title": "اختر الوكالة (تطوان) ونوع الخدمة", "required": true}, {"title": "اختر التاريخ والساعة وأدخل معلومات الزبون", "required": true}, {"title": "أرسل للزبون تأكيد الموعد", "required": true}]$j$::jsonb, null, $j$[]$j$::jsonb, $t$https://www.youtube.com/watch?v=2OKQYGv3hA0$t$, false, '[]'::jsonb from s;

-- Inscription à la formation professionnelle (OFPPT)
with s as (
  insert into public.services (category_id, kind, name_ar, name_fr, description_ar, description_fr, pricing_mode, price, tax_rate,
                               is_online, is_active, duration_ar, duration_fr, official_url, required_documents, fields, sort, icon, abroad)
  select c.id, 'admin', $t$التسجيل في التكوين المهني (OFPPT)$t$, $t$Inscription à la formation professionnelle (OFPPT)$t$, $t$الترشح للتكوين المهني (تقني متخصص، تقني، تأهيل، تخصص) عبر منصة MyWay. التسجيل يُفتح عادة من ماي إلى يوليوز.$t$, $t$Candidature OFPPT (TS, T, Q, S) sur MyWay, généralement de mai à juillet.$t$, 'fixed', 3000, 20,
         false, true, $t$نفس اليوم$t$, $t$Le jour même$t$, $t$https://www.myway.ac.ma$t$, $j$[{"name_ar": "صورة البطاقة الوطنية (الوجهان)", "name_fr": "CIN (recto-verso)", "required": true}, {"name_ar": "آخر شهادة مدرسية أو بيان النقط", "name_fr": "Dernier diplôme ou relevé de notes", "required": true}]$j$::jsonb, $j$[{"key": "level", "label_ar": "المستوى", "label_fr": "Niveau", "type": "select", "required": true, "options": ["تقني متخصص / TS", "تقني / T", "تأهيل / Qualification", "تخصص / Spécialisation"]}, {"key": "massar", "label_ar": "رمز مسار", "label_fr": "Code Massar", "type": "text", "required": false}]$j$::jsonb, 115, c.icon, false
    from public.service_categories c
   where c.id = '26f83848-da41-4225-8509-11a3d66d50c3' and c.deleted_at is null
     and not exists (select 1 from public.services x where x.name_ar = $t$التسجيل في التكوين المهني (OFPPT)$t$ and x.deleted_at is null)
   limit 1
  returning id
)
insert into public.service_guides (service_id, steps, tips_ar, links, video_url, require_ref, templates)
select id, $j$[{"title": "افتح MyWay وأنشئ حساب المترشح", "required": true, "url": "https://www.myway.ac.ma", "url_label": "MyWay"}, {"title": "أدخل المعلومات الدراسية (رمز مسار والنقط)", "required": true}, {"title": "اختر الشعب والمؤسسات بالترتيب مع الزبون", "required": true}, {"title": "أكّد الترشيح واطبع الوصل وسلّمه للزبون", "required": true}]$j$::jsonb, $t$رسوم التسجيل عند القبول حسب ما نُشر لموسم 2026-2027: تقني متخصص 950، تقني 800، تأهيل 550، تخصص 400 درهم. مستوى التقني المتخصص يتطلب الباكالوريا.$t$, $j$[]$j$::jsonb, $t$https://www.youtube.com/watch?v=UjYTohfdLrA$t$, true, '[]'::jsonb from s;

-- Concours de recrutement des enseignants
with s as (
  insert into public.services (category_id, kind, name_ar, name_fr, description_ar, description_fr, pricing_mode, price, tax_rate,
                               is_online, is_active, duration_ar, duration_fr, official_url, required_documents, fields, sort, icon, abroad)
  select c.id, 'admin', $t$مباراة التعليم (توظيف الأساتذة)$t$, $t$Concours de recrutement des enseignants$t$, $t$التسجيل في مباراة توظيف الأساتذة (الابتدائي والإعدادي والثانوي) عبر بوابة «ولوج» لوزارة التربية الوطنية. تُفتح عادة أواخر أكتوبر ونونبر.$t$, $t$Inscription au concours des enseignants sur la plateforme Wolouj (MEN), généralement fin octobre - novembre.$t$, 'fixed', 5000, 20,
         false, true, $t$نفس اليوم$t$, $t$Le jour même$t$, $t$https://wolouj.men.gov.ma$t$, $j$[{"name_ar": "صورة البطاقة الوطنية (الوجهان)", "name_fr": "CIN (recto-verso)", "required": true}, {"name_ar": "الشهادة الجامعية وبيان النقط", "name_fr": "Diplôme et relevés de notes", "required": true}, {"name_ar": "شهادة الباكالوريا", "name_fr": "Baccalauréat", "required": true}]$j$::jsonb, $j$[{"key": "cycle", "label_ar": "السلك", "label_fr": "Cycle", "type": "select", "required": true, "options": ["الابتدائي / Primaire", "الإعدادي / Collège", "الثانوي التأهيلي / Lycée"]}, {"key": "specialty", "label_ar": "التخصص", "label_fr": "Spécialité", "type": "text", "required": false}]$j$::jsonb, 116, c.icon, false
    from public.service_categories c
   where c.id = '78f58ae1-58ba-4f73-b74e-a168778d4b0c' and c.deleted_at is null
     and not exists (select 1 from public.services x where x.name_ar = $t$مباراة التعليم (توظيف الأساتذة)$t$ and x.deleted_at is null)
   limit 1
  returning id
)
insert into public.service_guides (service_id, steps, tips_ar, links, video_url, require_ref, templates)
select id, $j$[{"title": "افتح «ولوج» وأنشئ حساباً ببريد الزبون", "required": true, "url": "https://wolouj.men.gov.ma", "url_label": "ولوج"}, {"title": "أدخل المعلومات الشخصية والشهادات", "required": true}, {"title": "حمّل المرفقات بالصيغة والحجم المطلوبين (أكثر سبب للرفض)", "required": true}, {"title": "اختر الأكاديمية والتخصص ثم أكّد", "required": true}, {"title": "اطبع وصل الترشيح وسلّمه للزبون", "required": true}]$j$::jsonb, $t$دورة نونبر 2025: التسجيل من 30 أكتوبر إلى 13 نونبر 2025 (19 ألف منصب). تابع الإعلان الرسمي لدورة 2026 على men.gov.ma.$t$, $j$[]$j$::jsonb, $t$https://www.youtube.com/watch?v=ftCmNQtOzpE$t$, true, '[]'::jsonb from s;

-- Concours DGSN et Forces armées
with s as (
  insert into public.services (category_id, kind, name_ar, name_fr, description_ar, description_fr, pricing_mode, price, tax_rate,
                               is_online, is_active, duration_ar, duration_fr, official_url, required_documents, fields, sort, icon, abroad)
  select c.id, 'admin', $t$مباريات الأمن الوطني والقوات المسلحة$t$, $t$Concours DGSN et Forces armées$t$, $t$التسجيل في مباريات الأمن الوطني والقوات المسلحة الملكية والقوات المساعدة حسب الإعلانات المفتوحة.$t$, $t$Inscription aux concours de la DGSN, des FAR et des Forces auxiliaires selon les annonces ouvertes.$t$, 'fixed', 3000, 20,
         false, true, $t$نفس اليوم$t$, $t$Le jour même$t$, $t$https://recrutement.far.ma$t$, $j$[{"name_ar": "صورة البطاقة الوطنية (الوجهان)", "name_fr": "CIN (recto-verso)", "required": true}, {"name_ar": "الشهادات الدراسية", "name_fr": "Diplômes", "required": true}, {"name_ar": "صورة شمسية", "name_fr": "Photo", "required": true}]$j$::jsonb, $j$[{"key": "concours", "label_ar": "المباراة", "label_fr": "Concours", "type": "text", "required": true}]$j$::jsonb, 117, c.icon, false
    from public.service_categories c
   where c.id = '78f58ae1-58ba-4f73-b74e-a168778d4b0c' and c.deleted_at is null
     and not exists (select 1 from public.services x where x.name_ar = $t$مباريات الأمن الوطني والقوات المسلحة$t$ and x.deleted_at is null)
   limit 1
  returning id
)
insert into public.service_guides (service_id, steps, tips_ar, links, video_url, require_ref, templates)
select id, $j$[{"title": "تحقق من المباراة المفتوحة وآخر أجل والشروط (السن، الطول، الشهادة) في الإعلان الرسمي", "required": true}, {"title": "القوات المسلحة الملكية: recrutement.far.ma", "required": true, "url": "https://recrutement.far.ma", "url_label": "FAR"}, {"title": "الأمن الوطني: ePolice ← «مباريات التوظيف»", "required": true, "url": "https://www.epolice.ma", "url_label": "ePolice"}, {"title": "أنشئ الحساب واملأ المعلومات وحمّل الوثائق", "required": true}, {"title": "أكّد الترشيح واطبع الوصل، ونبّه الزبون لتتبّع الاستدعاء", "required": true}]$j$::jsonb, null, $j$[]$j$::jsonb, $t$https://www.youtube.com/watch?v=zHJ8h155YM0$t$, true, '[]'::jsonb from s;

-- Équivalence des diplômes
with s as (
  insert into public.services (category_id, kind, name_ar, name_fr, description_ar, description_fr, pricing_mode, price, tax_rate,
                               is_online, is_active, duration_ar, duration_fr, official_url, required_documents, fields, sort, icon, abroad)
  select c.id, 'admin', $t$معادلة الشهادات$t$, $t$Équivalence des diplômes$t$, $t$طلب معادلة شهادة جامعية أجنبية عبر منصة e-Équivalence لوزارة التعليم العالي.$t$, $t$Demande d’équivalence d’un diplôme étranger sur la plateforme e-Équivalence.$t$, 'fixed', 10000, 20,
         false, true, $t$حسب اللجنة القطاعية$t$, $t$Selon la commission$t$, $t$https://equivalence.enssup.gov.ma$t$, $j$[{"name_ar": "الشهادة المطلوب معادلتها", "name_fr": "Diplôme", "required": true}, {"name_ar": "بيان النقط", "name_fr": "Relevés de notes", "required": true}, {"name_ar": "شهادة الباكالوريا", "name_fr": "Baccalauréat", "required": true}, {"name_ar": "جواز السفر أو البطاقة الوطنية", "name_fr": "Passeport ou CNIE", "required": true}]$j$::jsonb, $j$[{"key": "diploma", "label_ar": "الشهادة وبلد الإصدار", "label_fr": "Diplôme et pays", "type": "text", "required": true}]$j$::jsonb, 118, c.icon, true
    from public.service_categories c
   where c.id = '26f83848-da41-4225-8509-11a3d66d50c3' and c.deleted_at is null
     and not exists (select 1 from public.services x where x.name_ar = $t$معادلة الشهادات$t$ and x.deleted_at is null)
   limit 1
  returning id
)
insert into public.service_guides (service_id, steps, tips_ar, links, video_url, require_ref, templates)
select id, $j$[{"title": "أنشئ حساباً على e-Équivalence ببريد الزبون", "required": true, "url": "https://equivalence.enssup.gov.ma", "url_label": "e-Équivalence"}, {"title": "أدخل معلومات الشهادة والتكوين", "required": true}, {"title": "حمّل الوثائق المطلوبة واضحة", "required": true}, {"title": "أكّد الطلب واكتب رقمه في «مرجع الإنجاز»، وتابع نتائج اللجان القطاعية", "required": true}]$j$::jsonb, $t$الدعم الهاتفي: 0537219261 (أوقات العمل). نتائج اللجان القطاعية والقرارات العامة للمعادلة منشورة في الصفحة الرئيسية للمنصة.$t$, $j$[]$j$::jsonb, $t$https://www.youtube.com/watch?v=o7ONRzqDrmk$t$, true, '[]'::jsonb from s;

-- Demande de logement universitaire
with s as (
  insert into public.services (category_id, kind, name_ar, name_fr, description_ar, description_fr, pricing_mode, price, tax_rate,
                               is_online, is_active, duration_ar, duration_fr, official_url, required_documents, fields, sort, icon, abroad)
  select c.id, 'admin', $t$طلب السكن الجامعي (الحي الجامعي)$t$, $t$Demande de logement universitaire$t$, $t$طلب الاستفادة من الحي الجامعي عبر المنصة التي يفتحها المكتب الوطني للأعمال الجامعية كل صيف.$t$, $t$Candidature à la cité universitaire sur la plateforme de l’ONOUSC (ouverte chaque été).$t$, 'fixed', 3000, 20,
         false, true, $t$حسب ONOUSC$t$, $t$Selon l’ONOUSC$t$, $t$https://www.onousc.ma/logement$t$, $j$[{"name_ar": "صورة البطاقة الوطنية (الوجهان)", "name_fr": "CIN (recto-verso)", "required": true}, {"name_ar": "شهادة الباكالوريا أو التسجيل", "name_fr": "Bac ou attestation d’inscription", "required": true}]$j$::jsonb, $j$[{"key": "massar", "label_ar": "رمز مسار", "label_fr": "Code Massar", "type": "text", "required": false}, {"key": "city", "label_ar": "مدينة الدراسة", "label_fr": "Ville d’études", "type": "text", "required": false}]$j$::jsonb, 119, c.icon, false
    from public.service_categories c
   where c.id = '26f83848-da41-4225-8509-11a3d66d50c3' and c.deleted_at is null
     and not exists (select 1 from public.services x where x.name_ar = $t$طلب السكن الجامعي (الحي الجامعي)$t$ and x.deleted_at is null)
   limit 1
  returning id
)
insert into public.service_guides (service_id, steps, tips_ar, links, video_url, require_ref, templates)
select id, $j$[{"title": "تحقق من فتح المنصة في إعلان ONOUSC (غشت عادة)", "required": true, "url": "https://www.onousc.ma/logement", "url_label": "ONOUSC"}, {"title": "أدخل معلومات الطالب وأسرته", "required": true}, {"title": "اختر الحي الجامعي", "required": true}, {"title": "أكّد واطبع الوصل وسلّمه للزبون", "required": true}]$j$::jsonb, $t$منصة الترشح لموسم 2026-2027 أُطلقت يوم 18 غشت 2026.$t$, $j$[]$j$::jsonb, $t$https://www.youtube.com/watch?v=WZkU59CBIsc$t$, true, '[]'::jsonb from s;

-- Inscription aux classes préparatoires (CPGE)
with s as (
  insert into public.services (category_id, kind, name_ar, name_fr, description_ar, description_fr, pricing_mode, price, tax_rate,
                               is_online, is_active, duration_ar, duration_fr, official_url, required_documents, fields, sort, icon, abroad)
  select c.id, 'admin', $t$التسجيل في الأقسام التحضيرية (CPGE)$t$, $t$Inscription aux classes préparatoires (CPGE)$t$, $t$الترشح للأقسام التحضيرية للمدارس العليا عبر منصة CPGE (يونيو عادة).$t$, $t$Candidature aux CPGE sur la plateforme nationale (généralement en juin).$t$, 'fixed', 3000, 20,
         false, true, $t$نفس اليوم$t$, $t$Le jour même$t$, $t$https://www.cpge.ac.ma$t$, $j$[{"name_ar": "بيان نقط الباكالوريا", "name_fr": "Relevé de notes du bac", "required": true}, {"name_ar": "صورة البطاقة الوطنية (الوجهان)", "name_fr": "CIN (recto-verso)", "required": true}]$j$::jsonb, $j$[{"key": "massar", "label_ar": "رمز مسار", "label_fr": "Code Massar", "type": "text", "required": false}, {"key": "track", "label_ar": "الشعبة المرغوبة", "label_fr": "Filière souhaitée", "type": "text", "required": false}]$j$::jsonb, 120, c.icon, false
    from public.service_categories c
   where c.id = '26f83848-da41-4225-8509-11a3d66d50c3' and c.deleted_at is null
     and not exists (select 1 from public.services x where x.name_ar = $t$التسجيل في الأقسام التحضيرية (CPGE)$t$ and x.deleted_at is null)
   limit 1
  returning id
)
insert into public.service_guides (service_id, steps, tips_ar, links, video_url, require_ref, templates)
select id, $j$[{"title": "افتح منصة CPGE وأنشئ الحساب", "required": true, "url": "https://www.cpge.ac.ma", "url_label": "CPGE"}, {"title": "أدخل النقط والمعلومات", "required": true}, {"title": "رتّب الاختيارات (الشعب والمراكز) مع الزبون", "required": true}, {"title": "أكّد واطبع الوصل، وتابع لوائح الانتقاء والانتظار", "required": true}]$j$::jsonb, $t$الترشيح يُفتح عادة في يونيو بعد نتائج الباكالوريا، والنتائج تُتابَع من نفس البوابة.$t$, $j$[]$j$::jsonb, $t$https://www.youtube.com/watch?v=b2Zcbr0TeKI$t$, true, '[]'::jsonb from s;

-- Inscription au tirage au sort du Hajj
with s as (
  insert into public.services (category_id, kind, name_ar, name_fr, description_ar, description_fr, pricing_mode, price, tax_rate,
                               is_online, is_active, duration_ar, duration_fr, official_url, required_documents, fields, sort, icon, abroad)
  select c.id, 'admin', $t$التسجيل في قرعة الحج$t$, $t$Inscription au tirage au sort du Hajj$t$, $t$التسجيل الإلكتروني في قرعة الحج عبر بوابة وزارة الأوقاف والشؤون الإسلامية (يُفتح عادة في دجنبر).$t$, $t$Inscription en ligne au tirage au sort du Hajj (ministère des Habous), généralement en décembre.$t$, 'fixed', 3000, 20,
         false, true, $t$نفس اليوم$t$, $t$Le jour même$t$, $t$https://www.habous.gov.ma$t$, $j$[{"name_ar": "صورة البطاقة الوطنية (الوجهان)", "name_fr": "CIN (recto-verso)", "required": true}, {"name_ar": "بطاقة المرافق (لكبار السن)", "name_fr": "CNIE de l’accompagnateur", "required": false}]$j$::jsonb, $j$[{"key": "formula", "label_ar": "الصيغة", "label_fr": "Formule", "type": "select", "required": true, "options": ["تحت تأطير الوزارة / Encadrement officiel", "عبر وكالة أسفار / Agence de voyages"]}, {"key": "companion", "label_ar": "اسم المرافق (إن وُجد)", "label_fr": "Accompagnateur", "type": "text", "required": false}]$j$::jsonb, 121, c.icon, false
    from public.service_categories c
   where c.kind = 'admin' and c.name_ar = 'شؤون المواطن' and c.deleted_at is null
     and not exists (select 1 from public.services x where x.name_ar = $t$التسجيل في قرعة الحج$t$ and x.deleted_at is null)
   limit 1
  returning id
)
insert into public.service_guides (service_id, steps, tips_ar, links, video_url, require_ref, templates)
select id, $j$[{"title": "تحقق من فتح التسجيل الإلكتروني في بلاغ الوزارة", "required": true, "url": "https://www.habous.gov.ma", "url_label": "وزارة الأوقاف"}, {"title": "اختر اللائحة: الحج تحت تأطير الوزارة أو عبر وكالات الأسفار", "required": true}, {"title": "أدخل معطيات البطاقة الوطنية ورقم الهاتف", "required": true}, {"title": "للمسنين: سجّل المرافق (لا يتجاوز 50 سنة)", "required": false}, {"title": "أكّد واطبع الوصل، وأخبر الزبون بموعد القرعة", "required": true}]$j$::jsonb, $t$موسم 1448هـ/2027م: التسجيل من 8 إلى 19 دجنبر 2025، والقرعة من 2 إلى 13 مارس 2026. الشروط: 18 سنة فما فوق، وعدم أداء الحج خلال العشر سنوات الأخيرة. بوابة الوزارة كانت في الصيانة يوم 24/10/2026: تأكد من رابط التسجيل في بلاغ الوزارة.$t$, $j$[]$j$::jsonb, $t$https://www.youtube.com/watch?v=rthiSlj09tM$t$, true, '[]'::jsonb from s;

-- Inscription sur les listes électorales
with s as (
  insert into public.services (category_id, kind, name_ar, name_fr, description_ar, description_fr, pricing_mode, price, tax_rate,
                               is_online, is_active, duration_ar, duration_fr, official_url, required_documents, fields, sort, icon, abroad)
  select c.id, 'admin', $t$التسجيل في اللوائح الانتخابية$t$, $t$Inscription sur les listes électorales$t$, $t$طلب القيد أو تغيير مكان القيد في اللوائح الانتخابية العامة عبر الموقع الرسمي، خلال فترات المراجعة.$t$, $t$Demande d’inscription ou de transfert sur les listes électorales générales, pendant les périodes de révision.$t$, 'fixed', 2000, 20,
         false, true, $t$نفس اليوم$t$, $t$Le jour même$t$, $t$https://www.listeselectorales.ma$t$, $j$[{"name_ar": "صورة البطاقة الوطنية (الوجهان)", "name_fr": "CIN (recto-verso)", "required": true}]$j$::jsonb, $j$[]$j$::jsonb, 122, c.icon, false
    from public.service_categories c
   where c.kind = 'admin' and c.name_ar = 'شؤون المواطن' and c.deleted_at is null
     and not exists (select 1 from public.services x where x.name_ar = $t$التسجيل في اللوائح الانتخابية$t$ and x.deleted_at is null)
   limit 1
  returning id
)
insert into public.service_guides (service_id, steps, tips_ar, links, video_url, require_ref, templates)
select id, $j$[{"title": "افتح بوابة اللوائح الانتخابية العامة ← «خدمات رقمية»", "required": true, "url": "https://www.listeselectorales.ma", "url_label": "اللوائح الانتخابية"}, {"title": "اختر طلب القيد أو طلب نقل القيد (لمن غيّر سكناه)", "required": true}, {"title": "أدخل رقم البطاقة والمعلومات المطلوبة", "required": true}, {"title": "أكّد واطبع الوصل", "required": true}]$j$::jsonb, $t$الشروط: 18 سنة (أو يبلغها قبل 31 مارس الموالي) والإقامة الفعلية بالجماعة 3 أشهر على الأقل. التحقق من التسجيل ومكتب التصويت: رسالة SMS برقم البطاقة إلى 2727. المراجعة الاستثنائية لسنة 2026 كانت من 15 ماي إلى 13 يونيو 2026.$t$, $j$[]$j$::jsonb, $t$https://www.youtube.com/watch?v=zHyMXUYfbNY$t$, true, '[]'::jsonb from s;

-- Recensement du service militaire
with s as (
  insert into public.services (category_id, kind, name_ar, name_fr, description_ar, description_fr, pricing_mode, price, tax_rate,
                               is_online, is_active, duration_ar, duration_fr, official_url, required_documents, fields, sort, icon, abroad)
  select c.id, 'admin', $t$إحصاء الخدمة العسكرية$t$, $t$Recensement du service militaire$t$, $t$ملء استمارة الإحصاء الخاص بالخدمة العسكرية عبر tajnid.ma خلال فترة الإحصاء (مارس وأبريل عادة).$t$, $t$Formulaire de recensement du service militaire sur tajnid.ma (généralement mars-avril).$t$, 'fixed', 2000, 20,
         false, true, $t$نفس اليوم$t$, $t$Le jour même$t$, $t$https://www.tajnid.ma$t$, $j$[{"name_ar": "صورة البطاقة الوطنية (الوجهان)", "name_fr": "CIN (recto-verso)", "required": true}]$j$::jsonb, $j$[{"key": "situation", "label_ar": "الوضعية (دراسة، عمل…)", "label_fr": "Situation", "type": "text", "required": false}]$j$::jsonb, 123, c.icon, false
    from public.service_categories c
   where c.kind = 'admin' and c.name_ar = 'شؤون المواطن' and c.deleted_at is null
     and not exists (select 1 from public.services x where x.name_ar = $t$إحصاء الخدمة العسكرية$t$ and x.deleted_at is null)
   limit 1
  returning id
)
insert into public.service_guides (service_id, steps, tips_ar, links, video_url, require_ref, templates)
select id, $j$[{"title": "تحقق من فتح فترة الإحصاء", "required": true, "url": "https://www.tajnid.ma", "url_label": "tajnid.ma"}, {"title": "أدخل معطيات البطاقة والمعلومات الشخصية والدراسية والمهنية", "required": true}, {"title": "أكّد واطبع الإشعار أو الوصل وسلّمه للزبون", "required": true}]$j$::jsonb, $t$إحصاء 2026: من 2 مارس إلى 30 أبريل 2026، للشباب بين 19 و25 سنة. طلب الإعفاء يُقدَّم بمبررات (دراسة، إعالة أسرة…).$t$, $j$[]$j$::jsonb, $t$https://www.youtube.com/watch?v=WpVN5dWAHhI$t$, true, '[]'::jsonb from s;

update public.services set price = 150000 where id = '71e600c4-c389-4f42-8049-0aef0a440fd2';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=ecppmv_rMz8$t$ where service_id = '71e600c4-c389-4f42-8049-0aef0a440fd2' and coalesce(video_url, '') = '';
update public.services set description_ar = case when coalesce(description_ar, '') = '' then $t$الثمن أتعابنا، والرسوم الرسمية (السجل التجاري، النشر في الجرائد…) غير داخلة.$t$ else rtrim(description_ar, ' .') || '. ' || $t$الثمن أتعابنا، والرسوم الرسمية (السجل التجاري، النشر في الجرائد…) غير داخلة.$t$ end where id = '71e600c4-c389-4f42-8049-0aef0a440fd2' and position($t$الثمن أتعابنا$t$ in coalesce(description_ar, '')) = 0;
update public.services set price = 5000 where id = '92c12b55-3058-4eac-adc9-7acd01b9fee0';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=p7y1ByzkAQw$t$ where service_id = '92c12b55-3058-4eac-adc9-7acd01b9fee0' and coalesce(video_url, '') = '';
update public.services set price = 5000 where id = '9eb1d367-70ae-49b5-a5dc-d67077a9f3ea';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=Aw_BdgcrpR8$t$ where service_id = '9eb1d367-70ae-49b5-a5dc-d67077a9f3ea' and coalesce(video_url, '') = '';
update public.services set price = 3000 where id = '9d57006d-8e8f-4206-beac-cdd7717b669b';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=jAzcqND0mho$t$ where service_id = '9d57006d-8e8f-4206-beac-cdd7717b669b' and coalesce(video_url, '') = '';
update public.services set price = 3000 where id = 'd981c294-101f-4665-86cd-7a99c8d9f0d5';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=PNkB5juEaW4$t$ where service_id = 'd981c294-101f-4665-86cd-7a99c8d9f0d5' and coalesce(video_url, '') = '';
update public.services set price = 10000 where id = '4b2b1920-b0a9-4474-9b05-cae19dbba742';
update public.services set price = 3000 where id = '090d816c-4da8-4fc5-9ff6-6be67099a385';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=h3QTmg_4tiU$t$ where service_id = '090d816c-4da8-4fc5-9ff6-6be67099a385' and coalesce(video_url, '') = '';
update public.services set price = 15000 where id = '99db0228-24f7-4e2d-9548-8a51060773b1';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=IajPiDiL1fE$t$ where service_id = '99db0228-24f7-4e2d-9548-8a51060773b1' and coalesce(video_url, '') = '';
update public.services set price = 10000 where id = '9c65f138-ee9d-4a11-b42b-8640201205b7';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=VNtCJ-j2_ks$t$ where service_id = '9c65f138-ee9d-4a11-b42b-8640201205b7' and coalesce(video_url, '') = '';
update public.services set description_ar = case when coalesce(description_ar, '') = '' then $t$الثمن أتعابنا، ومبلغ الاشتراكات يُؤدّى على حدة.$t$ else rtrim(description_ar, ' .') || '. ' || $t$الثمن أتعابنا، ومبلغ الاشتراكات يُؤدّى على حدة.$t$ end where id = '9c65f138-ee9d-4a11-b42b-8640201205b7' and position($t$الثمن أتعابنا$t$ in coalesce(description_ar, '')) = 0;
update public.services set price = 15000 where id = 'df897d0d-c1ba-4e84-87bd-74eedd72d75e';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=8llWkU_AsDo$t$ where service_id = 'df897d0d-c1ba-4e84-87bd-74eedd72d75e' and coalesce(video_url, '') = '';
update public.services set description_ar = case when coalesce(description_ar, '') = '' then $t$الثمن أتعابنا، ومبلغ الضريبة إن وُجد يُؤدّى على حدة.$t$ else rtrim(description_ar, ' .') || '. ' || $t$الثمن أتعابنا، ومبلغ الضريبة إن وُجد يُؤدّى على حدة.$t$ end where id = 'df897d0d-c1ba-4e84-87bd-74eedd72d75e' and position($t$الثمن أتعابنا$t$ in coalesce(description_ar, '')) = 0;
update public.services set price = 5000 where id = '6350c308-6b0a-4e7c-95b9-25a323f462c2';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=p6nr75fj9ro$t$ where service_id = '6350c308-6b0a-4e7c-95b9-25a323f462c2' and coalesce(video_url, '') = '';
update public.services set description_ar = case when coalesce(description_ar, '') = '' then $t$الثمن أتعابنا، ومبلغ الضريبة يُؤدّى على حدة.$t$ else rtrim(description_ar, ' .') || '. ' || $t$الثمن أتعابنا، ومبلغ الضريبة يُؤدّى على حدة.$t$ end where id = '6350c308-6b0a-4e7c-95b9-25a323f462c2' and position($t$الثمن أتعابنا$t$ in coalesce(description_ar, '')) = 0;
update public.services set price = 5000 where id = '74973a26-2545-4661-9870-0cf506a502ec';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=xx4Xs4AyTaA$t$ where service_id = '74973a26-2545-4661-9870-0cf506a502ec' and coalesce(video_url, '') = '';
update public.services set description_ar = case when coalesce(description_ar, '') = '' then $t$الثمن أتعابنا، ورسوم المحافظة العقارية تُؤدّى على حدة.$t$ else rtrim(description_ar, ' .') || '. ' || $t$الثمن أتعابنا، ورسوم المحافظة العقارية تُؤدّى على حدة.$t$ end where id = '74973a26-2545-4661-9870-0cf506a502ec' and position($t$الثمن أتعابنا$t$ in coalesce(description_ar, '')) = 0;
update public.services set price = 5000 where id = 'c86b231d-1814-48bb-9ba0-fa7d41534259';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=QvzlKJ3DbMk$t$ where service_id = 'c86b231d-1814-48bb-9ba0-fa7d41534259' and coalesce(video_url, '') = '';
update public.services set price = 3000 where id = 'b4daba7e-6de5-48f7-9c0a-a57cfe691d47';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=oltuiaRVQ2Y$t$ where service_id = 'b4daba7e-6de5-48f7-9c0a-a57cfe691d47' and coalesce(video_url, '') = '';
update public.services set price = 20000 where id = '608a798e-294a-4e81-83be-1e12cd5ed829';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=NiSkCHMUaWA$t$ where service_id = '608a798e-294a-4e81-83be-1e12cd5ed829' and coalesce(video_url, '') = '';
update public.services set description_ar = case when coalesce(description_ar, '') = '' then $t$الثمن أتعابنا، والرسوم الجماعية تُؤدّى على حدة.$t$ else rtrim(description_ar, ' .') || '. ' || $t$الثمن أتعابنا، والرسوم الجماعية تُؤدّى على حدة.$t$ end where id = '608a798e-294a-4e81-83be-1e12cd5ed829' and position($t$الثمن أتعابنا$t$ in coalesce(description_ar, '')) = 0;
update public.services set price = 3000 where id = 'c58d279b-b109-4aee-88f8-86a49ddbe87f';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=lodz_qabfwY$t$ where service_id = 'c58d279b-b109-4aee-88f8-86a49ddbe87f' and coalesce(video_url, '') = '';
update public.services set price = 3000 where id = 'd9480487-d741-4d62-905f-9e5dd410a978';
update public.services set description_ar = case when coalesce(description_ar, '') = '' then $t$الثمن أتعابنا، والاستلام بالبريد الإلكتروني مجاني، والبريد المضمون 25 درهماً (40 خارج المغرب) يُؤدّى على حدة.$t$ else rtrim(description_ar, ' .') || '. ' || $t$الثمن أتعابنا، والاستلام بالبريد الإلكتروني مجاني، والبريد المضمون 25 درهماً (40 خارج المغرب) يُؤدّى على حدة.$t$ end where id = 'd9480487-d741-4d62-905f-9e5dd410a978' and position($t$الثمن أتعابنا$t$ in coalesce(description_ar, '')) = 0;
update public.services set price = 5000 where id = '41b9efa6-50aa-4e36-9c75-039fd084a947';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=hwVvlGTxNHM$t$ where service_id = '41b9efa6-50aa-4e36-9c75-039fd084a947' and coalesce(video_url, '') = '';
update public.services set price = 10000 where id = 'b99e0ce0-1077-4be0-8884-8bcc97aac873';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=JDeHMv4-Xj0$t$ where service_id = 'b99e0ce0-1077-4be0-8884-8bcc97aac873' and coalesce(video_url, '') = '';
update public.services set description_ar = case when coalesce(description_ar, '') = '' then $t$الثمن أتعابنا، ورسوم الشهادة السلبية الرسمية تُؤدّى على حدة.$t$ else rtrim(description_ar, ' .') || '. ' || $t$الثمن أتعابنا، ورسوم الشهادة السلبية الرسمية تُؤدّى على حدة.$t$ end where id = 'b99e0ce0-1077-4be0-8884-8bcc97aac873' and position($t$الثمن أتعابنا$t$ in coalesce(description_ar, '')) = 0;
update public.services set price = 2000 where id = '29fa072f-a294-4b00-a1c3-d12109fa6274';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=iy40UCshST4$t$ where service_id = '29fa072f-a294-4b00-a1c3-d12109fa6274' and coalesce(video_url, '') = '';
update public.services set description_ar = case when coalesce(description_ar, '') = '' then $t$الثمن أتعابنا، وقيمة الضريبة تُؤدّى على حدة.$t$ else rtrim(description_ar, ' .') || '. ' || $t$الثمن أتعابنا، وقيمة الضريبة تُؤدّى على حدة.$t$ end where id = '29fa072f-a294-4b00-a1c3-d12109fa6274' and position($t$الثمن أتعابنا$t$ in coalesce(description_ar, '')) = 0;
update public.services set price = 500 where id = 'b0f62d64-02f8-4c51-9fa8-b21e9f6e25be';
update public.services set price = 3000 where id = '905d5ff5-0fc9-431c-8ad6-835016bf5b41';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=ZYlDu8E4e6o$t$ where service_id = '905d5ff5-0fc9-431c-8ad6-835016bf5b41' and coalesce(video_url, '') = '';
update public.services set price = 2000 where id = '065e4d33-c918-4d34-b7f1-b9c4fab00ddb';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=je4f6Ri561E$t$ where service_id = '065e4d33-c918-4d34-b7f1-b9c4fab00ddb' and coalesce(video_url, '') = '';
update public.services set price = 15000 where id = '6922b801-65c3-405e-9a80-2ffe9c658212';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=2UTBdD5QHxQ$t$ where service_id = '6922b801-65c3-405e-9a80-2ffe9c658212' and coalesce(video_url, '') = '';
update public.services set price = 30000 where id = 'b0abc376-fb71-4bfe-970d-6dd13a09ae92';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=zK8cgBBGHRg$t$ where service_id = 'b0abc376-fb71-4bfe-970d-6dd13a09ae92' and coalesce(video_url, '') = '';
update public.services set description_ar = case when coalesce(description_ar, '') = '' then $t$الثمن أتعابنا، والرسوم الجماعية وأتعاب المهندس غير داخلة.$t$ else rtrim(description_ar, ' .') || '. ' || $t$الثمن أتعابنا، والرسوم الجماعية وأتعاب المهندس غير داخلة.$t$ end where id = 'b0abc376-fb71-4bfe-970d-6dd13a09ae92' and position($t$الثمن أتعابنا$t$ in coalesce(description_ar, '')) = 0;
update public.services set price = 5000 where id = '39868b97-dcc6-49d0-ad38-e19a9433a4a4';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=LfzOI-mH0Ho$t$ where service_id = '39868b97-dcc6-49d0-ad38-e19a9433a4a4' and coalesce(video_url, '') = '';
update public.services set price = 5000 where id = '14be1817-b35c-4b58-8829-3c8c7e4137b7';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=EKjrwlK05IY$t$ where service_id = '14be1817-b35c-4b58-8829-3c8c7e4137b7' and coalesce(video_url, '') = '';
update public.services set description_ar = case when coalesce(description_ar, '') = '' then $t$الثمن أتعابنا، ورسوم المحافظة العقارية تُؤدّى على حدة.$t$ else rtrim(description_ar, ' .') || '. ' || $t$الثمن أتعابنا، ورسوم المحافظة العقارية تُؤدّى على حدة.$t$ end where id = '14be1817-b35c-4b58-8829-3c8c7e4137b7' and position($t$الثمن أتعابنا$t$ in coalesce(description_ar, '')) = 0;
update public.services set price = 5000 where id = '71fa3601-b53a-4458-bc38-5595228afe7f';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=Jsa471KNVd0$t$ where service_id = '71fa3601-b53a-4458-bc38-5595228afe7f' and coalesce(video_url, '') = '';
update public.services set price = 3000 where id = 'a328e47b-e904-4b0a-bd3b-f8ecd50380ea';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=03-k7M21YTE$t$ where service_id = 'a328e47b-e904-4b0a-bd3b-f8ecd50380ea' and coalesce(video_url, '') = '';
update public.services set price = 5000 where id = '95c810d4-6e06-48f7-96b8-0860cc9f82c5';
update public.services set price = 3000 where id = '431c3ece-67ea-4e01-aa0e-01df9ea462eb';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=JVnPHg_RVHw$t$ where service_id = '431c3ece-67ea-4e01-aa0e-01df9ea462eb' and coalesce(video_url, '') = '';
update public.services set price = 2000 where id = '73e4fd46-34f9-4db3-8c43-01970a902bdc';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=UPpAISHbtig$t$ where service_id = '73e4fd46-34f9-4db3-8c43-01970a902bdc' and coalesce(video_url, '') = '';
update public.services set description_ar = case when coalesce(description_ar, '') = '' then $t$الثمن أتعابنا، وقيمة المخالفة تُؤدّى على حدة.$t$ else rtrim(description_ar, ' .') || '. ' || $t$الثمن أتعابنا، وقيمة المخالفة تُؤدّى على حدة.$t$ end where id = '73e4fd46-34f9-4db3-8c43-01970a902bdc' and position($t$الثمن أتعابنا$t$ in coalesce(description_ar, '')) = 0;
update public.services set price = 10000 where id = '3636460c-2dd9-4f8c-82a1-96ab4f5facf4';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=Jwvysi5wZQA$t$ where service_id = '3636460c-2dd9-4f8c-82a1-96ab4f5facf4' and coalesce(video_url, '') = '';
update public.services set description_ar = case when coalesce(description_ar, '') = '' then $t$الثمن أتعابنا، والرسوم الرسمية تُؤدّى على حدة.$t$ else rtrim(description_ar, ' .') || '. ' || $t$الثمن أتعابنا، والرسوم الرسمية تُؤدّى على حدة.$t$ end where id = '3636460c-2dd9-4f8c-82a1-96ab4f5facf4' and position($t$الثمن أتعابنا$t$ in coalesce(description_ar, '')) = 0;
update public.services set price = 3000 where id = 'cb61a412-45bb-4e44-93c2-3f27db75b0f3';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=gEM34HA_MCs$t$ where service_id = 'cb61a412-45bb-4e44-93c2-3f27db75b0f3' and coalesce(video_url, '') = '';
update public.services set price = 3000 where id = '9d451394-b72e-41de-8c7b-0200f637a020';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=rMYZlm9R7Ho$t$ where service_id = '9d451394-b72e-41de-8c7b-0200f637a020' and coalesce(video_url, '') = '';
update public.services set description_ar = case when coalesce(description_ar, '') = '' then $t$الثمن أتعابنا، وواجبات التنبر (75 درهماً) تُؤدّى على حدة.$t$ else rtrim(description_ar, ' .') || '. ' || $t$الثمن أتعابنا، وواجبات التنبر (75 درهماً) تُؤدّى على حدة.$t$ end where id = '9d451394-b72e-41de-8c7b-0200f637a020' and position($t$الثمن أتعابنا$t$ in coalesce(description_ar, '')) = 0;
update public.services set price = 20000 where id = '4b18450c-263c-4b42-b38d-c1695cc8cab9';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=QiNV9Pws5Jg$t$ where service_id = '4b18450c-263c-4b42-b38d-c1695cc8cab9' and coalesce(video_url, '') = '';
update public.services set price = 5000 where id = 'cc4819b0-cd16-442c-889d-334a505d8bb6';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=DSw4b8YfkoM$t$ where service_id = 'cc4819b0-cd16-442c-889d-334a505d8bb6' and coalesce(video_url, '') = '';
update public.services set description_ar = case when coalesce(description_ar, '') = '' then $t$الثمن أتعابنا، وقيمة الطابع الإلكتروني تُؤدّى على حدة.$t$ else rtrim(description_ar, ' .') || '. ' || $t$الثمن أتعابنا، وقيمة الطابع الإلكتروني تُؤدّى على حدة.$t$ end where id = 'cc4819b0-cd16-442c-889d-334a505d8bb6' and position($t$الثمن أتعابنا$t$ in coalesce(description_ar, '')) = 0;
update public.services set price = 5000 where id = 'f3208552-a221-41dc-abbc-6a277790e49c';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=6WaS8B1rkDE$t$ where service_id = 'f3208552-a221-41dc-abbc-6a277790e49c' and coalesce(video_url, '') = '';
update public.services set price = 1000 where id = '1e741ddb-54ed-4fc7-af76-bc24e85c6330';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=6bglNUXmrCI$t$ where service_id = '1e741ddb-54ed-4fc7-af76-bc24e85c6330' and coalesce(video_url, '') = '';
update public.services set price = 3000 where id = '34c073f9-2832-4204-8502-1e79a8e17bc6';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=YILy84HhNkI$t$ where service_id = '34c073f9-2832-4204-8502-1e79a8e17bc6' and coalesce(video_url, '') = '';
update public.services set description_ar = case when coalesce(description_ar, '') = '' then $t$الثمن أتعابنا، ورسوم منصة وثيقة (الوثيقة والتوصيل) تُؤدّى على حدة.$t$ else rtrim(description_ar, ' .') || '. ' || $t$الثمن أتعابنا، ورسوم منصة وثيقة (الوثيقة والتوصيل) تُؤدّى على حدة.$t$ end where id = '34c073f9-2832-4204-8502-1e79a8e17bc6' and position($t$الثمن أتعابنا$t$ in coalesce(description_ar, '')) = 0;
update public.services set price = 5000 where id = '9c8aa927-4da9-4b0d-9c15-7413c6be2b07';
update public.service_guides set video_url = $t$https://www.youtube.com/watch?v=aRDNBrShKaM$t$ where service_id = '9c8aa927-4da9-4b0d-9c15-7413c6be2b07' and coalesce(video_url, '') = '';
update public.services set description_ar = case when coalesce(description_ar, '') = '' then $t$الثمن أتعابنا، والرسوم الرسمية تُؤدّى على حدة.$t$ else rtrim(description_ar, ' .') || '. ' || $t$الثمن أتعابنا، والرسوم الرسمية تُؤدّى على حدة.$t$ end where id = '9c8aa927-4da9-4b0d-9c15-7413c6be2b07' and position($t$الثمن أتعابنا$t$ in coalesce(description_ar, '')) = 0;
update public.services set unit_ar = 'صفحة', unit_fr = 'page' where id = 'b0f62d64-02f8-4c51-9fa8-b21e9f6e25be' and coalesce(unit_ar, '') = '';
update public.services set unit_ar = 'شهر', unit_fr = 'mois' where id = '9c65f138-ee9d-4a11-b42b-8640201205b7' and coalesce(unit_ar, '') = '';
update public.services set name_ar = 'ملف التأشيرة: ملء الاستمارة وتجهيز الوثائق', name_fr = 'Dossier visa : formulaire et pièces',
  duration_ar = 'نفس اليوم', duration_fr = 'Le jour même',
  description_ar = $t$نملأ معك استمارة طلب التأشيرة (إسبانيا، فرنسا…) ونراجع لائحة الوثائق قبل الإيداع. لا نبيع المواعيد: الموعد يأخذه الزبون بنفسه من الموقع الرسمي لمركز الطلبات. الرسوم القنصلية ورسوم المركز تُؤدّى على حدة.$t$,
  description_fr = $t$Remplissage du formulaire de visa et vérification des pièces avant le dépôt. Nous ne vendons pas de rendez-vous : le client le prend lui-même sur le site officiel. Frais consulaires et du centre en plus.$t$
 where id = '4b18450c-263c-4b42-b38d-c1695cc8cab9';
update public.service_guides set steps = $j$[{"title": "حدّد البلد ونوع التأشيرة، واطبع لائحة الوثائق الرسمية من موقع السفارة أو مركز الطلبات المعتمد", "required": true}, {"title": "املأ الاستمارة الرسمية بمعلومات جواز الزبون بدقة", "required": true}, {"title": "راجع الملف مع الزبون وثيقة بوثيقة (الحجز، التأمين، الكشوف البنكية…)", "required": true}, {"title": "اطبع الاستمارة ليوقعها الزبون، وذكّره أن الموعد يأخذه بنفسه من الموقع الرسمي فقط", "required": true}]$j$::jsonb,
  tips_ar = $t$لا نبيع المواعيد ولا نحجزها مقابل ثمن: الموعد يُحجز من الموقع الرسمي لمركز الطلبات الذي تحيل إليه السفارة، بحساب الزبون. أغلب الدول تشترط جواز سفر صالحاً 6 أشهر على الأقل.$t$, require_ref = false
 where service_id = '4b18450c-263c-4b42-b38d-c1695cc8cab9' and updated_by is null;
update public.services set name_ar = 'خدمات نارسا الأخرى (تبديل البطاقة الرمادية، تحيين العنوان…)', name_fr = 'Autres services NARSA',
  description_ar = $t$تجهيز ملفات نارسا الأخرى: تبديل البطاقة الرمادية، تحيين عنوان الرخصة، تمديد صنف الرخصة… الإيداع في بريد بنك أو بريد كاش. الرسوم الرسمية تُؤدّى على حدة.$t$,
  description_fr = $t$Autres dossiers NARSA : échange de carte grise, mise à jour de l’adresse, extension de catégorie… Dépôt à Al Barid Bank / Barid Cash. Frais officiels en plus.$t$,
  official_url = 'https://khadamatnarsa.ma/fr', category_id = 'a10da892-eb48-41c5-b298-c92acbe01e88'
 where id = 'f3208552-a221-41dc-abbc-6a277790e49c';
update public.service_guides set steps = $j$[{"title": "افتح صفحة الخدمة في «خدمات نارسا» واقرأ الملف والرسوم", "required": true, "url": "https://khadamatnarsa.ma/fr", "url_label": "خدمات نارسا"}, {"title": "املأ الاستمارة المطلوبة ليوقعها الزبون", "required": true}, {"title": "جهّز الوثائق ووصل الرسوم", "required": true}, {"title": "الإيداع في بريد بنك أو بريد كاش المعتمدة", "required": true, "url": "https://khadamatnarsa.ma/fr/abb", "url_label": "لائحة الوكالات"}, {"title": "اكتب رقم الإيداع في «مرجع الإنجاز»، وتصل الزبون رسالة SMS عند الجاهزية", "required": true}]$j$::jsonb, links = $j$[{"label": "تتبّع الملف (نارسا)", "url": "https://khadamatnarsa.ma/fr/suivi-des-dossiers"}]$j$::jsonb
 where service_id = 'f3208552-a221-41dc-abbc-6a277790e49c' and updated_by is null;
update public.service_guides set tips_ar = rtrim(coalesce(tips_ar, ''), ' .') || '. ' || $t$CNSS بصدد تعميم ورقة العلاجات الإلكترونية تدريجياً (الورقي والإلكتروني يتعايشان في المرحلة الانتقالية): اسأل الزبون هل أرسل الطبيب ملفه إلكترونياً قبل تجهيز الملف الورقي. موظفو القطاع العام: CNOPS في طور الإدماج في CNSS (القانون 54.23).$t$
 where service_id = 'cb61a412-45bb-4e44-93c2-3f27db75b0f3' and updated_by is null and position('54.23' in coalesce(tips_ar, '')) = 0;
update public.service_guides set tips_ar = rtrim(coalesce(tips_ar, ''), ' .') || '. ' || $t$موظفو القطاع العام ومنخرطو CNOPS: الصندوق في طور الإدماج في CNSS (القانون 54.23)، تحقق من الجهة المختصة بالزبون قبل أي إجراء.$t$
 where service_id = '92c12b55-3058-4eac-adc9-7acd01b9fee0' and updated_by is null and position('54.23' in coalesce(tips_ar, '')) = 0;
