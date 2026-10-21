-- =====================================================================
-- Help content (field hints + FAQ) for the most requested services.
-- Every statement is taken from the official portal of the service,
-- read on 2026-10-21:
--   casierjudiciaire.justice.gov.ma (+ /Infos/CJ.aspx), watiqa.ma (FAQ),
--   cnie.ma (/static/procedure), passeport.ma (Pièces à fournir, FAQ),
--   rsu.ma, asd.ma, minhaty.ma (faq.aspx).
-- Amounts or delays that the official site does not state are NOT given.
-- =====================================================================

create or replace function pg_temp.hint(p_fields jsonb, p_key text, p_ar text, p_fr text)
returns jsonb language sql as $$
  select coalesce(jsonb_agg(case when f->>'key' = p_key then f || jsonb_build_object('hint_ar', p_ar, 'hint_fr', p_fr) else f end), '[]')
  from jsonb_array_elements(p_fields) f
$$;

-- ---------------------------------------------------------------- Casier judiciaire
update public.services set
  fields = pg_temp.hint(fields, 'cin', 'اكتب رقم البطاقة كما هو مكتوب عليها: الحروف ثم الأرقام (مثلاً AB123456).', 'Le numéro tel qu’écrit sur la carte : lettres puis chiffres (ex. AB123456).'),
  faq = $j$[
    {"q_ar":"كيف أستلم السجل العدلي؟","a_ar":"بعد إيداع الطلب عبر البوابة الرسمية، توجد ثلاث طرق: السحب من المحكمة الابتدائية التي تختارها برقم الطلب ووثيقة الهوية، أو الإرسال بالبريد المضمون مقابل رسوم توصيل (25 درهماً داخل المغرب و40 درهماً خارجه حسب البوابة)، أو التسليم الإلكتروني على هاتف مزوّد بتقنية NFC باستعمال البطاقة الوطنية.","q_fr":"Comment recevoir l’extrait ?","a_fr":"Après la demande sur le portail officiel : retrait au tribunal de première instance choisi avec le numéro de demande et une pièce d’identité, envoi par courrier recommandé (25 DH au Maroc, 40 DH à l’étranger selon le portail), ou remise électronique sur un téléphone NFC avec la carte nationale."},
    {"q_ar":"هل يمكن لشخص آخر أن يسحبه مكاني؟","a_ar":"نعم، لكن فقط بوكالة رسمية خاصة، حسب وزارة العدل.","q_fr":"Une autre personne peut-elle le retirer ?","a_fr":"Oui, uniquement avec une procuration spéciale légalisée, selon le Ministère de la Justice."},
    {"q_ar":"كم مدة صلاحيته؟","a_ar":"البوابة الرسمية لا تحدد مدة صلاحية، لكن أغلب الإدارات تطلب سجلاً حديث التاريخ. اسأل الإدارة التي ستقدّمه لها عن المدة التي تقبلها.","q_fr":"Quelle est sa validité ?","a_fr":"Le portail ne fixe pas de durée ; la plupart des administrations exigent un extrait récent. Vérifiez auprès de l’administration destinataire."},
    {"q_ar":"وُلدت خارج المغرب، هل الطريقة نفسها؟","a_ar":"يُعالَج طلبك لدى مصلحة السجل العدلي الوطني بوزارة العدل بالرباط. المطلوب حسب الوزارة: نسخة من البطاقة الوطنية (أو الصفحة الأولى من جواز السفر لغير المقيم)، ونسخة من عقد الازدياد (يُعفى منها حامل البطاقة البيومترية)، وتنبر من فئة 10 دراهم. نتكلّف لك بالطلب الإلكتروني ونشرح لك طريقة السحب.","q_fr":"Je suis né(e) à l’étranger ?","a_fr":"La demande relève du Casier judiciaire national (Ministère de la Justice, Rabat) : copie de la CIN (ou 1re page du passeport si non-résident), copie de l’acte de naissance (sauf titulaire de la carte biométrique) et un timbre de 10 DH."},
    {"q_ar":"لماذا تطلبون صورة البطاقة من الوجهين؟","a_ar":"لنملأ الاستمارة الرسمية بدقة كما هي في بطاقتك (الاستمارة تُملأ بالعربية)، ونتجنّب أي خطأ في الاسم أو تاريخ ومكان الازدياد.","q_fr":"Pourquoi la CIN recto-verso ?","a_fr":"Pour remplir le formulaire officiel (en arabe) exactement comme sur votre carte et éviter toute erreur."}
  ]$j$::jsonb
