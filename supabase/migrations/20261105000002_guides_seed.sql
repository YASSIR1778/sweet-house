-- Starter staff guides (internal only) for the 7 services whose official
-- portals were read on 2026-10-21. Never overwrites a guide the owner wrote.
insert into public.service_guides (service_id, steps, tips_ar, links, require_ref, templates) values
('d9480487-d741-4d62-905f-9e5dd410a978', $j$[
  {"title":"افتح بوابة السجل العدلي واقبل شروط الاستعمال","url":"https://casierjudiciaire.justice.gov.ma","url_label":"البوابة","required":true},
  {"title":"اختر مكان الازدياد: المغرب أو الخارج","required":true},
  {"title":"املأ الاستمارة بالعربية بنفس معلومات البطاقة (استعمل «للنسخ في البوابة»)","required":true},
  {"title":"اختر طريقة الاستلام: المحكمة الابتدائية، أو البريد المضمون (أداء إلكتروني)، أو التسليم الإلكتروني NFC","required":true},
  {"title":"تحقق من الطلب ثم أرسله، واكتب رقم الطلب في «مرجع الإنجاز»","required":true},
  {"title":"أرسل للزبون رقم الطلب وطريقة السحب","required":false}
]$j$, 'السحب من المحكمة يكون بوثيقة الهوية ورقم الطلب. شخص آخر يحتاج وكالة رسمية خاصة. المولود بالخارج يُعالج طلبه في مصلحة السجل العدلي الوطني بالرباط.', '[]', true,
 $j$[{"label":"الطلب مُودَع (سحب من المحكمة)","text":"مرحباً {name} 👋\nأودعنا طلب السجل العدلي الخاص بكم ({number}). يمكنكم سحبه من المحكمة الابتدائية التي اخترناها برقم الطلب وبطاقتكم الوطنية.\n— مكتبة سويت هاوس"}]$j$),
