-- =====================================================================
-- Staff guides for the remaining services. Every portal, link and rule
-- below was read on the official site on 2026-10-21. Where the site does
-- not describe a step, the guide says what to check instead of guessing.
-- Never overwrites a guide the owner already wrote.
-- Also fixes official links found to be wrong or outdated.
-- =====================================================================

-- ---------------------------------------------------------------- corrected official links
update public.services set official_url = 'https://rn.ae.gov.ma' where id in ('99db0228-24f7-4e2d-9548-8a51060773b1', '6350c308-6b0a-4e7c-95b9-25a323f462c2');
update public.services set official_url = 'https://servicesenligne.justice.gov.ma' where id = '9c8aa927-4da9-4b0d-9c15-7413c6be2b07';
update public.services set official_url = 'https://nc.directentreprise.ma' where id = 'b99e0ce0-1077-4be0-8884-8bcc97aac873';
update public.services set official_url = 'https://www.directentreprise.ma' where id = '71e600c4-c389-4f42-8049-0aef0a440fd2';
update public.services set official_url = 'https://khadamatnarsa.ma/fr/services/infractions-routieres/paiement' where id = '73e4fd46-34f9-4db3-8c43-01970a902bdc';
update public.services set official_url = 'https://khadamatnarsa.ma' where id = 'f3208552-a221-41dc-abbc-6a277790e49c';
update public.services set official_url = 'https://candidaturesbac.men.gov.ma' where id = '9eb1d367-70ae-49b5-a5dc-d67077a9f3ea';
update public.services set official_url = 'https://www.cursussup.gov.ma' where id in ('9d57006d-8e8f-4206-beac-cdd7717b669b', '090d816c-4da8-4fc5-9ff6-6be67099a385');
update public.services set official_url = 'https://www.daamsakane.ma' where id = '6922b801-65c3-405e-9a80-2ffe9c658212';
update public.services set official_url = 'https://massarservice.men.gov.ma' where id = '1e741ddb-54ed-4fc7-af76-bc24e85c6330';
update public.services set official_url = 'https://www.macnss.ma' where id in ('92c12b55-3058-4eac-adc9-7acd01b9fee0', 'cb61a412-45bb-4e44-93c2-3f27db75b0f3');
update public.services set official_url = 'https://www.damancom.ma' where id in ('4b2b1920-b0a9-4474-9b05-cae19dbba742', '9c65f138-ee9d-4a11-b42b-8640201205b7');
update public.services set official_url = 'https://www.vignette.ma' where id = '29fa072f-a294-4b00-a1c3-d12109fa6274';
update public.services set official_url = 'https://www.ancfcc.gov.ma/ConsultationPubliciteFonciere' where id = '905d5ff5-0fc9-431c-8ad6-835016bf5b41';
update public.services set official_url = 'https://www.ancfcc.gov.ma/PlanCadastral' where id = '74973a26-2545-4661-9870-0cf506a502ec';
update public.services set official_url = 'https://www.ancfcc.gov.ma/CertificatPropriete' where id = '14be1817-b35c-4b58-8829-3c8c7e4137b7';
-- The "note de renseignements" (urbanisme) is issued by the urban agency / commune, not ANCFCC
update public.services set official_url = null where id = '3636460c-2dd9-4f8c-82a1-96ab4f5facf4';

