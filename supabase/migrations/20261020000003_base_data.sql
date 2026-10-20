-- =====================================================================
-- Sweet House — base data: permissions, roles, settings, sequences,
-- counter services and administrative e-services (all editable later).
-- Prices of 0 mean "to be set by the owner from the dashboard".
-- =====================================================================

insert into public.permissions (key, group_key, name_ar, name_fr, sort) values
  -- البيع
  ('pos.sell',             'pos',       'البيع في نقطة البيع',          'Vendre au point de vente', 10),
  ('pos.discount',         'pos',       'إجراء تخفيض',                  'Appliquer une remise', 11),
  ('pos.price_override',   'pos',       'تعديل السعر عند البيع',          'Modifier le prix à la vente', 12),
  ('pos.credit_sale',      'pos',       'البيع بالدَّين',                  'Vendre à crédit', 13),
  ('pos.refund',           'pos',       'إرجاع السلع',                   'Effectuer un retour', 14),
  ('pos.void',             'pos',       'إلغاء بيع',                     'Annuler une vente', 15),
  ('pos.reprint',          'pos',       'إعادة طباعة الوصولات',           'Réimprimer les tickets', 16),
  ('pos.invoice',          'pos',       'إنشاء فاتورة رسمية',             'Créer une facture', 17),
  -- الصندوق
  ('cash.shift',           'cash',      'فتح وإغلاق الوردية',             'Ouvrir / clôturer la caisse', 20),
  ('cash.view_expected',   'cash',      'رؤية المبلغ المتوقع في الصندوق',  'Voir le montant attendu', 21),
  ('cash.expense',         'cash',      'تسجيل مصروف من الدرج',           'Dépense depuis la caisse', 22),
  ('cash.owner_withdrawal','cash',      'تسجيل سحب المالك',              'Retrait du propriétaire', 23),
  -- رياض
  ('riyad.fee',            'riyad',     'تسجيل رسوم رياض',               'Saisir les frais Riyad', 30),
  ('riyad.credit',         'riyad',     'رياض بالدَّين',                   'Riyad à crédit', 31),
  ('riyad.view_balance',   'riyad',     'رؤية رصيد منصة رياض',           'Voir le solde Riyad', 32),
  ('riyad.manage',         'riyad',     'تعبئة الرصيد والعمولات',         'Recharges et commissions', 33),
  -- المنتجات
  ('products.view_cost',   'products',  'رؤية ثمن الشراء',               'Voir le prix d''achat', 40),
  ('products.manage',      'products',  'إضافة وتعديل المنتجات',          'Gérer les produits', 41),
  ('products.delete',      'products',  'حذف المنتجات',                  'Supprimer des produits', 42),
  ('services.manage',      'products',  'إدارة الخدمات',                 'Gérer les services', 43),
  ('stock.adjust',         'products',  'تعديل المخزون',                 'Ajuster le stock', 44),
  ('stock.inventory',      'products',  'الجرد',                         'Inventaire', 45),
  ('labels.print',         'products',  'طباعة الملصقات',                'Imprimer les étiquettes', 46),
  -- المشتريات
  ('purchases.manage',     'purchases', 'تسجيل المشتريات',               'Gérer les achats', 50),
  ('suppliers.pay',        'purchases', 'تسديد الموردين',                'Payer les fournisseurs', 51),
  -- الزبائن
  ('customers.manage',     'customers', 'إدارة الزبائن',                 'Gérer les clients', 60),
  ('debts.collect',        'customers', 'تسجيل تسديد دين',               'Encaisser une dette', 61),
  ('debts.remind',         'customers', 'إرسال تذكير بالدَّين',             'Envoyer un rappel', 62),
  -- الطلبات
  ('orders.manage',        'orders',    'إدارة طلبات المتجر',             'Gérer les commandes', 70),
  ('requests.manage',      'orders',    'إدارة طلبات الخدمات',            'Gérer les demandes de services', 71),
  ('payments.confirm_transfer','orders','تأكيد التحويلات البنكية',         'Confirmer les virements', 72),
  ('requests.view_documents','orders',  'رؤية وثائق الزبائن',             'Voir les documents clients', 73),
  -- التقارير
  ('reports.sales',        'reports',   'تقارير المبيعات',               'Rapports des ventes', 80),
  ('reports.profit',       'reports',   'الأرباح',                       'Bénéfices', 81),
  ('reports.shifts',       'reports',   'الورديات السابقة',               'Historique des caisses', 82),
  ('reports.employees',    'reports',   'أداء الموظفين',                 'Performance des employés', 83),
  -- الإدارة
  ('admin.access',         'admin',     'الدخول إلى لوحة التحكم',         'Accès au tableau de bord', 90),
  ('employees.manage',     'admin',     'الموظفون والرواتب والأدوار',      'Employés, salaires et rôles', 91),
  ('expenses.manage',      'admin',     'المصاريف',                      'Dépenses', 92),
  ('website.edit',         'admin',     'تعديل الموقع',                  'Modifier le site', 93),
  ('settings.manage',      'admin',     'الإعدادات والأجهزة',             'Paramètres et appareils', 94),
  ('trash.manage',         'admin',     'سلة المهملات',                  'Corbeille', 95),
  ('logs.view',            'admin',     'سجل النشاطات',                  'Journal d''activité', 96);