('34c073f9-2832-4204-8502-1e79a8e17bc6', $j$[
  {"title":"افتح Watiqa ← «Extrait et Copie intégrale»","url":"https://www.watiqa.ma/index.php5?page=citoyen.FormulaireCommande","url_label":"Watiqa","required":true},
  {"title":"اختر «مسجّل في مكتب حالة مدنية داخل المغرب» وأدخل رمز التحقق","required":true},
  {"title":"اختر مكتب الحالة المدنية ونوع الوثيقة (نسخة موجزة أو كاملة) وأدخل معلومات الرسم","required":true},
  {"title":"أدخل عنوان التوصيل الذي اختاره الزبون","required":true},
  {"title":"تحقق من المعلومات ثم أدِّ بالبطاقة البنكية (لا يمكن الإلغاء بعد الأداء)","required":true},
  {"title":"اكتب رقم الطلبية في «مرجع الإنجاز» وأخبر الزبون بمدة التوصيل","required":true}
]$j$, 'الخدمة للراشدين المسجلين بالمغرب فقط، وغير متاحة بعد للمولودين بالخارج. المدة الإرشادية: 48 ساعة بالمكتب + حتى 5 أيام بالبريد.', '[{"label":"تتبّع طلبية Watiqa","url":"https://www.watiqa.ma/?page=citoyen.GuichetActe"}]', true, '[]'),
('9d451394-b72e-41de-8c7b-0200f637a020', $j$[
  {"title":"افتح بوابة البطاقة الوطنية ← «تعبئة الطلب المسبق»","url":"https://www.cnie.ma","url_label":"cnie.ma","required":true},
  {"title":"اختر نوع الطلب (أول مرة، تجديد، ضياع…) واملأ المعلومات","required":true},
  {"title":"احجز موعداً في المركز الأقرب للزبون","required":true},
  {"title":"اطبع الوصل وسلّمه للزبون مع لائحة الوثائق المطلوبة","required":true}
]$j$, 'الوثائق: شهادة الإقامة، 4 صور حديثة مطابقة، واجبات التمبر (75 درهماً، 50 لأقل من 12 سنة)، ونسخة الدفتر العائلي أو رسم الولادة (أقل من 3 أشهر) لأول مرة. القاصر يحضر مع نائبه الشرعي.', '[{"label":"لائحة الوثائق الرسمية","url":"https://www.cnie.ma/static/procedure"}]', true, '[]'),
('cc4819b0-cd16-442c-889d-334a505d8bb6', $j$[
  {"title":"اشترِ الطابع الإلكتروني (e-timbre) واحتفظ بالكود من 16 رقماً","url":"https://www.passeport.ma","url_label":"passeport.ma","required":true},
  {"title":"املأ طلب الجواز في «Saisie de la demande» وأدخل كود e-timbre","required":true},
  {"title":"اطبع الاستمارة ليوقّعها الزبون","required":true},
  {"title":"سلّم الزبون لائحة الوثائق، وأخبره أن الإيداع يكون بحضوره في الملحقة الإدارية أو القيادة","required":true}
]$j$, 'الصورة 35×45 مم بخلفية زرقاء أو بيضاء أو رمادية فاتحة. في التجديد: الجواز القديم. المدة 6 إلى 12 يوماً، ويُحفظ الجواز شهرين فقط.', '[{"label":"الوثائق المطلوبة","url":"https://www.passeport.ma/Home/PiecesAuMaroc"},{"label":"تتبّع الطلب","url":"https://www.passeport.ma"}]', true, '[]'),
('c58d279b-b109-4aee-88f8-86a49ddbe87f', $j$[
  {"title":"احصل على المعرّف الرقمي المدني والاجتماعي (IDCS) لكل فرد من الأسرة","url":"https://www.rnp.ma/","url_label":"RNP","required":true},
  {"title":"أنشئ حساب الأسرة في السجل الاجتماعي الموحد","url":"https://www.rsu.ma/rsu/account/register","url_label":"إنشاء حساب","required":true},
  {"title":"املأ استمارة التسجيل مع الزبون وأكّدها","url":"https://www.rsu.ma/rsu/account/log-in","url_label":"الدخول للحساب","required":true}
]$j$, 'التسجيل مجاني ودائم. احفظ للزبون معلومات الدخول لحساب أسرته وسلّمها له.', '[]', true, '[]'),
('b4daba7e-6de5-48f7-9c0a-a57cfe691d47', $j$[
  {"title":"تأكد أن الأسرة مسجلة في RNP وRSU وأن مؤشرها أقل من العتبة","url":"https://www.rsu.ma","url_label":"RSU","required":true},
  {"title":"افتح منصة الدعم الاجتماعي المباشر ← طلب الاستفادة","url":"https://www.asd.ma","url_label":"asd.ma","required":true},
  {"title":"أدخل: رقم بطاقة رب الأسرة، IDCS لكل فرد، رموز مسار للأطفال المتمدرسين، ورقم حساب رب الأسرة","required":true},
  {"title":"أكّد الطلب واكتب رقمه في «مرجع الإنجاز»","required":true}
]$j$, 'لا تُدخل أي معلومة غير مؤكدة: التصريح الكاذب يعاقب عليه القانون (المادة 18 من القانون 72.18).', '[]', true, '[]'),
('a328e47b-e904-4b0a-bd3b-f8ecd50380ea', $j$[
  {"title":"تأكد أن التلميذ وأسرته مسجلون في RNP وRSU (RSU قبل 24 ساعة على الأقل)","url":"https://www.rsu.ma","url_label":"RSU","required":true},
  {"title":"افتح منحتي ← «إيداع الطلب»","url":"https://www.minhaty.ma","url_label":"minhaty.ma","required":true},
  {"title":"أدخل المعلومات وراجعها مع الزبون كاملة قبل التأكيد (لا تعديل بعده)","required":true},
  {"title":"اطبع وصل الإيداع، واكتب القن السري في «مرجع الإنجاز» وسلّم الوصل للزبون","required":true}
]$j$, 'البوابة تُفتح في فترة محددة كل سنة. رمز مسار ضائع: إدارة المؤسسة، أو المديرية الإقليمية للأحرار والبكالوريا الأجنبية.', '[]', true, '[]')
on conflict (service_id) do nothing;
