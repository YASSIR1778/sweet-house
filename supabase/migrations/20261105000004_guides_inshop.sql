-- Guides for the two in-shop services (no official portal)
insert into public.service_guides (service_id, steps, tips_ar, require_ref) values
((select id from services where system_key='custom_request'), $j$[
 {"title":"اقرأ ما كتبه الزبون والوثائق المرفوعة، واتصل به إن لم يكن الطلب واضحاً","required":true},
 {"title":"حدّد السعر والمدة واحفظ السعر في «الأداء»، ثم أرسله للزبون على واتساب","required":true},
 {"title":"إن كانت الخدمة موجودة في القائمة: اتبع دليلها. وإن تكررت هذه الطلبات: اقترح إضافتها كخدمة جديدة","required":true}
]$j$, 'لا تبدأ الإنجاز قبل موافقة الزبون على السعر.', false),
((select id from services where system_key='school_list'), $j$[
 {"title":"افتح صورة اللائحة وتأكد أنها واضحة وكاملة (المستوى والمؤسسة)","required":true},
 {"title":"اضغط «تحضير الطلب في سلة نقطة البيع» وامسح المنتجات حسب الجودة المطلوبة","required":true},
 {"title":"أرسل الثمن للزبون من نقطة البيع، وعلّق السلة حتى يأتي أو تُرسل الطلبية","required":true},
 {"title":"عند الأداء يُغلق الطلب تلقائياً من البيع","required":true}
]$j$, 'المنتجات غير المتوفرة: اقترح بديلاً للزبون قبل إرسال الثمن.', false)
on conflict (service_id) do nothing;