insert into public.roles (name_ar, name_fr, description, color, is_owner, permissions, max_discount_percent) values
  ('المالك', 'Propriétaire', 'كل الصلاحيات', '#FF6B35', true, '{}', 100),
  ('مسيّر', 'Gérant', 'تسيير المحل اليومي', '#2563EB', false, array[
    'pos.sell','pos.discount','pos.price_override','pos.credit_sale','pos.refund','pos.void','pos.reprint','pos.invoice',
    'cash.shift','cash.view_expected','cash.expense',
    'riyad.fee','riyad.credit','riyad.view_balance',
    'products.manage','services.manage','stock.adjust','stock.inventory','labels.print',
    'purchases.manage','customers.manage','debts.collect','debts.remind',
    'orders.manage','requests.manage','payments.confirm_transfer','requests.view_documents',
    'reports.sales','reports.shifts','admin.access'], 15),
  ('بائع', 'Vendeur', 'البيع والخدمات', '#16A34A', false, array[
    'pos.sell','pos.discount','pos.credit_sale','pos.refund','pos.reprint',
    'cash.shift','riyad.fee','riyad.credit','debts.collect','debts.remind',
    'requests.manage','requests.view_documents'], 5);

insert into public.document_sequences (key, prefix, next_value, padding, yearly_reset) values
  ('receipt',     'T',            1, 6, false),
  ('invoice',     'F-{YYYY}-',    1, 4, true),
  ('credit_note', 'AV-{YYYY}-',   1, 4, true),
  ('order',       'CMD-',         1, 5, false),
  ('request',     'SH-',          1, 5, false),
  ('purchase',    'ACH-',         1, 5, false);

insert into public.settings (key, value, is_public) values
  ('store', jsonb_build_object(
     'name_ar', 'مكتبة سويت هاوس', 'name_fr', 'Librairie Sweet House',
     'tagline_ar', 'مكتبتك وخدماتك الإدارية في مكان واحد',
     'tagline_fr', 'Votre librairie et vos services administratifs au même endroit',
     'phone', '+212697740298', 'whatsapp', '212697740298', 'email', '',
     'address_ar', 'تطوان', 'address_fr', 'Tétouan', 'city', 'Tétouan',
     'maps_url', 'https://share.google/cQ3fXIdbpL3ifV2wU',
     'logo_url', null,
     'hours', jsonb_build_array(
       jsonb_build_object('day', 1, 'open', '09:00', 'close', '21:00'),
       jsonb_build_object('day', 2, 'open', '09:00', 'close', '21:00'),
       jsonb_build_object('day', 3, 'open', '09:00', 'close', '21:00'),
       jsonb_build_object('day', 4, 'open', '09:00', 'close', '21:00'),
       jsonb_build_object('day', 5, 'open', '09:00', 'close', '21:00'),
       jsonb_build_object('day', 6, 'open', '09:00', 'close', '21:00'),
       jsonb_build_object('day', 0, 'open', null, 'close', null)),
     'socials', jsonb_build_object('facebook', '', 'instagram', '', 'tiktok', '')), true),
  ('legal', jsonb_build_object(
     'company_name', '', 'ice', '', 'if', '', 'rc', '', 'patente', '', 'cnss', '',
     'default_tax_rate', 20, 'tax_rates', jsonb_build_array(0, 7, 10, 14, 20)), true),
  ('cash', jsonb_build_object(
     'opening_float', 100000, 'blind_count', true, 'diff_alert', 2000, 'auto_lock_minutes', 5), false),
  ('pos', jsonb_build_object(
     'allow_negative_stock', true, 'sound', true, 'auto_print', true, 'quick_cash', jsonb_build_array(2000, 5000, 10000, 20000)), false),
  ('riyad', jsonb_build_object('low_balance_alert', 200000), false),
  ('receipt', jsonb_build_object(
     'show_logo', true, 'show_legal', true, 'show_qr', true, 'show_employee', true,
     'header_ar', '', 'header_fr', '',
     'footer_ar', 'شكراً لزيارتكم 🌟', 'footer_fr', 'Merci de votre visite',
     'languages', 'both'), false),
  ('invoice', jsonb_build_object(
     'notes_ar', '', 'notes_fr', '', 'bank_name', '', 'rib', '', 'payment_terms_fr', 'Paiement à réception'), false),
  ('delivery', jsonb_build_object(
     'enabled', true, 'cod', true, 'default_price', 3500, 'free_above', null,
     'zones', jsonb_build_array(
       jsonb_build_object('city', 'Tétouan', 'city_ar', 'تطوان', 'price', 1500),
       jsonb_build_object('city', 'Martil', 'city_ar', 'مرتيل', 'price', 2000),
       jsonb_build_object('city', 'M''diq', 'city_ar', 'المضيق', 'price', 2000),
       jsonb_build_object('city', 'Fnideq', 'city_ar', 'الفنيدق', 'price', 2500))), true),
  ('online_payments', jsonb_build_object(
     'cod', true, 'in_store', true, 'bank_transfer', true, 'bank_name', '', 'rib', '', 'account_holder', ''), true),
  ('whatsapp', jsonb_build_object(
     'mode', 'manual', 'number', '212697740298'), false),
  ('appearance', jsonb_build_object('default_theme', 'light'), true);