where id = 'd9480487-d741-4d62-905f-9e5dd410a978';

-- ---------------------------------------------------------------- Acte de naissance (Watiqa)
update public.services set
  fields = pg_temp.hint(pg_temp.hint(pg_temp.hint(pg_temp.hint(fields,
    'full_name', 'كما هو مكتوب في رسم الولادة أو الدفتر العائلي.', 'Tel qu’écrit sur l’acte ou le livret de famille.'),
    'birth_date', 'تاريخ الازدياد كما في البطاقة الوطنية.', 'Comme sur la carte nationale.'),
    'birth_place', 'الجماعة أو مكتب الحالة المدنية الذي سُجّلت فيه الولادة (وليس بالضرورة مدينة السكن).', 'La commune / le bureau d’état civil où la naissance a été déclarée.'),
    'act_number', 'رقم الرسم وسنة التسجيل، تجدهما في الدفتر العائلي أو في نسخة قديمة من عقد الازدياد. إن لم تعرفه اتركه فارغاً.', 'Numéro et année de l’acte (livret de famille ou ancienne copie). Laissez vide si inconnu.'),
  faq = $j$[
    {"q_ar":"كم من الوقت يستغرق الوصول؟","a_ar":"حسب منصة Watiqa الرسمية، كإشارة: حوالي 48 ساعة لدى مكتب الحالة المدنية، ثم 5 أيام كحد أقصى للتوصيل بالبريد المضمون.","q_fr":"Quel est le délai ?","a_fr":"Selon Watiqa, à titre indicatif : environ 48 h au bureau d’état civil, puis 5 jours maximum par courrier recommandé."},
    {"q_ar":"أين أستلم الوثيقة؟","a_ar":"تصلك بالبريد المضمون إلى العنوان الذي تختاره.","q_fr":"Où vais-je la recevoir ?","a_fr":"Par courrier recommandé à l’adresse de votre choix."},
    {"q_ar":"من يمكنه الطلب؟","a_ar":"حسب المنصة: الأشخاص الراشدون المسجلون في سجلات الحالة المدنية بالمغرب. الخدمة غير متاحة بعد للمولودين خارج المغرب، وتُعمَّم تدريجياً على مكاتب الحالة المدنية؛ إن لم يكن مكتبك متاحاً نخبرك ونقترح عليك حلاً آخر.","q_fr":"Qui peut commander ?","a_fr":"Les personnes majeures inscrites à l’état civil au Maroc. Pas encore ouvert aux personnes nées à l’étranger ; déploiement progressif selon les bureaux."},
    {"q_ar":"أنا مقيم بالخارج، هل يمكن إرسالها لي؟","a_ar":"نعم، إذا كان البريد المغربي يوصل إلى بلدك وكان مكتب الحالة المدنية لولادتك يقدم الخدمة.","q_fr":"Je vis à l’étranger ?","a_fr":"Oui, si Barid Al-Maghrib livre votre pays et que votre bureau d’état civil propose le service."},
    {"q_ar":"هل يمكن تعديل الطلب أو إلغاؤه؟","a_ar":"لا، بعد الأداء لا يمكن التعديل أو الإلغاء حسب المنصة، لذلك نراجع معك المعلومات قبل الإرسال.","q_fr":"Puis-je modifier ou annuler ?","a_fr":"Non, après paiement la commande ne peut plus être modifiée ; nous vérifions tout avec vous avant."}
  ]$j$::jsonb
where id = '34c073f9-2832-4204-8502-1e79a8e17bc6';