insert into public.service_guides (service_id, steps, tips_ar, links, require_ref, templates) values
-- ================================================================ ANCFCC
('14be1817-b35c-4b58-8829-3c8c7e4137b7', $j$[
  {"title":"افتح خدمة الشهادة الإلكترونية للملكية ← «Demande de certificat de propriété»","url":"https://www.ancfcc.gov.ma/CertificatPropriete","url_label":"ANCFCC","required":true},
  {"title":"املأ الاستمارة بعناية: المحافظة العقارية ورقم الرسم العقاري ومعلومات الزبون","required":true},
  {"title":"أدِّ رسوم الخدمة إلكترونياً","required":true},
  {"title":"احتفظ برمز التتبّع الذي يصل عبر SMS واكتبه في «مرجع الإنجاز»","required":true},
  {"title":"تابع الطلب من «Suivi des demandes»، ثم حمّل الشهادة وارفعها للزبون","url":"https://www.ancfcc.gov.ma/suivicertificatspage","url_label":"التتبّع","required":true}
]$j$, 'تُعالج الطلبات خلال أوقات العمل. التحقق من صحة الشهادة والتتبّع متاحان 3 أشهر من تاريخ توقيعها (حسب ANCFCC).', '[]', true, '[]'),
('74973a26-2545-4661-9870-0cf506a502ec', $j$[
  {"title":"افتح خدمة التصميم العقاري الإلكتروني ← «Demande du plan cadastral»","url":"https://www.ancfcc.gov.ma/PlanCadastral","url_label":"ANCFCC","required":true},
  {"title":"املأ الاستمارة، ثم أكّد المعلومات بالرمز الذي يصل عبر SMS","required":true},
  {"title":"أدِّ رسوم الخدمة إلكترونياً واحتفظ برمز التتبّع (SMS)","required":true},
  {"title":"تابع الطلب، ثم حمّل التصميم وارفعه للزبون","url":"https://www.ancfcc.gov.ma/suivicertificatspage","url_label":"التتبّع","required":true}
]$j$, 'تُعالج الطلبات خلال أوقات العمل. التحقق من صحة التصميم متاح 3 أشهر من تاريخ توقيعه.', '[]', true, '[]'),
('905d5ff5-0fc9-431c-8ad6-835016bf5b41', $j$[
  {"title":"لتتبّع إعلانات المطلب (خلاصات المطالب، انتهاء التحديد…): افتح «Publicité foncière» واختر المحافظة العقارية ونوع المرجع","url":"https://www.ancfcc.gov.ma/ConsultationPubliciteFonciere","url_label":"Publicité foncière","required":true},
  {"title":"لتتبّع كل العمليات على رسم عقاري: سجّل الزبون في خدمة «محافظتي» (Mohafadati) ليصله إشعار SMS بعد المصادقة","url":"https://www.ancfcc.gov.ma/DemandeSuiviTitresPage","url_label":"Mohafadati","required":false},
  {"title":"أرسل للزبون ما وجدته (لقطة شاشة) أو أخبره أن التسجيل في «محافظتي» تم","required":true}
]$j$, 'إن لم تُقبل طلب «محافظتي»، يجب على الزبون الاتصال بالمحافظة العقارية المعنية (حسب ANCFCC). الهاتف: 0530141414.', '[]', false, '[]'),
('3636460c-2dd9-4f8c-82a1-96ab4f5facf4', $j$[
  {"title":"تأكد من نوع الوثيقة: مذكرة المعلومات التعميرية تصدرها الوكالة الحضرية / الجماعة، وليس المحافظة العقارية","required":true},
  {"title":"تحقق من طريقة الإيداع المعتمدة لدى الوكالة الحضرية لتطوان (منصة إلكترونية أو إيداع مباشر) قبل البدء، واكتبها في «اقترح تعديلاً» ليُحدَّث هذا الدليل","required":true},
  {"title":"أودع الطلب مع الوثائق التي يطلبها الزبون واحتفظ برقم الإيداع","required":true}
]$j$, 'لم نجد في المصادر الرسمية طريقة موحّدة على المستوى الوطني: تختلف حسب الوكالة الحضرية. أكّد الطريقة مرة واحدة ثم حدّث هذا الدليل.', '[]', true, '[]'),
-- ================================================================ DGI
('c86b231d-1814-48bb-9ba0-fa7d41534259', $j$[
  {"title":"افتح بوابة الضرائب ← «Téléservices» ← «Espace particuliers» ← «SIMPL-Identification en ligne»","url":"https://www.tax.gov.ma/wps/portal/DGI/Teleservices","url_label":"DGI","required":true},
  {"title":"يتم التعريف بالبطاقة الوطنية الإلكترونية (الهوية الرقمية) عبر منصة «الطرف الثالث الموثوق»: يحتاج الزبون بطاقته وهاتفه","required":true},
  {"title":"أكمل الطلب للحصول على التعريف الضريبي مع الانخراط المبسط في SIMPL","required":true},
  {"title":"اكتب التعريف الضريبي في «مرجع الإنجاز»، وحمّل «Bulletin d’Identification Fiscale» من SIMPL-Attestation إن احتاجه","required":true}
]$j$, 'المقاول الذاتي يحصل على تعريفه الضريبي ضمن شهادة التسجيل في السجل الوطني للمقاول الذاتي، فلا داعي لهذه الخدمة.', '[]', true, '[]'),
('71fa3601-b53a-4458-bc38-5595228afe7f', $j$[
  {"title":"افتح بوابة الضرائب ← «Vos attestations» ← «Accédez à Simpl Attestation»","url":"https://www.tax.gov.ma/wps/portal/DGI/Teleservices","url_label":"DGI","required":true},
  {"title":"ادخل بحساب SIMPL الخاص بالزبون واختر «Demande d’attestation de régularité fiscale»","required":true},
  {"title":"تابع الطلب وحمّل الشهادة عند صدورها وارفعها للزبون","required":true}
]$j$, 'يمكن للجهة التي تُقدَّم لها الشهادة التحقق من صحتها بالرمز ثنائي الأبعاد الموجود عليها. الشهادة تتطلب أن يكون للزبون حساب SIMPL.', '[{"label":"التحقق من شهادة","url":"https://attestation.tax.gov.ma/attestations/verifAttest.htm"}]', true, '[]'),
('df897d0d-c1ba-4e84-87bd-74eedd72d75e', $j$[
  {"title":"افتح بوابة الضرائب ← «Téléservices SIMPL» وادخل بحساب الزبون","url":"https://www.tax.gov.ma/wps/portal/DGI/Teleservices","url_label":"DGI","required":true},
  {"title":"إن لم يكن له حساب: ابدأ بـ «SIMPL-Identification en ligne» (البطاقة الإلكترونية)","required":false},
  {"title":"املأ التصريح بالدخل حسب الوثائق التي قدّمها الزبون، وراجعه معه قبل الإيداع","required":true},
  {"title":"أودع التصريح واحتفظ بوصل الإيداع، واكتب رقمه في «مرجع الإنجاز»","required":true}
]$j$, 'آجال التصريح تختلف حسب نوع الدخل: راجع «Vos échéances fiscales» في بوابة الضرائب. لا تُدخل أي رقم لم يقدّم الزبون وثيقته.', '[]', true, '[]'),
('29fa072f-a294-4b00-a1c3-d12109fa6274', $j$[
  {"title":"تُؤدّى الضريبة السنوية على السيارات عبر الأبناك وتطبيقاتها (e-banking / mobile banking) والشبابيك الأوتوماتيكية ومقدّمي خدمات الأداء المعتمدين","url":"https://www.vignette.ma","url_label":"vignette.ma","required":true},
  {"title":"أدِّها برقم التسجيل (المترقيم) والمعلومات المطلوبة واحتفظ بالوصل","required":true},
  {"title":"إن ضاع الوصل: «Consulter et imprimer votre Attestation» في vignette.ma لطباعة شهادة الأداء","url":"https://www.vignette.ma","url_label":"شهادة الأداء","required":false}
]$j$, 'لائحة الأبناك ومقدّمي الخدمات الشركاء موجودة في vignette.ma.', '[]', true, '[]'),
-- ================================================================ CNSS
('92c12b55-3058-4eac-adc9-7acd01b9fee0', $j$[
  {"title":"افتح MaCNSS واختر صفة الزبون: أجير، عامل غير أجير، مستفيد من AMO التضامن، متقاعد…","url":"https://www.macnss.ma/ar/","url_label":"MaCNSS","required":true},
  {"title":"سجّل أو فعّل الحساب (الدخول برمز OTP أو بالهوية الرقمية)","required":true},
  {"title":"للعامل غير الأجير: اتبع «طريقة التسجيل في نظام التأمين الإجباري عن المرض للعمال غير الأجراء» في الدليل العملي","required":false},
  {"title":"احجز موعداً في وكالة CNSS إن طلبت المنصة إيداع وثائق","required":false},
  {"title":"اكتب رقم التسجيل في «مرجع الإنجاز» وسلّم الزبون معلومات الدخول","required":true}
]$j$, 'مركز الزبناء: 3939. احذر رسائل البريد المزيّفة باسم CNSS (تحذير رسمي من الصندوق).', '[]', true, '[]'),
('cb61a412-45bb-4e44-93c2-3f27db75b0f3', $j$[
  {"title":"راجع مع الزبون ورقة العلاج والوصفات والفواتير والتحاليل (كاملة وموقّعة ومختومة)","required":true},
  {"title":"أودع الملف في وكالة CNSS أو احجز موعداً من MaCNSS","url":"https://www.macnss.ma/ar/","url_label":"MaCNSS","required":true},
  {"title":"اكتب رقم إيداع الملف في «مرجع الإنجاز» وتابع حالته من حساب MaCNSS للزبون","required":true}
]$j$, 'لم نجد في الموقع الرسمي إيداعاً إلكترونياً عاماً لملف المرض: إن ظهر في حساب MaCNSS للزبون استعمله وحدّث هذا الدليل.', '[]', true, '[]'),
('4b2b1920-b0a9-4474-9b05-cae19dbba742', $j$[
  {"title":"حدّد الصفة: مشغّل (شركة أو شخص يُشغّل أجراء) ← Damancom، أما العامل غير الأجير ← MaCNSS","required":true},
  {"title":"للمشغّل: افتح Damancom ← «S’affilier à la CNSS» وابدأ الانخراط إلكترونياً","url":"https://www.damancom.ma/fr/","url_label":"Damancom","required":true},
  {"title":"بعد الانخراط: «Adhérer à Damancom» لتفعيل التصريح الإلكتروني بالأجراء","required":false},
  {"title":"اكتب رقم الانخراط في «مرجع الإنجاز»","required":true}
]$j$, 'دليل «Parcours Adhésion et Affiliation en ligne» متاح في Damancom. مركز الزبناء: 3939.', '[]', true, '[]'),
('9c65f138-ee9d-4a11-b42b-8640201205b7', $j$[
  {"title":"ادخل إلى Damancom بحساب المشغّل","url":"https://www.damancom.ma/fr/","url_label":"Damancom","required":true},
  {"title":"أنجز التصريح بالأجور والأجراء حسب «Guide de Télédéclaration» واحترم الأساس الجديد للاشتراكات","required":true},
  {"title":"أدِّ أو راجع المبالغ المستحقة في «Recouvrement»","required":true},
  {"title":"احفظ وصل التصريح وارفعه كلقطة تأكيد","required":true}
]$j$, 'يطبّق الصندوق منذ 1 أكتوبر 2025 قراراً جديداً حول أساس الاشتراكات (حسب Damancom).', '[]', true, '[]'),
-- ================================================================ Auto-entrepreneur
('99db0228-24f7-4e2d-9548-8a51060773b1', $j$[
  {"title":"تحقق أن نشاط الزبون غير مستثنى من نظام المقاول الذاتي (لائحة في البوابة)","url":"https://rn.ae.gov.ma","url_label":"السجل الوطني","required":true},
  {"title":"املأ استمارة التسجيل عبر المساعد واطبعها","required":true},
  {"title":"سلّم الزبون الاستمارة ولائحة الوثائق ليودعها في شباك «Auto-Entrepreneur» لدى أحد الأبناك الشريكة لبريد المغرب","required":true},
  {"title":"تابع الملف من الحساب: عند القبول تُحمَّل شهادة التسجيل (التعريف الضريبي، الضريبة المهنية، ICE)","url":"https://rn.ae.gov.ma/login","url_label":"الحساب","required":true}
]$j$, 'الأبناك الشريكة: بريد بنك، التجاري وفا بنك، BMCE، البنك الشعبي، CIH، القرض الفلاحي، الشركة العامة. يمكن تعديل الاستمارة ما دامت لم تُصادَق في الشباك. البطاقة تُحفظ 6 أشهر في الوكالة.', '[]', true, '[]'),
('6350c308-6b0a-4e7c-95b9-25a323f462c2', $j$[
  {"title":"ادخل إلى حساب المقاول الذاتي","url":"https://rn.ae.gov.ma/login","url_label":"الحساب","required":true},
  {"title":"أنجز التصريح المسبق برقم المعاملات المحصّل عن الفصل","required":true},
  {"title":"الأداء: إلكترونياً بالبطاقة البنكية (CMI)، أو طبع الاستمارة الموقّعة وإيداعها مع الأداء في وكالة بريد بنك","required":true},
  {"title":"حمّل وصل الأداء وارفعه كلقطة تأكيد","required":true}
]$j$, 'التصريح والأداء خلال الشهر الموالي للفصل (مثلاً الفصل الأول: طوال شهر أبريل). التأخير: زيادة 5% إن لم يتجاوز 30 يوماً و15% بعدها، مع غرامات الأداء المتأخر. الاشتراك في CNSS يُؤدّى مع التصريح حسب الشريحة.', '[]', true, '[]'),
-- ================================================================ Companies
('71e600c4-c389-4f42-8049-0aef0a440fd2', $j$[
  {"title":"افتح DirectEntreprise ← «Je réserve mon nom commercial» (الشهادة السلبية)","url":"https://www.directentreprise.ma","url_label":"DirectEntreprise","required":true},
  {"title":"بعد قبول الاسم: «Je crée mon entreprise» واتبع مراحل الإنشاء الإلكتروني","required":true},
  {"title":"«Je dépose mes actes»: أودع الوثائق والعقود المطلوبة","required":true},
  {"title":"تابع الملف واكتب رقمه في «مرجع الإنجاز»","required":true}
]$j$, 'المساعدة: 0802000018 / 0802000019 (من الإثنين إلى الجمعة 8h-18h والسبت 8h-12h).', '[]', true, '[]'),
('b99e0ce0-1077-4be0-8884-8bcc97aac873', $j$[
  {"title":"افتح منصة الأسماء التجارية لـ OMPIC وادخل بحساب (أو أنشئ حساباً للزبون)","url":"https://nc.directentreprise.ma/home","url_label":"OMPIC","required":true},
  {"title":"راجع «Directives d’examen des noms commerciaux» قبل اقتراح الأسماء","required":true},
  {"title":"قدّم الطلب بالأسماء المقترحة والنشاط وأدِّ الرسوم","required":true},
  {"title":"تابع الطلب وحمّل الشهادة السلبية عند صدورها","required":true}
]$j$, 'المساعدة: 0802000018 / 0802000019 — crc@ompic.ma', '[]', true, '[]'),
('9c8aa927-4da9-4b0d-9c15-7413c6be2b07', $j$[
  {"title":"افتح الشباك الإلكتروني لطلبات الوثائق لوزارة العدل واقبل شروط الاستعمال ← «Nouvelle demande»","url":"https://servicesenligne.justice.gov.ma","url_label":"وزارة العدل","required":true},
  {"title":"اختر وثيقة السجل التجاري المطلوبة وأدخل رقم السجل والمحكمة","required":true},
  {"title":"أكمل الطلب واحتفظ برقمه","required":true},
  {"title":"تابع من «Suivi de la demande»؛ تُرسَل الوثيقة إلكترونياً (حسب بوابة محاكم)","required":true}
]$j$, 'يمكن التحقق من وثيقة مسلّمة من «Demande délivrée».', '[]', true, '[]'),
-- ================================================================ Rokhas
('608a798e-294a-4e81-83be-1e12cd5ed829', $j$[
  {"title":"أنشئ للزبون حساباً في منصة رخص (أو ادخل بحسابه)","url":"https://www.rokhas.ma","url_label":"رخص","required":true},
  {"title":"«وضع طلب»: اختر الرخصة الاقتصادية المناسبة للنشاط وأرفق الوثائق","required":true},
  {"title":"تابع الملف من «تتبع حالة ملفي» (أصبح ممكناً بالبحث برقم البطاقة الوطنية)","required":true},
  {"title":"حمّل الرخصة الموقّعة إلكترونياً وارفعها للزبون","required":true}
]$j$, 'المنصة تغطي كل جماعات المغرب. استعمل «محاكي الإجراءات» عند توفره لمعرفة الوثائق المطلوبة لكل نشاط.', '[]', true, '[]'),
('b0abc376-fb71-4bfe-970d-6dd13a09ae92', $j$[
  {"title":"ادخل إلى منصة رخص بحساب الزبون أو مهندسه المعماري","url":"https://www.rokhas.ma","url_label":"رخص","required":true},
  {"title":"«وضع طلب»: اختر رخصة البناء المناسبة وأرفق التصاميم وشهادة الملكية","required":true},
  {"title":"تابع الملف ومراحله (التصريح بالمساحات، اللجنة، القرار) من «تتبع حالة ملفي»","required":true},
  {"title":"حمّل الرخصة الموقّعة إلكترونياً عند صدورها","required":true}
]$j$, 'طلبات رخص البناء غالباً تتطلب مهندساً معمارياً: تأكد من ذلك مع الزبون قبل البدء.', '[]', true, '[]'),
-- ================================================================ Justice
('065e4d33-c918-4d34-b7f1-b9c4fab00ddb', $j$[
  {"title":"افتح بوابة محاكم ← «تتبع الملفات»","url":"https://www.mahakim.ma/","url_label":"محاكم","required":true},
  {"title":"اختر نوع المحكمة (ابتدائية، استئناف، تجارية، إدارية) وأدخل رقم الملف","required":true},
  {"title":"أرسل للزبون تاريخ الجلسة القادمة وآخر إجراء (لقطة شاشة)","required":true}
]$j$, 'الخدمة متوفرة أيضاً في تطبيق Mahakim-Mobile.', '[]', false, '[]'),
-- ================================================================ NARSA
('f3208552-a221-41dc-abbc-6a277790e49c', $j$[
  {"title":"افتح خدمات NARSA واختر: رخصة السياقة أو البطاقة الرمادية (تسجيل، نقل الملكية، تبديل، نظير…)","url":"https://khadamatnarsa.ma/fr","url_label":"NARSA","required":true},
  {"title":"اتبع الإجراء والوثائق المطلوبة في صفحة الخدمة","required":true},
  {"title":"احتفظ برقم الملف وتابعه من «Suivi des dossiers»","url":"https://khadamatnarsa.ma/fr/suivi-des-dossiers","url_label":"التتبّع","required":true}
]$j$, 'لنقل ملكية سيارة توجد «Portail de mutation des véhicules». للأسئلة: AskNARSA.', '[]', true, '[]'),
('73e4fd46-34f9-4db3-8c43-01970a902bdc', $j$[
  {"title":"تأكد من أن الزبون توصّل بإشعار المخالفة: أجل الأداء 30 يوماً من تاريخ التبليغ","url":"https://khadamatnarsa.ma/fr/services/infractions-routieres/paiement","url_label":"NARSA","required":true},
  {"title":"أدِّ الغرامة عبر الخزينة العامة tgr.gov.ma أو e-banking / mobile banking أو الشبابيك الأوتوماتيكية أو نقاط الأداء","url":"https://www.tgr.gov.ma","url_label":"TGR","required":true},
  {"title":"احفظ وصل الأداء وارفعه كلقطة تأكيد","required":true}
]$j$, 'يمكن أيضاً الأداء نقداً أو بشيك في قباضات الخزينة العامة (حسب NARSA).', '[]', true, '[]'),
-- ================================================================ Employment / complaints
('431c3ece-67ea-4e01-aa0e-01df9ea462eb', $j$[
  {"title":"افتح بوابة التشغيل العمومي وادخل بحساب الزبون (أو أنشئ حساباً)","url":"https://www.emploi-public.ma/ar/","url_label":"التشغيل العمومي","required":true},
  {"title":"ابحث عن المباراة واقرأ شروطها وآخر أجل","required":true},
  {"title":"قدّم الترشيح من فضاء المترشح وأرفق الوثائق المطلوبة","required":true},
  {"title":"فعّل التنبيهات للزبون واحتفظ بتأكيد الترشيح","required":true}
]$j$, 'لا يمكن الترشيح التلقائي: يجب الترشيح لكل إعلان. بعدها تُنشر لائحة المدعوين للكتابي ثم للشفوي ثم النتائج على نفس البوابة.', '[]', true, '[]'),
('d981c294-101f-4665-86cd-7a99c8d9f0d5', $j$[
  {"title":"افتح موقع ANAPEC ← «Espace personnel» وأنشئ حساب الباحث عن عمل","url":"https://www.anapec.org","url_label":"ANAPEC","required":true},
  {"title":"أكمل الملف: المعلومات والسيرة الذاتية","required":true},
  {"title":"أرِ الزبون كيف يتصفح «Offres d’emploi» ويترشح","required":false}
]$j$, null, '[]', false, '[]'),
('39868b97-dcc6-49d0-ad38-e19a9433a4a4', $j$[
  {"title":"افتح البوابة الوطنية للشكايات ← «تقديم شكاية»","url":"https://www.chikaya.ma/","url_label":"شكاية","required":true},
  {"title":"اختر الإدارة المعنية، واكتب مضمون الشكاية بوضوح (يمكن الاستعانة بالمساعد الكتابي)","required":true},
  {"title":"أرسلها واحتفظ برقم الشكاية للتتبّع","required":true}
]$j$, 'المساعدة: 3737 أو 0802003737 (من داخل المغرب). يمكن أيضاً تقديم «ملاحظة» أو «اقتراح».', '[]', true, '[]'),
-- ================================================================ Education
('9eb1d367-70ae-49b5-a5dc-d67077a9f3ea', $j$[
  {"title":"افتح المنصة الرقمية للبكالوريا وتأكد أن فترة ترشيح الأحرار مفتوحة","url":"https://candidaturesbac.men.gov.ma","url_label":"منصة البكالوريا","required":true},
  {"title":"اقرأ مع الزبون «دفتر المساطر الخاص بالمترشح» وشروط الترشيح","required":true},
  {"title":"«طلب الترشيح للباكالوريا حر»: أنشئ الحساب وأكمل الطلب وأرفق الوثائق","required":true},
  {"title":"احتفظ بتأكيد الترشيح، وأخبر الزبون أن الاستدعاء يُحمَّل من نفس المنصة","required":true}
]$j$, 'إيداع ترشيحات الأحرار يتم حصرياً على هذه البوابة، في فترة محددة كل سنة. الشكايات تُودع وتُتبع من نفس المنصة.', '[]', true, '[]'),
('9d57006d-8e8f-4206-beac-cdd7717b669b', $j$[
  {"title":"للمؤسسات ذات الاستقطاب المحدود والتوجيه ما بعد البكالوريا: افتح Cursussup","url":"https://www.cursussup.gov.ma","url_label":"Cursussup","required":true},
  {"title":"سجّل الزبون، واختر التكوينات ورتّبها في «السلة»","required":true},
  {"title":"تابع مقترحات القبول وأكّد المقترح، ثم أكمل التسجيل القبلي واحجز موعد التسجيل","required":true},
  {"title":"للكليات ذات الاستقطاب المفتوح: التسجيل يكون عبر منصة الجامعة المعنية؛ تأكد منها قبل البدء","required":false}
]$j$, 'روابط المنحة (منحتي) والتأمين والسكن الجامعي موجودة في Cursussup ← «Liens utiles».', '[]', true, '[]'),
('090d816c-4da8-4fc5-9ff6-6be67099a385', $j$[
  {"title":"إن كانت المباراة لمؤسسة بعد البكالوريا (ENSA، ENCG، الطب، EST، FST…): الترشيح عبر Cursussup","url":"https://www.cursussup.gov.ma","url_label":"Cursussup","required":true},
  {"title":"إن كانت مباراة توظيف عمومي: استعمل خدمة «مباريات الوظيفة العمومية»","url":"https://www.emploi-public.ma/ar/","url_label":"التشغيل العمومي","required":false},
  {"title":"غير ذلك: افتح الموقع الرسمي للمؤسسة المنظمة فقط (لا تستعمل مواقع الإعلانات للترشيح)","required":false},
  {"title":"احتفظ بتأكيد الترشيح ورقمه","required":true}
]$j$, null, '[]', true, '[]'),
('1e741ddb-54ed-4fc7-af76-bc24e85c6330', $j$[
  {"title":"افتح خدمات مسار الرسمية: فضاء التلاميذ أو فضاء الآباء","url":"https://massarservice.men.gov.ma","url_label":"مسار","required":true},
  {"title":"ادخل برمز مسار وكلمة السر الخاصة بالزبون","required":true},
  {"title":"اطبع أو أرسل النتائج / الوثيقة المطلوبة للزبون","required":true}
]$j$, 'لا تستعمل المواقع غير الرسمية لعرض النتائج. رمز مسار ضائع: إدارة المؤسسة.', '[]', false, '[]'),
-- ================================================================ Housing
('6922b801-65c3-405e-9a80-2ffe9c658212', $j$[
  {"title":"افتح منصة «دعم سكن» واقرأ شروط الاستفادة مع الزبون","url":"https://www.daamsakane.ma","url_label":"دعم سكن","required":true},
  {"title":"«أطلب الاستفادة من الدعم المباشر للسكن» وأكمل التسجيل","required":true},
  {"title":"أكّد الهوية برمز SMS أو بتطبيق «Mon e-ID» عند الدخول","required":true},
  {"title":"بعد القبول: أودع الوعد بالبيع ورخصة السكن في المنصة داخل الأجل المحدد، وتابع الملف من «فضاء خاص»","required":true}
]$j$, 'المنصة مفتوحة للمغاربة المقيمين في المغرب أو في الخارج لامتلاك سكن رئيسي. تدبير البرنامج مفوّض للصندوق الوطني للتقاعد والتأمين.', '[]', true, '[]'),
-- ================================================================ Visa (no single official portal)
('4b18450c-263c-4b42-b38d-c1695cc8cab9', $j$[
  {"title":"حدّد الدولة ونوع التأشيرة، ثم افتح الموقع الرسمي لسفارة/قنصلية تلك الدولة بالمغرب لمعرفة الجهة المعتمدة لأخذ المواعيد","required":true},
  {"title":"احجز الموعد على الموقع الذي تحيل إليه السفارة فقط (احذر المواقع والوسطاء غير المعتمدين)","required":true},
  {"title":"اطبع تأكيد الموعد ولائحة الوثائق المطلوبة وسلّمها للزبون","required":true}
]$j$, 'تذكير: أغلب الدول تشترط جواز سفر صالحاً 6 أشهر على الأقل (حسب passeport.ma).', '[]', true, '[]'),
-- ================================================================ In-shop services (no portal)
('41b9efa6-50aa-4e36-9c75-039fd084a947', $j$[
  {"title":"خذ معلومات الزبون: التكوين، الخبرات، اللغات، المهارات، والصورة","required":true},
  {"title":"اكتب السيرة باللغة المطلوبة (يمكن الاستعانة بالمساعد الكتابي)","required":true},
  {"title":"راجعها مع الزبون، ثم ارفع النسخة النهائية (PDF) في «الوثيقة الجاهزة»","required":true}
]$j$, null, '[]', false, '[]'),
('b0f62d64-02f8-4c51-9fa8-b21e9f6e25be', $j$[
  {"title":"تأكد من الوثيقة الأصلية وعدد الصفحات واللغة","required":true},
  {"title":"اكتبها ثم راجعها مرة ثانية (الأسماء والأرقام)","required":true},
  {"title":"ارفع النسخة النهائية (Word + PDF) في «الوثيقة الجاهزة»","required":true}
]$j$, null, '[]', false, '[]'),
('95c810d4-6e06-48f7-96b8-0860cc9f82c5', $j$[
  {"title":"افتح «كتابة طلب / شكاية ✨» في أعلى الطلب، واختر النوع واللغة","required":true},
  {"title":"راجع النص مع الزبون وصحّح المعلومات الشخصية","required":true},
  {"title":"اطبعه A4 أو ارفعه في «الوثيقة الجاهزة»","required":true}
]$j$, null, '[]', false, '[]')
on conflict (service_id) do nothing;