-- ---------------------------------------------------------------------
-- Counter services (shown as quick buttons in the POS)
-- ---------------------------------------------------------------------
with cat as (
  insert into public.service_categories (kind, name_ar, name_fr, icon, color, sort) values
    ('counter', 'الطباعة والنسخ', 'Impression & copie', 'printer', '#FF6B35', 1),
    ('counter', 'خدمات المكتب',  'Services bureautiques', 'scan-line', '#2563EB', 2),
    ('counter', 'رياض',          'Riyad', 'wallet', '#16A34A', 3)
  returning id, name_fr
)
insert into public.services (category_id, kind, system_key, name_ar, name_fr, pricing_mode, price, unit_ar, unit_fr,
                             icon, pos_quick, pos_color, pos_sort, is_online, sort)
select (select id from cat where name_fr = x.cat), 'counter', x.system_key, x.name_ar, x.name_fr, x.mode, x.price,
       x.unit_ar, x.unit_fr, x.icon, true, x.color, x.ord, x.online, x.ord
from (values
  ('Impression & copie', null, 'نسخ A4 أبيض وأسود',   'Copie A4 noir & blanc',      'tiered', 100, 'صفحة', 'page', 'copy', '#0F172A', 1, true),
  ('Impression & copie', null, 'نسخ A4 ملون',         'Copie A4 couleur',          'tiered', 300, 'صفحة', 'page', 'palette', '#FF6B35', 2, true),
  ('Impression & copie', null, 'طباعة A4 أبيض وأسود', 'Impression A4 noir & blanc', 'tiered', 100, 'صفحة', 'page', 'printer', '#0F172A', 3, true),
  ('Impression & copie', null, 'طباعة A4 ملونة',      'Impression A4 couleur',     'tiered', 300, 'صفحة', 'page', 'printer', '#FF6B35', 4, true),
  ('Services bureautiques', null, 'سكانر',            'Scan',                      'fixed', 200, 'صفحة', 'page', 'scan-line', '#2563EB', 5, true),
  ('Services bureautiques', null, 'تغليف بلاستيكي A4', 'Plastification A4',        'fixed', 500, 'ورقة', 'feuille', 'layers', '#7C3AED', 6, true),
  ('Riyad', 'riyad_fee', 'رسوم رياض',                 'Frais Riyad',               'open', 0, null, null, 'wallet', '#16A34A', 0, false)
) as x(cat, system_key, name_ar, name_fr, mode, price, unit_ar, unit_fr, icon, color, ord, online);

insert into public.service_price_tiers (service_id, min_qty, unit_price)
select s.id, t.min_qty, t.unit_price
from public.services s
join (values
  ('Copie A4 noir & blanc', 50, 75), ('Copie A4 noir & blanc', 100, 50),
  ('Impression A4 noir & blanc', 50, 75), ('Impression A4 noir & blanc', 100, 50),
  ('Copie A4 couleur', 20, 250), ('Impression A4 couleur', 20, 250)
) as t(name_fr, min_qty, unit_price) on t.name_fr = s.name_fr;