-- ---------------------------------------------------------------- CNIE
update public.services set
  fields = pg_temp.hint(fields, 'type', 'اختر: أول مرة، تجديد، ضياع أو سرقة، أو تغيير معلومة في البطاقة.', 'Première demande, renouvellement, perte/vol ou modification.'),
  faq = $j$[
    {"q_ar":"ما الوثائق المطلوبة لأول بطاقة؟","a_ar":"حسب بوابة البطاقة الوطنية: شهادة الإقامة (من الأمن الوطني بالمدينة، أو الدرك/السلطة المحلية بالقرية)، أربع صور حديثة لا تتجاوز 6 أشهر ومطابقة للمعايير، واجبات التمبر، ونسخة من صفحة المعني بالدفتر العائلي مع إحضار الدفتر، أو نسخة كاملة / رسم ولادة لا تتجاوز 3 أشهر بالعربية واللاتينية.","q_fr":"Documents pour une première carte ?","a_fr":"Certificat de résidence, 4 photos récentes (moins de 6 mois) aux normes, droits de timbre, copie de la page du livret de famille (avec le livret) ou copie intégrale / acte de naissance de moins de 3 mois en arabe et en latin."},
    {"q_ar":"وما المطلوب للتجديد؟","a_ar":"شهادة الإقامة، أربع صور حديثة، واجبات التمبر، وإرجاع البطاقة القديمة. في حالة الضياع أو السرقة: تصريح بالشرف أو توقيع الاستمارة لدى مصالح الأمن.","q_fr":"Et pour un renouvellement ?","a_fr":"Certificat de résidence, 4 photos, droits de timbre et restitution de l’ancienne carte. Perte/vol : déclaration sur l’honneur."},
    {"q_ar":"كم ثمن التمبر؟","a_ar":"حسب البوابة الرسمية: 75 درهماً للبالغين وللقاصرين من 12 سنة فما فوق، و50 درهماً لمن تقل أعمارهم عن 12 سنة.","q_fr":"Combien coûte le timbre ?","a_fr":"75 DH pour les adultes et mineurs de 12 ans et plus, 50 DH pour les moins de 12 ans (portail officiel)."},
    {"q_ar":"ما مدة صلاحية البطاقة؟","a_ar":"10 سنوات لمن عمره 12 سنة فما فوق. لمن هم أقل من 12 سنة: 7 سنوات كحد أقصى، وتنتهي عند بلوغ 12 سنة.","q_fr":"Durée de validité ?","a_fr":"10 ans à partir de 12 ans ; moins de 12 ans : 7 ans maximum, jusqu’aux 12 ans."},
    {"q_ar":"هل يجب أن أحضر بنفسي؟","a_ar":"نعم، الحضور إلى مركز التسجيل ضروري. بالنسبة للقاصر حضوره إلزامي مع نائبه الشرعي، الذي يقدم نسخة من بطاقته ووثيقة تثبت صفته. نحن نملأ الطلب المسبق ونحجز الموعد ونطبع لك الوصل.","q_fr":"Dois-je me présenter ?","a_fr":"Oui. Pour un mineur, présence obligatoire avec son représentant légal. Nous remplissons la pré-demande et réservons le rendez-vous."}
  ]$j$::jsonb
where id = '9d451394-b72e-41de-8c7b-0200f637a020';

-- ---------------------------------------------------------------- Passeport
update public.services set
  fields = pg_temp.hint(fields, 'type', 'أول جواز، تجديد، أو ضياع/سرقة. في التجديد أحضر الجواز القديم.', 'Premier passeport, renouvellement ou perte/vol (apportez l’ancien passeport).'),
  faq = $j$[
    {"q_ar":"ما الوثائق المطلوبة للراشد؟","a_ar":"حسب البوابة الرسمية: استمارة الطلب مملوءة ومؤرخة وموقعة (نملؤها ونطبعها لك)، أداء واجبات التمبر بكود e-timbre من 16 رقماً، نسخة من البطاقة الوطنية الإلكترونية سارية، وصورة حديثة 35×45 مم بخلفية زرقاء أو بيضاء أو رمادية فاتحة. في التجديد: الجواز القديم. في الضياع أو السرقة: تصريح لدى الأمن الوطني أو الدرك الملكي يذكر رقم الجواز.","q_fr":"Pièces pour un majeur ?","a_fr":"Formulaire rempli, daté et signé ; timbre payé par code e-timbre (16 chiffres) ; copie de la CNIE valide ; photo récente 35×45 mm sur fond bleu, blanc ou gris clair ; ancien passeport en cas de renouvellement ; déclaration de perte/vol sinon."},
    {"q_ar":"أين أودع الملف؟","a_ar":"لدى الملحقة الإدارية أو القيادة التابع لها محل سكناك.","q_fr":"Où déposer le dossier ?","a_fr":"À l’annexe administrative ou au caïdat de votre lieu de résidence."},
    {"q_ar":"هل يجب أن أحضر بنفسي؟","a_ar":"نعم، حضور صاحب الطلب إلزامي، راشداً كان أو قاصراً. القاصر يرافقه أحد والديه أو نائبه الشرعي.","q_fr":"Présence obligatoire ?","a_fr":"Oui, pour les majeurs comme pour les mineurs (accompagnés d’un parent ou du représentant légal)."},
    {"q_ar":"كم يستغرق؟","a_ar":"من 6 إلى 12 يوماً حسب البوابة، ويُنصح بإيداع الطلب قبل السفر بـ 20 يوماً على الأقل. انتبه: أغلب الدول تشترط صلاحية 6 أشهر على الأقل لمنح التأشيرة.","q_fr":"Quel délai ?","a_fr":"6 à 12 jours ; déposez au moins 20 jours avant le voyage. La plupart des pays exigent 6 mois de validité pour un visa."},
    {"q_ar":"كيف أعرف أنه جاهز؟ وهل يسحبه غيري؟","a_ar":"تصلك رسالة SMS أو بريد إلكتروني عند الجاهزية. يُسلَّم شخصياً لصاحبه فقط (أو لأحد الوالدين/النائب الشرعي للقاصر)، ويُحتفظ به شهرين؛ بعدها يُلغى دون استرجاع واجبات التمبر.","q_fr":"Comment savoir qu’il est prêt ?","a_fr":"Par SMS ou e-mail. Remis uniquement au titulaire (ou parent du mineur), conservé 2 mois puis annulé sans remboursement du timbre."}
  ]$j$::jsonb