-- ---------------------------------------------------------------------
-- Administrative & electronic services
-- ---------------------------------------------------------------------
create temporary table _admin_cats (code text, name_ar text, name_fr text, icon text, color text, sort int) on commit drop;
insert into _admin_cats values
  ('justice',  'العدل',                       'Justice',                         'scale',          '#0F172A', 1),
  ('land',     'العقار والمحافظة العقارية',    'Foncier (ANCFCC)',                'landmark',       '#7C3AED', 2),
  ('business', 'التجارة والمقاولة',           'Commerce & entreprise',           'briefcase',      '#2563EB', 3),
  ('civil',    'الحالة المدنية',              'État civil',                      'baby',           '#DB2777', 4),
  ('appts',    'المواعيد',                    'Rendez-vous',                     'calendar-check', '#0891B2', 5),
  ('tax',      'الضرائب',                     'Impôts (DGI)',                    'receipt',        '#D97706', 6),
  ('traffic',  'السير والسيارات',             'Circulation & véhicules',         'car',            '#DC2626', 7),
  ('social',   'الضمان الاجتماعي والتغطية الصحية', 'CNSS & AMO',                  'heart-pulse',    '#16A34A', 8),
  ('support',  'الدعم الاجتماعي',             'Aides sociales',                  'hand-heart',     '#EA580C', 9),
  ('permits',  'الرخص',                       'Autorisations (Rokhas)',          'file-badge',     '#4F46E5', 10),
  ('edu',      'التعليم',                     'Enseignement',                    'graduation-cap', '#0D9488', 11),
  ('jobs',     'التشغيل والمباريات',          'Emploi & concours',               'user-search',    '#9333EA', 12),
  ('office',   'خدمات المكتب والكتابة',       'Rédaction & bureautique',         'pen-line',       '#475569', 13);

insert into public.service_categories (kind, name_ar, name_fr, icon, color, sort)
select 'admin', name_ar, name_fr, icon, color, sort from _admin_cats order by sort;

create temporary table _admin_services (
  cat text, name_ar text, name_fr text, desc_ar text, docs jsonb, fields jsonb, duration_ar text, duration_fr text, url text
) on commit drop;