where id = 'cc4819b0-cd16-442c-889d-334a505d8bb6';

-- ---------------------------------------------------------------- RSU
update public.services set
  faq = $j$[
    {"q_ar":"هل التسجيل في السجل الاجتماعي الموحد مجاني؟","a_ar":"نعم، التسجيل مجاني ومفتوح بشكل دائم حسب البوابة الرسمية. ما تدفعه لنا هو مقابل خدمة إنجازه لك فقط.","q_fr":"L’inscription est-elle gratuite ?","a_fr":"Oui, gratuite et ouverte en permanence. Vous ne payez que notre service d’accompagnement."},
    {"q_ar":"ما هي مراحل التسجيل؟","a_ar":"1) الحصول على المعرّف الرقمي المدني والاجتماعي (IDCS) لكل فرد من الأسرة عبر السجل الوطني للسكان RNP. 2) إنشاء حساب للأسرة في السجل الاجتماعي الموحد. 3) ملء استمارة التسجيل وتأكيدها.","q_fr":"Quelles sont les étapes ?","a_fr":"1) Obtenir l’IDCS de chaque membre du ménage via le RNP. 2) Créer le compte du ménage au RSU. 3) Remplir et valider le formulaire."},
    {"q_ar":"ماذا أستفيد من التسجيل؟","a_ar":"تحصل الأسرة على مؤشر اجتماعي واقتصادي، تعتمد عليه برامج الدعم الاجتماعي لتحديد الاستحقاق، مثل الدعم الاجتماعي المباشر ومنحة التعليم العالي.","q_fr":"À quoi sert l’inscription ?","a_fr":"Le ménage obtient un indice socio-économique utilisé par les programmes d’aide (aide directe, bourses…)."},
    {"q_ar":"هل أحتاج وثائق؟","a_ar":"التسجيل الإلكتروني لا يتطلب تنقلاً ولا تقديم وثائق إثبات حسب البوابة، لكننا نحتاج البطاقات الوطنية لأفراد الأسرة لنُدخل المعلومات بدقة.","q_fr":"Faut-il des justificatifs ?","a_fr":"L’inscription en ligne se fait sans justificatifs ; nous avons besoin des CIN des membres pour saisir les informations."}
  ]$j$::jsonb
where id = 'c58d279b-b109-4aee-88f8-86a49ddbe87f';