insert into _admin_services values
  -- العدل
  ('justice', 'السجل العدلي (بطاقة السوابق)', 'Extrait du casier judiciaire',
   'طلب بطاقة السوابق العدلية إلكترونياً، مع إمكانية التوصل بها عبر البريد الإلكتروني لحاملي البطاقة الوطنية الجديدة.',
   '[{"name_ar":"صورة البطاقة الوطنية (الوجهان)","name_fr":"CIN recto-verso","required":true}]',
   '[{"key":"cin","label_ar":"رقم البطاقة الوطنية","label_fr":"N° CIN","type":"text","required":true},{"key":"email","label_ar":"البريد الإلكتروني","label_fr":"E-mail","type":"text","required":false}]',
   '24 - 72 ساعة', '24 - 72 h', 'https://casierjudiciaire.justice.gov.ma'),
  ('justice', 'تتبّع ملف قضائي', 'Suivi d''un dossier judiciaire',
   'الاطلاع على مآل ملف قضائي وتواريخ الجلسات عبر بوابة محاكم.',
   '[]',
   '[{"key":"file_number","label_ar":"رقم الملف","label_fr":"N° du dossier","type":"text","required":true},{"key":"court","label_ar":"المحكمة","label_fr":"Tribunal","type":"text","required":true}]',
   'فوري', 'Immédiat', 'https://www.mahakim.ma'),
  -- العقار
  ('land', 'شهادة الملكية', 'Certificat de propriété',
   'استخراج شهادة الملكية الخاصة بعقار محفظ من المحافظة العقارية.',
   '[{"name_ar":"صورة البطاقة الوطنية","name_fr":"CIN","required":true}]',
   '[{"key":"title_number","label_ar":"رقم الرسم العقاري","label_fr":"N° du titre foncier","type":"text","required":true},{"key":"conservation","label_ar":"المحافظة العقارية","label_fr":"Conservation foncière","type":"text","required":true}]',
   '24 - 48 ساعة', '24 - 48 h', 'https://www.ancfcc.gov.ma'),
  ('land', 'مذكرة المعلومات', 'Note de renseignements',
   'وثيقة تبين وضعية العقار ومعلوماته الأساسية.',
   '[{"name_ar":"صورة البطاقة الوطنية","name_fr":"CIN","required":true}]',
   '[{"key":"title_number","label_ar":"رقم الرسم العقاري","label_fr":"N° du titre foncier","type":"text","required":true}]',
   '24 - 48 ساعة', '24 - 48 h', 'https://www.ancfcc.gov.ma'),
  ('land', 'التصميم العقاري', 'Plan foncier',
   'الحصول على التصميم العقاري للرسم.',
   '[{"name_ar":"صورة البطاقة الوطنية","name_fr":"CIN","required":true}]',
   '[{"key":"title_number","label_ar":"رقم الرسم العقاري","label_fr":"N° du titre foncier","type":"text","required":true}]',
   '48 - 72 ساعة', '48 - 72 h', 'https://www.ancfcc.gov.ma'),
  ('land', 'تتبّع مطلب التحفيظ', 'Suivi de réquisition',
   'الاطلاع على مراحل مطلب التحفيظ العقاري.',
   '[]',
   '[{"key":"requisition","label_ar":"رقم المطلب","label_fr":"N° de réquisition","type":"text","required":true}]',
   'فوري', 'Immédiat', 'https://www.ancfcc.gov.ma'),
  -- التجارة
  ('business', 'الشهادة السلبية', 'Certificat négatif',
   'حجز اسم تجاري للشركة لدى المكتب المغربي للملكية الصناعية والتجارية.',
   '[{"name_ar":"صورة البطاقة الوطنية","name_fr":"CIN","required":true}]',
   '[{"key":"names","label_ar":"الأسماء المقترحة (3 أسماء)","label_fr":"Dénominations proposées (3)","type":"textarea","required":true},{"key":"activity","label_ar":"النشاط","label_fr":"Activité","type":"text","required":true}]',
   '24 - 72 ساعة', '24 - 72 h', 'https://www.directinfo.ma'),
  ('business', 'نموذج 7 (السجل التجاري)', 'Modèle 7 (registre de commerce)',
   'شهادة التقييد في السجل التجاري.',
   '[]',
   '[{"key":"rc","label_ar":"رقم السجل التجاري","label_fr":"N° RC","type":"text","required":true},{"key":"court","label_ar":"المحكمة","label_fr":"Tribunal","type":"text","required":true}]',
   '24 - 48 ساعة', '24 - 48 h', 'https://www.directinfo.ma'),
  ('business', 'إنشاء شركة', 'Création d''entreprise',
   'مواكبة إنشاء الشركة إلكترونياً من الشهادة السلبية إلى السجل التجاري.',
   '[{"name_ar":"البطاقة الوطنية للشركاء","name_fr":"CIN des associés","required":true},{"name_ar":"عقد الكراء أو التوطين","name_fr":"Bail ou domiciliation","required":true}]',
   '[{"key":"company_type","label_ar":"نوع الشركة","label_fr":"Forme juridique","type":"select","required":true,"options":["SARL","SARL AU","SNC"]},{"key":"activity","label_ar":"النشاط","label_fr":"Activité","type":"text","required":true}]',
   '7 - 15 يوماً', '7 - 15 jours', null),
  ('business', 'التسجيل كمقاول ذاتي', 'Inscription auto-entrepreneur',
   'التسجيل في منظومة المقاول الذاتي والحصول على البطاقة.',
   '[{"name_ar":"صورة البطاقة الوطنية","name_fr":"CIN","required":true}]',
   '[{"key":"activity","label_ar":"النشاط","label_fr":"Activité","type":"text","required":true},{"key":"email","label_ar":"البريد الإلكتروني","label_fr":"E-mail","type":"text","required":true}]',
   '3 - 7 أيام', '3 - 7 jours', 'https://ae.gov.ma'),
  ('business', 'التصريح برقم المعاملات (مقاول ذاتي)', 'Déclaration du chiffre d''affaires (AE)',
   'التصريح الفصلي برقم المعاملات وأداء الضريبة.',
   '[]',
   '[{"key":"ae_number","label_ar":"رقم المقاول الذاتي","label_fr":"N° auto-entrepreneur","type":"text","required":true},{"key":"amount","label_ar":"رقم المعاملات","label_fr":"Chiffre d''affaires","type":"number","required":true}]',
   'فوري', 'Immédiat', 'https://ae.gov.ma'),
  -- الحالة المدنية
  ('civil', 'نسخة من عقد الازدياد', 'Extrait d''acte de naissance',
   'طلب نسخة موجزة من رسم الولادة عبر منصة وثيقة.',
   '[{"name_ar":"صورة البطاقة الوطنية","name_fr":"CIN","required":false}]',
   '[{"key":"full_name","label_ar":"الاسم الكامل","label_fr":"Nom complet","type":"text","required":true},{"key":"birth_date","label_ar":"تاريخ الازدياد","label_fr":"Date de naissance","type":"date","required":true},{"key":"birth_place","label_ar":"مكان الازدياد","label_fr":"Lieu de naissance","type":"text","required":true},{"key":"act_number","label_ar":"رقم الرسم","label_fr":"N° de l''acte","type":"text","required":false}]',
   '3 - 10 أيام', '3 - 10 jours', 'https://www.watiqa.ma'),
  -- المواعيد
  ('appts', 'موعد جواز السفر', 'Rendez-vous passeport',
   'ملء الاستمارة وأداء الطابع الإلكتروني وأخذ موعد إيداع ملف جواز السفر.',
   '[{"name_ar":"صورة البطاقة الوطنية","name_fr":"CIN","required":true}]',
   '[{"key":"type","label_ar":"نوع الطلب","label_fr":"Type","type":"select","required":true,"options":["جديد / Nouveau","تجديد / Renouvellement"]}]',
   'نفس اليوم', 'Le jour même', 'https://www.passeport.ma'),
  ('appts', 'موعد البطاقة الوطنية', 'Rendez-vous CNIE',
   'ملء الاستمارة القبلية وأخذ موعد للبطاقة الوطنية الإلكترونية.',
   '[]',
   '[{"key":"type","label_ar":"نوع الطلب","label_fr":"Type","type":"select","required":true,"options":["أول مرة / Première","تجديد / Renouvellement","ضياع / Perte"]}]',
   'نفس اليوم', 'Le jour même', 'https://www.cnie.ma'),
  ('appts', 'موعد رخصة السياقة / البطاقة الرمادية', 'RDV permis / carte grise (NARSA)',
   'أخذ موعد لدى الوكالة الوطنية للسلامة الطرقية.',
   '[{"name_ar":"صورة البطاقة الوطنية","name_fr":"CIN","required":true}]',
   '[{"key":"service","label_ar":"الخدمة","label_fr":"Prestation","type":"text","required":true}]',
   'نفس اليوم', 'Le jour même', 'https://www.narsa.ma'),
  ('appts', 'موعد التأشيرة', 'Rendez-vous visa',
   'ملء استمارة التأشيرة وأخذ الموعد لدى مركز الطلبات.',
   '[{"name_ar":"جواز السفر","name_fr":"Passeport","required":true}]',
   '[{"key":"country","label_ar":"الدولة","label_fr":"Pays","type":"text","required":true},{"key":"visa_type","label_ar":"نوع التأشيرة","label_fr":"Type de visa","type":"text","required":true}]',
   'حسب التوفر', 'Selon disponibilité', null),
  -- الضرائب
  ('tax', 'التعريف الضريبي', 'Identifiant fiscal',
   'طلب التعريف الضريبي لدى المديرية العامة للضرائب.',
   '[{"name_ar":"صورة البطاقة الوطنية","name_fr":"CIN","required":true}]',
   '[]', '3 - 7 أيام', '3 - 7 jours', 'https://www.tax.gov.ma'),
  ('tax', 'شهادة الوضعية الجبائية', 'Attestation de régularité fiscale',
   'استخراج شهادة الوضعية الجبائية عبر الخدمات الإلكترونية للضرائب.',
   '[]',
   '[{"key":"if","label_ar":"التعريف الضريبي","label_fr":"Identifiant fiscal","type":"text","required":true}]',
   '24 - 48 ساعة', '24 - 48 h', 'https://www.tax.gov.ma'),
  ('tax', 'التصريح بالدخل', 'Déclaration de revenus',
   'إعداد وإيداع التصريح السنوي بالدخل.',
   '[{"name_ar":"الوثائق المتعلقة بالدخل","name_fr":"Justificatifs de revenus","required":true}]',
   '[{"key":"if","label_ar":"التعريف الضريبي","label_fr":"Identifiant fiscal","type":"text","required":true}]',
   '24 - 72 ساعة', '24 - 72 h', 'https://www.tax.gov.ma'),
  ('tax', 'الضريبة على السيارات (الفينييت)', 'Vignette automobile',
   'أداء الضريبة السنوية على السيارات والحصول على الوصل.',
   '[{"name_ar":"البطاقة الرمادية","name_fr":"Carte grise","required":true}]',
   '[{"key":"plate","label_ar":"رقم التسجيل","label_fr":"Immatriculation","type":"text","required":true}]',
   'فوري', 'Immédiat', 'https://www.tax.gov.ma'),
  -- السير
  ('traffic', 'مخالفات الرادار والأداء', 'Amendes radar',
   'الاطلاع على المخالفات المسجلة بالرادار وأداؤها.',
   '[]',
   '[{"key":"plate","label_ar":"رقم التسجيل","label_fr":"Immatriculation","type":"text","required":true},{"key":"cin","label_ar":"رقم البطاقة الوطنية","label_fr":"N° CIN","type":"text","required":true}]',
   'فوري', 'Immédiat', null),
  -- الضمان الاجتماعي
  ('social', 'التسجيل في CNSS', 'Immatriculation CNSS',
   'تسجيل أجير أو مشغّل في الصندوق الوطني للضمان الاجتماعي.',
   '[{"name_ar":"صورة البطاقة الوطنية","name_fr":"CIN","required":true}]',
   '[]', '3 - 7 أيام', '3 - 7 jours', 'https://www.cnss.ma'),
  ('social', 'التصريح بالأجراء (Damancom)', 'Déclaration des salaires (Damancom)',
   'إعداد التصريح الشهري بالأجور وأدائه.',
   '[]',
   '[{"key":"affiliation","label_ar":"رقم الانخراط","label_fr":"N° d''affiliation","type":"text","required":true}]',
   'فوري', 'Immédiat', 'https://www.damancom.ma'),
  ('social', 'التأمين الإجباري عن المرض (AMO)', 'AMO — Assurance maladie',
   'التسجيل في التأمين الإجباري الأساسي عن المرض وتحيين المعطيات.',
   '[{"name_ar":"صورة البطاقة الوطنية","name_fr":"CIN","required":true}]',
   '[]', '24 - 72 ساعة', '24 - 72 h', 'https://www.cnss.ma'),
  ('social', 'ملف التعويض عن المرض', 'Dossier de remboursement maladie',
   'إيداع وتتبع ملف استرجاع مصاريف العلاج.',
   '[{"name_ar":"ورقة العلاج والوصفة","name_fr":"Feuille de soins et ordonnance","required":true}]',
   '[]', 'حسب الصندوق', 'Selon la caisse', 'https://www.cnss.ma'),
  -- الدعم الاجتماعي
  ('support', 'السجل الاجتماعي الموحد (RSU)', 'Registre social unifié (RSU)',
   'التسجيل في السجل الاجتماعي الموحد ومعرفة المؤشر.',
   '[{"name_ar":"البطاقة الوطنية لأفراد الأسرة","name_fr":"CIN des membres du foyer","required":true}]',
   '[]', '24 - 72 ساعة', '24 - 72 h', 'https://www.rsu.ma'),
  ('support', 'الدعم الاجتماعي المباشر', 'Aide sociale directe',
   'إيداع طلب الاستفادة من الدعم الاجتماعي المباشر وتتبعه.',
   '[{"name_ar":"صورة البطاقة الوطنية","name_fr":"CIN","required":true}]',
   '[]', '24 - 72 ساعة', '24 - 72 h', 'https://www.asd.ma'),
  ('support', 'دعم السكن', 'Aide au logement',
   'إيداع طلب الاستفادة من الدعم المباشر لاقتناء السكن.',
   '[{"name_ar":"صورة البطاقة الوطنية","name_fr":"CIN","required":true}]',
   '[]', '24 - 72 ساعة', '24 - 72 h', null),
  -- الرخص
  ('permits', 'رخصة البناء', 'Permis de construire',
   'إيداع وتتبّع طلب رخصة البناء عبر منصة رخص.',
   '[{"name_ar":"التصاميم","name_fr":"Plans","required":true},{"name_ar":"شهادة الملكية","name_fr":"Certificat de propriété","required":true}]',
   '[]', 'حسب الجماعة', 'Selon la commune', 'https://www.rokhas.ma'),
  ('permits', 'الرخص الاقتصادية', 'Autorisations économiques',
   'طلب رخصة مزاولة نشاط تجاري أو مهني.',
   '[{"name_ar":"صورة البطاقة الوطنية","name_fr":"CIN","required":true},{"name_ar":"عقد الكراء","name_fr":"Contrat de bail","required":true}]',
   '[{"key":"activity","label_ar":"النشاط","label_fr":"Activité","type":"text","required":true}]',
   'حسب الجماعة', 'Selon la commune', 'https://www.rokhas.ma'),
  -- التعليم
  ('edu', 'التسجيل في المباريات', 'Inscription aux concours',
   'التسجيل في مباريات ولوج المعاهد والمدارس العليا.',
   '[{"name_ar":"صورة البطاقة الوطنية","name_fr":"CIN","required":true},{"name_ar":"شهادة الباكالوريا وكشف النقط","name_fr":"Bac et relevé de notes","required":true}]',
   '[{"key":"school","label_ar":"المؤسسة / المباراة","label_fr":"Établissement / concours","type":"text","required":true}]',
   'نفس اليوم', 'Le jour même', null),
  ('edu', 'التسجيل الجامعي', 'Inscription universitaire',
   'التسجيل القبلي في الجامعات.',
   '[{"name_ar":"صورة البطاقة الوطنية","name_fr":"CIN","required":true},{"name_ar":"شهادة الباكالوريا","name_fr":"Baccalauréat","required":true}]',
   '[{"key":"university","label_ar":"الجامعة والشعبة","label_fr":"Université et filière","type":"text","required":true}]',
   'نفس اليوم', 'Le jour même', null),
  ('edu', 'طلب المنحة (منحتي)', 'Demande de bourse (Minhaty)',
   'إيداع طلب المنحة الجامعية.',
   '[{"name_ar":"البطاقة الوطنية للطالب والأبوين","name_fr":"CIN de l''étudiant et des parents","required":true}]',
   '[]', 'نفس اليوم', 'Le jour même', 'https://www.minhaty.ma'),
  ('edu', 'الترشح الحر للباكالوريا', 'Candidature libre au baccalauréat',
   'التسجيل كمترشح حر لامتحان الباكالوريا.',
   '[{"name_ar":"صورة البطاقة الوطنية","name_fr":"CIN","required":true},{"name_ar":"صورة شمسية","name_fr":"Photo d''identité","required":true}]',
   '[]', 'نفس اليوم', 'Le jour même', null),
  ('edu', 'نتائج وخدمات مسار', 'Résultats et services Massar',
   'الاطلاع على النتائج والخدمات عبر منظومة مسار.',
   '[]',
   '[{"key":"massar","label_ar":"رمز مسار","label_fr":"Code Massar","type":"text","required":true}]',
   'فوري', 'Immédiat', null),
  -- التشغيل
  ('jobs', 'التسجيل في ANAPEC', 'Inscription ANAPEC',
   'إنشاء حساب باحث عن عمل لدى الوكالة الوطنية لإنعاش التشغيل.',
   '[{"name_ar":"صورة البطاقة الوطنية","name_fr":"CIN","required":true},{"name_ar":"السيرة الذاتية","name_fr":"CV","required":false}]',
   '[]', 'نفس اليوم', 'Le jour même', 'https://www.anapec.org'),
  ('jobs', 'مباريات الوظيفة العمومية', 'Concours de la fonction publique',
   'الترشح لمباريات التوظيف العمومي.',
   '[{"name_ar":"صورة البطاقة الوطنية","name_fr":"CIN","required":true},{"name_ar":"الشهادات","name_fr":"Diplômes","required":true}]',
   '[{"key":"concours","label_ar":"المباراة","label_fr":"Concours","type":"text","required":true}]',
   'نفس اليوم', 'Le jour même', 'https://www.emploi-public.ma'),
  -- المكتب
  ('office', 'السيرة الذاتية', 'Rédaction de CV',
   'تصميم سيرة ذاتية احترافية بالعربية أو الفرنسية.',
   '[{"name_ar":"صورة شمسية","name_fr":"Photo","required":false}]',
   '[{"key":"language","label_ar":"اللغة","label_fr":"Langue","type":"select","required":true,"options":["العربية","Français","English"]}]',
   '24 ساعة', '24 h', null),
  ('office', 'طلب خطي / رسالة إدارية', 'Demande / lettre administrative',
   'كتابة الطلبات والرسائل الإدارية.',
   '[]',
   '[{"key":"subject","label_ar":"الموضوع","label_fr":"Objet","type":"textarea","required":true}]',
   'نفس اليوم', 'Le jour même', null),
  ('office', 'شكاية عبر شكاية.ما', 'Réclamation (chikaya.ma)',
   'صياغة وإيداع شكاية لدى الإدارات العمومية.',
   '[]',
   '[{"key":"subject","label_ar":"موضوع الشكاية","label_fr":"Objet de la réclamation","type":"textarea","required":true}]',
   'نفس اليوم', 'Le jour même', 'https://www.chikaya.ma'),
  ('office', 'الكتابة على الحاسوب', 'Saisie de documents',
   'رقن الوثائق والبحوث وتنسيقها.',
   '[{"name_ar":"الوثيقة المراد رقنها","name_fr":"Document à saisir","required":true}]',
   '[]', 'حسب الحجم', 'Selon le volume', null);

insert into public.services (category_id, kind, name_ar, name_fr, description_ar, pricing_mode, price, tax_rate,
                             is_online, duration_ar, duration_fr, official_url, required_documents, fields, sort, icon)
select sc.id, 'admin', s.name_ar, s.name_fr, s.desc_ar, 'fixed', 0, 20, true,
       s.duration_ar, s.duration_fr, s.url, s.docs, s.fields,
       row_number() over (partition by s.cat order by s.name_ar), c.icon
from _admin_services s
join _admin_cats c on c.code = s.cat
join public.service_categories sc on sc.kind = 'admin' and sc.name_fr = c.name_fr;

-- Seed rows are not user activity.
delete from public.activity_log;