-- ---------------------------------------------------------------- Aide sociale directe
update public.services set
  faq = $j$[
    {"q_ar":"ما شروط طلب الدعم الاجتماعي المباشر؟","a_ar":"حسب البوابة الرسمية: التسجيل في السجل الوطني للسكان RNP، ثم في السجل الاجتماعي الموحد RSU، وإذا كان مؤشر الأسرة أقل من عتبة الاستحقاق (9,743001) يُودَع الطلب عبر منصة asd.ma.","q_fr":"Quelles conditions ?","a_fr":"Inscription au RNP puis au RSU ; si l’indice du ménage est inférieur au seuil (9,743001), dépôt de la demande sur asd.ma."},
    {"q_ar":"ما المعلومات التي يجب أن أحضرها؟","a_ar":"رقم البطاقة الوطنية لرب الأسرة؛ المعرّف الرقمي المدني والاجتماعي لرب الأسرة ولكل فرد (الزوج أو الأزواج، الأطفال، والمواليد الجدد)؛ رمز مسار للأطفال المتمدرسين ورمز المتدرب لمن يتابعون التكوين المهني؛ ورقم حساب رب الأسرة لدى بنك أو مؤسسة أداء معتمدة.","q_fr":"Quelles informations apporter ?","a_fr":"N° CIN du chef de ménage ; IDCS de chaque membre (conjoint(s), enfants, nouveau-nés) ; code Massar des enfants scolarisés ; RIB/compte du chef de ménage auprès d’une banque ou d’un établissement de paiement agréé."},
    {"q_ar":"لست مسجلاً في RSU بعد، ماذا أفعل؟","a_ar":"نبدأ بتسجيلك في السجل الوطني للسكان ثم السجل الاجتماعي الموحد (خدمة متوفرة عندنا)، ثم نودع طلب الدعم إن كان مؤشرك يسمح.","q_fr":"Pas encore inscrit au RSU ?","a_fr":"Nous commençons par le RNP puis le RSU, puis la demande d’aide si l’indice le permet."},
    {"q_ar":"تنبيه مهم","a_ar":"حسب المادة 18 من القانون 72.18، يُعاقَب كل من قدّم تصريحاً كاذباً بسوء نية للاستفادة من برامج الدعم. المرجو تقديم معلومات صحيحة فقط.","q_fr":"Avertissement","a_fr":"Selon l’article 18 de la loi 72.18, toute fausse déclaration de mauvaise foi est sanctionnée."}
  ]$j$::jsonb
where id = 'b4daba7e-6de5-48f7-9c0a-a57cfe691d47';

-- ---------------------------------------------------------------- Minhaty
update public.services set
  faq = $j$[
    {"q_ar":"من يحق له طلب المنحة؟","a_ar":"حسب بوابة منحتي: المغاربة المتمدرسون والأحرار الحاصلون على البكالوريا (مغربية أو أجنبية) للسنة الدراسية الحالية، والذين تقل أعمارهم عن 26 سنة بتاريخ اجتياز الدورة العادية للبكالوريا.","q_fr":"Qui peut demander la bourse ?","a_fr":"Les bacheliers marocains (bac marocain ou étranger) de l’année en cours, âgés de moins de 26 ans à la date de la session normale."},
    {"q_ar":"ما الشروط قبل إيداع الطلب؟","a_ar":"التسجيل في السجل الوطني للسكان والسجل الاجتماعي الموحد للتلميذ وأسرته، على أن يكون التسجيل في السجل الاجتماعي الموحد قبل 24 ساعة على الأقل من الإيداع. كما أن توفر التلميذ على البطاقة الوطنية الإلكترونية شرط أساسي.","q_fr":"Prérequis ?","a_fr":"Inscription au RNP et au RSU (élève et famille), au moins 24 h avant le dépôt ; CNIE obligatoire pour l’élève."},
    {"q_ar":"هل يمكن تعديل الطلب بعد إرساله؟","a_ar":"لا، بعد التأكيد النهائي لا يمكن تعديل الطلب، لذلك نراجع معك كل المعلومات قبل التأكيد.","q_fr":"Peut-on modifier après validation ?","a_fr":"Non ; nous vérifions toutes les informations avec vous avant de valider."},
    {"q_ar":"ضاع مني رمز مسار، ماذا أفعل؟","a_ar":"اتصل بإدارة المؤسسة التي درست بها هذه السنة. بالنسبة للأحرار وحاملي البكالوريا الأجنبية: المديرية الإقليمية للتربية الوطنية.","q_fr":"Code Massar perdu ?","a_fr":"Contactez votre établissement ; pour les candidats libres et bac étranger : la direction provinciale de l’éducation."},
    {"q_ar":"كيف أعرف النتيجة؟","a_ar":"تُعلن قرارات اللجنة عبر البوابة في خدمة «تتبع الطلب»، باستعمال القن السري الموجود في وصل الإيداع. احتفظ بالوصل الذي نسلّمه لك. البوابة تُفتح في فترة محددة كل سنة.","q_fr":"Comment connaître le résultat ?","a_fr":"Sur le portail, rubrique « Suivi de la demande », avec le code du reçu de dépôt (gardez-le). Le dépôt n’est ouvert qu’à une période fixée chaque année."}
  ]$j$::jsonb
where id = 'a328e47b-e904-4b0a-bd3b-f8ecd50380ea';
