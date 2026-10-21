// Smart agents (one job each), run by pg_cron, by a new online request, or by
// the owner ("run now"). Each run reads the shop data through a service-role
// RPC, adds the agent's persona, the owner's preferences, memory and past
// reactions, asks Claude for structured suggestions and stores them in
// agent_suggestions + one notification (skipped in quiet hours unless urgent).
// action "reply": the owner talks to an agent under one of its suggestions.
// Nothing is changed in the shop: the owner decides on every suggestion.
// Secret: ANTHROPIC_API_KEY. Cron/trigger calls carry x-agent-key (agent_secret).
import Anthropic from 'npm:@anthropic-ai/sdk'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminClient, callerClient, cors, fail, json } from '../_shared/common.ts'

type Agent = {
  key: string; name_ar: string; name_fr: string; enabled: boolean; model: string; monthly_runs: number; persona_name: string; avatar: string; personality: string
  thresholds: Record<string, unknown>; notify_mode: 'push' | 'brief' | 'none'; is_custom: boolean; custom_job: string | null; sources: string[]
}
type Prefs = { call_me?: string; language?: 'darija' | 'ar' | 'fr'; detail?: 'short' | 'long'; quiet_from?: string; quiet_to?: string; quiet_days?: number[] }
type Item = {
  severity: 'info' | 'warning' | 'danger'; title: string; body: string; link: string
  lines: { variant_id: string; name: string; qty: number; supplier: string; unit_cost_dh: number; why: string }[]
  messages: { to: 'customer' | 'staff'; name: string; phone: string; employee_id: string; text: string }[]
  assign_to: string
  descriptions: { product_id: string; name: string; desc_ar: string; desc_fr: string }[]
  posts: { channel: string; text: string; image_idea: string; link_path: string; link?: string; code?: string }[]
  offers: { title: string; description: string; code: string; channel: string; discount_pct: number; ends_on: string; why: string }[]
  plan: { week_start: string; theme: string; why: string; services: string[]; channels: string[]; offer: string }[]
}

const JOBS: Record<string, string> = {
  monitor: `مهمتك: مراقبة عمليات اليوم والبحث فقط عما يستحق انتباه المالك:
- تخفيضات كبيرة أو كثيرة لموظف معيّن، تغيير الأسعار يدوياً، بيع بأقل من التكلفة.
- إلغاءات وإرجاعات (خصوصاً بعد مدة طويلة من البيع أو بدون سبب واضح).
- فرق في الصندوق عند الإغلاق، تصحيحات الورديات، فرق رصيد رياض.
- ورديات مفتوحة منذ وقت طويل، نسيان تسجيل الخروج، خروج نقود كبير من الصندوق.
- يوم ضعيف جداً أو قوي جداً مقارنة بالمعدل.
لا تذكر ما هو عادي. إن كان اليوم عادياً أرجع items فارغة مع summary يطمئن المالك.
link من: /sales /shifts /riyad /reports /employees /attendance.`,
  purchases: `مهمتك: اقتراح ماذا يشتري المالك هذا الأسبوع وكم.
- من sold_30d و sold_7d احسب سرعة البيع، ومن stock و days_of_cover كم يكفي المخزون.
- اقترح كمية تكفي 3 أسابيع إلى شهر، مدوّرة لعدد مناسب، ولا تقترح ما يكفي أكثر من 3 أسابيع.
- انتبه للموسم: الدخول المدرسي (غشت–شتنبر)، رمضان، الامتحانات.
- item واحد لكل مورد (العنوان: اسم المورد)، و item لمنتجات بدون مورد معروف. استعمل lines.
- variant_id كما في البيانات، تكلفة الوحدة بالدرهم (0 إن لم تُعرف)، وسبب قصير.
- body: المجموع التقريبي وأهم ملاحظة. link: /purchases.`,
  followup: `مهمتك: المتابعة حتى لا يُنسى أحد.
- طلبات قريبة من التأخر أو متأخرة: item لكل طلب مهم، مع messages إلى الموظف المكلف (to=staff, employee_id) بنص تذكير قصير ولطيف. إن لم يكن مكلفاً أحد قل ذلك في body.
- وثائق جاهزة لم تُستلم منذ أيام: messages إلى الزبون (to=customer, phone) برسالة مهذبة بالعربية تذكره بالاستلام ورقم الطلب.
- ديون قديمة: messages للزبون برسالة تذكير مهذبة جداً بالمبلغ بالدرهم، بدون تهديد.
- طلبات مساعدة تنتظر: item يذكّر المالك، و messages للزبون إن كان مفيداً.
جمّع المتشابه في item واحد إن كان العدد كبيراً. link من: /requests /customers /help.`,
  requests: `مهمتك: مراجعة طلب خدمة جديد وصل من الموقع (المعلومات المكتوبة وأسماء الملفات فقط، لا ترى الوثائق).
- هل المعلومات المطلوبة للخدمة كاملة؟ هل فيها خطأ واضح (رقم بطاقة بشكل غير معتاد، تاريخ غير منطقي، اسم ناقص، هاتف غير صالح)؟
- هل رُفعت الوثائق المطلوبة (حسب أسماء الملفات وعددها)؟
- اقترح من يتكفل به في assign_to (id موظف من staff_load: الأقل انشغالاً، ويفضّل من في وردية مفتوحة)، أو اتركه فارغاً.
- إن نقص شيء: messages إلى الزبون (to=customer) برسالة مهذبة قصيرة تطلب ما ينقص مع رقم الطلب.
أرجع item واحداً فقط. severity: warning إن نقص شيء، info إن كان كل شيء سليماً. link: /requests.`,
  content: `مهمتك: أوصاف المنتجات.
- descriptions: لكل منتج بدون وصف، وصف قصير جذاب بالعربية (2-3 جمل) وبالفرنسية، صادق وبدون مبالغة ولا وعود.
أرجع item واحداً للأوصاف (link /products). المنشورات ليست من عملك.`,
  planner: `مهمتك: رزنامة التسويق للأسابيع الأربعة القادمة.
- اعرف الموسم من التاريخ: الدخول المدرسي (منتصف غشت – شتنبر)، الامتحانات والباكالوريا (ماي – يونيو)، صيف مغاربة العالم (يونيو – غشت)، رمضان والعيد، آجال الضرائب والـ CNSS، نهاية السنة، عطل المدارس.
- لكل أسبوع موضوع واحد قوي (theme) مرتبط بخدمات أو منتجات موجودة فعلاً في البيانات، وسبب اختياره (why)، والقنوات المناسبة، وفكرة عرض إن كانت مفيدة.
- استفد من performance_30d: كرر ما جلب زبائن، وخفف ما لم ينجح.
- plan: 4 أسابيع، week_start بصيغة YYYY-MM-DD (يوم الإثنين).
أرجع item واحداً: title «خطة الأسابيع القادمة»، body ملخص قصير، link /agents، وفيه plan.`,
  facebook: `مهمتك: منشورات فيسبوك لصفحة المحل.
- اتبع موضوع الأسبوع الحالي في plan. إن لم توجد خطة اختر خدمة أو منتجاً مناسباً للموسم.
- اكتب بالدارجة المغربية بحروف عربية، كأنك جار في الحي: سطر أول يشد الانتباه، ثم الفائدة، ثم الثمن والمدة إن وُجدا، ثم دعوة واضحة (اطلب من الموقع / مرّ علينا / واتساب).
- لا تكرر recent_posts_this_channel. منشور واحد على الأقل يكون نصيحة مفيدة بدون بيع مباشر.
- posts: channel=facebook، text جاهز للنسخ (بدون الرابط، سنضيفه نحن)، image_idea وصف صورة بسيطة يمكن تصويرها في المحل، link_path الصفحة التي يذهب إليها الزبون.
أرجع item واحداً فيه المنشورات. link /agents.`,
  instagram: `مهمتك: إنستغرام.
- اتبع موضوع الأسبوع في plan. ركّز على ما هو جميل بصرياً: الأدوات المدرسية، الهدايا، المحل، و«كاروسيل» الوثائق المطلوبة لخدمة.
- text: جمل قصيرة، إيموجي باعتدال، 5 إلى 8 هاشتاغات محلية في النهاية (#تطوان #tetouan …).
- image_idea: وصف دقيق للصورة أو الشرائح (للكاروسيل: شريحة 1، شريحة 2…) أو الستوري.
- posts: channel=instagram. لا تكرر recent_posts_this_channel. link_path الصفحة المناسبة.
أرجع item واحداً فيه المنشورات. link /agents.`,
  tiktok: `مهمتك: سيناريوهات تيك توك قصيرة (20 إلى 40 ثانية) تصوّرها الموظفة بالهاتف بدون معدات.
- اتبع موضوع الأسبوع في plan. أفكار ناجحة: «3 أخطاء فـ…»، «شنو خاصك باش…»، كواليس المحل، قبل/بعد.
- text: السيناريو كاملاً: [0-3 ث] الجملة التي تشد الانتباه، ثم المشاهد مرقمة مع الكلام، ثم الدعوة في النهاية، ثم الهاشتاغات.
- image_idea: أين وكيف يُصوَّر (زاوية الهاتف، ما يظهر في الإطار).
- posts: channel=tiktok. link_path للصفحة المذكورة في الفيديو.
أرجع item واحداً فيه السيناريوهات. link /agents.`,
  whatsapp: `مهمتك: رسائل قائمة البث على واتساب.
- رسالة لكل شريحة مفيدة الآن حسب broadcast.topics والموسم وplan (مثلاً أولياء الأمور قبل الدخول المدرسي، مغاربة العالم قبل الصيف).
- text: قصيرة (4 إلى 6 أسطر)، شخصية ومهذبة، لها سبب واضح، وفي آخرها: «لإلغاء الاشتراك أرسل STOP».
- اذكر في image_idea اسم الشريحة المستهدفة.
- posts: channel=whatsapp. link_path الصفحة المناسبة.
لا ترسل أكثر من رسالتين في الأسبوع لنفس الشريحة. أرجع item واحداً. link /broadcasts.`,
  offers: `مهمتك: عروض رابحة.
- اقترح 1 إلى 3 عروض: باقة منتجات تُباع معاً، تصريف stale_products بثمن يبقى فوق التكلفة، خدمتان معاً، أو عرض موسمي حسب plan.
- لكل عرض: title، description (ماذا يحصل الزبون وبكم)، code (حروف وأرقام كبيرة 4-10، مثل BAC10 أو FB15)، channel (facebook/instagram/tiktok/whatsapp/other)، discount_pct (0 إن كان العرض بدون تخفيض)، ends_on (YYYY-MM-DD)، why (لماذا يربح، مع حساب الهامش إن عُرفت التكلفة).
- لا تتجاوز حد التخفيض الذي وضعه المالك.
أرجع item لكل عرض مع offers. link /agents.`,
  reviews: `مهمتك: تقييمات Google.
- إن كان review_url فارغاً: لا تكتب رسائل؛ أرجع item واحداً (severity warning) يطلب من المالك إضافة رابط التقييم في الإعدادات ← المحل.
- لكل زبون في customers: messages (to=customer, name, phone كما هو) برسالة شكر قصيرة جداً بالدارجة (3 أسطر): شكر باسمه على «what»، ثم «إلا عجباتك الخدمة، تقييمك على Google كيعاونا بزاف 🙏» مع review_url، ثم «— مكتبة سويت هاوس». لا تطلب 5 نجوم صراحة، ولا تَعِد بشيء مقابل التقييم.
- جمّع كل الرسائل في item واحد (title: «شكر زبائن اليوم»، link /agents).
- إن كان weekday = 1 (الإثنين): أضف في نفس item منشوراً واحداً لصفحة Google في posts (channel=google): 2-4 أسطر عن خدمة أو منتج حسب plan، مع دعوة للزيارة، و link_path مناسب.
- إن لم يكن هناك زبائن ولا إثنين: أرجع items فارغة.
- في المحادثة: إن ألصق المالك نص تقييم، اكتب رداً مهذباً قصيراً باسم المحل (شكر للإيجابي، واعتذار وحل وطريقة تواصل للسلبي).`,
  analyst: `مهمتك: تقرير التسويق الأسبوعي للمالك.
- من week و month: أي قناة جلبت نقرات وطلبات ومبيعات ومالاً، وأي رابط أو كود نجح.
- قارن بالأسبوع الماضي إن أمكن. كن صريحاً: ما نجح، ما لم ينجح، وما لا نعرفه بعد (قلة البيانات).
- في النهاية اقترح خطوة واحدة واضحة للأسبوع القادم.
أرجع item واحداً: title ملخص في جملة، body التقرير (نقاط قصيرة)، link /agents.`,
  brief: `مهمتك: «قهوة الصباح». اكتب للمالك ملخصاً واحداً لبداية يومه.
- text: تحية قصيرة باسمه ثم جملة عن الأمس.
- points: 3 نقاط على الأكثر، الأهم أولاً، كل نقطة تبدأ بصورة الوكيل المعني (avatar) إن كانت من الفريق، مع link للصفحة.
- celebrate=true فقط إذا كانت مبيعات الأمس أعلى من best_previous_day (يوم قياسي) أو إن لم يبق أي طلب متأخر وكان الأمس جيداً.`,
}

const TH_LABELS: Record<string, string> = {
  discount_pct: 'نبّه على التخفيض إذا تجاوز هذه النسبة %', discount_dh: 'أو إذا تجاوز هذا المبلغ بالدرهم', cash_diff_dh: 'تجاهل فرق الصندوق الأقل من هذا المبلغ بالدرهم',
  open_shift_hours: 'وردية مفتوحة أكثر من هذه الساعات = تنبيه', cover_weeks: 'اقترح كميات تكفي هذا العدد من الأسابيع', budget_dh: 'لا تتجاوز طلبية الأسبوع هذا المبلغ بالدرهم (0 = بدون حد)',
  debt_days: 'ذكّر بالدين بعد هذا العدد من الأيام', ready_days: 'ذكّر بالوثيقة غير المستلمة بعد هذه الأيام', debt_min_dh: 'تجاهل الديون الأقل من هذا المبلغ بالدرهم',
  descriptions: 'عدد أوصاف المنتجات في كل مرة', posts: 'عدد المنشورات في كل مرة', max_discount_pct: 'أقصى نسبة تخفيض مسموحة في العروض %',
}
const jobOf = (a: Agent) =>
  a.is_custom
    ? `مهمتك كما كتبها المالك:\n${a.custom_job ?? ''}\nأرجع اقتراحات واضحة في items (استعمل title و body و link فقط، والباقي فارغ). إن لم يكن هناك شيء مهم أرجع items فارغة.`
    : JOBS[a.key]
const thText = (a: Agent) => {
  const e = Object.entries(a.thresholds ?? {}).filter(([k, v]) => TH_LABELS[k] && v !== null && v !== '' && !Array.isArray(v))
  return e.length ? `\n\nحدود المالك (التزم بها بدقة):\n${e.map(([k, v]) => `- ${TH_LABELS[k]}: ${v}`).join('\n')}` : ''
}

const ITEM_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['severity', 'title', 'body', 'link', 'lines', 'messages', 'assign_to', 'descriptions', 'posts', 'offers', 'plan'],
  properties: {
    severity: { type: 'string', enum: ['info', 'warning', 'danger'] },
    title: { type: 'string' }, body: { type: 'string' }, link: { type: 'string' },
    lines: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['variant_id', 'name', 'qty', 'supplier', 'unit_cost_dh', 'why'],
      properties: { variant_id: { type: 'string' }, name: { type: 'string' }, qty: { type: 'number' }, supplier: { type: 'string' }, unit_cost_dh: { type: 'number' }, why: { type: 'string' } } } },
    messages: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['to', 'name', 'phone', 'employee_id', 'text'],
      properties: { to: { type: 'string', enum: ['customer', 'staff'] }, name: { type: 'string' }, phone: { type: 'string' }, employee_id: { type: 'string' }, text: { type: 'string' } } } },
    assign_to: { type: 'string' },
    descriptions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['product_id', 'name', 'desc_ar', 'desc_fr'],
      properties: { product_id: { type: 'string' }, name: { type: 'string' }, desc_ar: { type: 'string' }, desc_fr: { type: 'string' } } } },
    posts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['channel', 'text', 'image_idea', 'link_path'],
      properties: { channel: { type: 'string' }, text: { type: 'string' }, image_idea: { type: 'string' }, link_path: { type: 'string' } } } },
    offers: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'description', 'code', 'channel', 'discount_pct', 'ends_on', 'why'],
      properties: { title: { type: 'string' }, description: { type: 'string' }, code: { type: 'string' }, channel: { type: 'string' }, discount_pct: { type: 'number' }, ends_on: { type: 'string' }, why: { type: 'string' } } } },
    plan: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['week_start', 'theme', 'why', 'services', 'channels', 'offer'],
      properties: { week_start: { type: 'string' }, theme: { type: 'string' }, why: { type: 'string' }, services: { type: 'array', items: { type: 'string' } }, channels: { type: 'array', items: { type: 'string' } }, offer: { type: 'string' } } } },
  },
}
const RUN_SCHEMA = { type: 'object', additionalProperties: false, required: ['summary', 'items'], properties: { summary: { type: 'string' }, items: { type: 'array', items: ITEM_SCHEMA } } }
const BRIEF_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['text', 'points', 'celebrate'],
  properties: {
    text: { type: 'string' }, celebrate: { type: 'boolean' },
    points: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['avatar', 'text', 'link'], properties: { avatar: { type: 'string' }, text: { type: 'string' }, link: { type: 'string' } } } },
  },
}
const REPLY_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['reply', 'revise', 'revised'],
  properties: { reply: { type: 'string' }, revise: { type: 'boolean', description: 'true إن طلب المالك تعديل الاقتراح' }, revised: ITEM_SCHEMA },
}

function voice(a: Agent, p: Prefs) {
  const lang = p.language === 'fr' ? 'اكتب بالفرنسية.' : p.language === 'ar' ? 'اكتب بالعربية الفصحى البسيطة.' : 'اكتب بالدارجة المغربية بحروف عربية (كما يتكلم الناس في تطوان)، مع كلمات فرنسية شائعة عند الحاجة.'
  const detail = p.detail === 'long' ? 'يمكنك التفصيل عند الحاجة.' : 'كن مختصراً جداً: جملة إلى ثلاث جمل لكل نقطة.'
  return `أنت «${a.persona_name}» ${a.avatar}، عضو في فريق مساعدين أذكياء لمكتبة سويت هاوس في تطوان (مكتبة + خدمات إدارية + نقطة بيع + رياض/الشعبي كاش).
شخصيتك: ${a.personality}
تخاطب المالك بـ «${p.call_me || 'سي ياسر'}». ${lang} ${detail}
النصوص الموجهة للزبائن (messages to=customer) تكون دائماً بالعربية المهذبة، وتنتهي بـ «— مكتبة سويت هاوس».
المبالغ في البيانات بالسنتيم: اقسم على 100 واكتبها بالدرهم (125000 = 1 250 درهم).
لا تخترع أي رقم أو اسم أو هاتف غير موجود في البيانات. الحقول التي لا تحتاجها: مصفوفات فارغة ونص فارغ.
«ملاحظات المالك» تعليمات منه: احترمها دائماً. «ردود المالك السابقة» تبين ما وجده مفيداً (up) أو عادياً (meh) أو غير مهم (down): أكثر مما يحب وأقل مما لا يحب.`
}

function quiet(p: Prefs) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Casablanca' }))
  if ((p.quiet_days ?? []).includes(now.getDay())) return true
  const hm = now.getHours() * 60 + now.getMinutes()
  const toMin = (s?: string) => (s ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5)) : null)
  const f = toMin(p.quiet_from), t = toMin(p.quiet_to)
  if (f === null || t === null) return false
  return f > t ? hm >= f || hm < t : hm >= f && hm < t
}

async function agentData(admin: SupabaseClient, a: Agent, refId: string | null) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Casablanca' })
  const th = (a.thresholds ?? {}) as Record<string, number>
  if (a.is_custom) {
    const { data, error } = await admin.rpc('agent_custom_data', { p_sources: a.sources ?? [] })
    if (error) throw new Error(error.message)
    return { today, data }
  }
  const key = a.key
  const call = {
    monitor: () => admin.rpc('agent_monitor_data', { p_day: today, p_disc_pct: th.discount_pct ?? 15, p_disc_cents: Math.round((th.discount_dh ?? 20) * 100), p_open_hours: th.open_shift_hours ?? 14 }),
    purchases: () => admin.rpc('agent_purchase_data'),
    followup: () => admin.rpc('agent_followup_data', { p_debt_days: th.debt_days ?? 30, p_ready_days: th.ready_days ?? 2, p_debt_min: Math.round((th.debt_min_dh ?? 0) * 100) }),
    requests: () => admin.rpc('agent_request_data', { p_id: refId }),
    content: () => admin.rpc('agent_content_data'),
    brief: () => admin.rpc('agent_brief_data'),
    planner: () => admin.rpc('agent_marketing_data', { p_channel: null }),
    reviews: () => admin.rpc('agent_reviews_data'),
    facebook: () => admin.rpc('agent_marketing_data', { p_channel: 'facebook' }),
    instagram: () => admin.rpc('agent_marketing_data', { p_channel: 'instagram' }),
    tiktok: () => admin.rpc('agent_marketing_data', { p_channel: 'tiktok' }),
    whatsapp: () => admin.rpc('agent_marketing_data', { p_channel: 'whatsapp' }),
    offers: () => admin.rpc('agent_marketing_data', { p_channel: null }),
    analyst: async () => {
      const [w, m] = await Promise.all([admin.rpc('marketing_stats_internal', { p_days: 7 }), admin.rpc('marketing_stats_internal', { p_days: 30 })])
      return { data: { week: w.data, month: m.data }, error: w.error ?? m.error }
    },
  }[key]!
  const { data, error } = await call()
  if (error) throw new Error(error.message)
  return { today, data }
}

async function context(admin: SupabaseClient, key: string) {
  const [{ data: mem }, { data: fb }, { data: pr }] = await Promise.all([
    admin.from('agent_memory').select('note').eq('agent_key', key).order('created_at'),
    admin.rpc('agent_feedback_digest', { p_agent: key }),
    admin.from('settings').select('value').eq('key', 'agent_prefs').single(),
  ])
  return {
    notes: (mem ?? []).map((m: { note: string }) => `- ${m.note}`).join('\n') || '(لا توجد)',
    feedback: JSON.stringify(fb ?? []),
    prefs: (pr?.value ?? {}) as Prefs,
  }
}

async function ask(apiKey: string, model: string, system: string, content: string, schema: unknown) {
  const client = new Anthropic({ apiKey })
  const res = await client.beta.messages.create({
    model,
    max_tokens: 8000,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    betas: ['server-side-fallback-2026-07-01'],
    ...({ fallbacks: 'default' } as Record<string, unknown>),
  } as Anthropic.Beta.MessageCreateParamsNonStreaming)
  if (res.stop_reason === 'refusal') throw new Error('refusal')
  const text = res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('')
  return {
    out: JSON.parse(text),
    usage: { input_tokens: (res.usage.input_tokens ?? 0) + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0), output_tokens: res.usage.output_tokens ?? 0 },
  }
}

const payloadOf = (i: Item) => {
  const p: Record<string, unknown> = {}
  if (i.lines?.length) p.lines = i.lines
  if (i.messages?.length) p.messages = i.messages
  if (i.assign_to) p.assign_to = i.assign_to
  if (i.descriptions?.length) p.descriptions = i.descriptions
  if (i.posts?.length) p.posts = i.posts
  if (i.offers?.length) p.offers = i.offers
  if (i.plan?.length) p.plan = i.plan
  return p
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const admin = adminClient()
  let runId: string | null = null
  try {
    const body = await req.json().catch(() => ({}))
    const action = String(body?.action ?? 'run')

    // Who is calling: the cron / trigger (shared secret) or the owner from the dashboard
    let trigger: 'schedule' | 'manual' = 'schedule'
    const given = req.headers.get('x-agent-key')
    if (given) {
      const { data } = await admin.from('agent_secret').select('secret').eq('id', 1).single()
      if (!data || data.secret !== given) return fail('forbidden', 403)
    } else {
      const { data: owner } = await callerClient(req).rpc('is_owner')
      if (owner !== true) return fail('forbidden', 403)
      trigger = 'manual'
    }
    if (action === 'reply' && trigger !== 'manual') return fail('forbidden', 403)

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return fail('ai_not_configured', 412)
    const ai = ((await admin.from('settings').select('value').eq('key', 'ai').single()).data?.value ?? {}) as { enabled?: boolean }
    if (ai.enabled === false) return fail('ai_disabled', 412)
    const { data: budget } = await admin.rpc('ai_budget_check')
    if (budget === 'over') return fail('team_budget_reached', 429)

    // ---- The owner replies under a suggestion -------------------------
    if (action === 'reply') {
      const msg = String(body.message ?? '').trim().slice(0, 1500)
      if (!msg) return fail('invalid_messages')
      const { data: s } = await admin.from('agent_suggestions').select('*').eq('id', body.suggestion_id).single()
      if (!s) return fail('not_found', 404)
      const { data: agent } = await admin.from('agents').select('*').eq('key', s.agent_key).single<Agent>()
      if (!agent) return fail('invalid_agent')
      const ctx = await context(admin, agent.key)
      const { today, data } = await agentData(admin, agent, s.ref_id)
      const thread = (s.thread ?? []) as { role: string; text: string; at: string }[]
      const system = `${voice(agent, ctx.prefs)}\n\nعملك المعتاد:\n${jobOf(agent)}${thText(agent)}\n\nالآن المالك يحاورك حول أحد اقتراحاتك. أجب على سؤاله بوضوح في reply. إن طلب تعديلاً (كمية، نص رسالة، حذف سطر…) ضع revise=true و revised هو الاقتراح كاملاً بعد التعديل، وإلا revise=false و revised نسخة من الاقتراح الحالي. إن قال «ما فهمتش» اشرح بطريقة أبسط مع مثال.`
      const content = `تاريخ اليوم: ${today}\nملاحظات المالك:\n${ctx.notes}\n\nالاقتراح الحالي:\n${JSON.stringify({ severity: s.severity, title: s.title, body: s.body, link: s.link, ...s.payload })}\n\nالمحادثة السابقة:\n${thread.map((m) => `${m.role === 'owner' ? 'المالك' : 'أنت'}: ${m.text}`).join('\n') || '(لا شيء)'}\n\nرسالة المالك الآن: ${msg}\n\nالبيانات الحالية:\n${JSON.stringify(data).slice(0, 80000)}`
      const { out, usage } = await ask(apiKey, agent.model, system, content, REPLY_SCHEMA)
      const now = new Date().toISOString()
      const next = [...thread, { role: 'owner', text: msg, at: now }, { role: 'agent', text: out.reply, at: now }]
      const patch: Record<string, unknown> = { thread: next }
      if (out.revise) Object.assign(patch, { title: out.revised.title, body: out.revised.body, severity: out.revised.severity, payload: payloadOf(out.revised) })
      await admin.from('agent_suggestions').update(patch).eq('id', s.id)
      await admin.from('agent_runs').insert({ agent_key: agent.key, trigger: 'manual', model: agent.model, ok: true, finished_at: now, summary: 'محادثة', ...usage })
      return json({ reply: out.reply, revised: !!out.revise })
    }

    // ---- A normal run --------------------------------------------------
    const key = String(body?.agent ?? '')
    const refId = body?.ref_id ? String(body.ref_id) : null
    const { data: stored } = await admin.from('agents').select('*').eq('key', key).single<Agent>()
    if (!stored || (!stored.is_custom && !JOBS[key])) return fail('invalid_agent')
    // test = run with unsaved edits, store nothing, notify nobody
    const testing = action === 'test' && trigger === 'manual'
    const agent: Agent = testing ? { ...stored, ...(body.override ?? {}) } : stored
    const team = ((await admin.from('settings').select('value').eq('key', 'agent_team').single()).data?.value ?? {}) as { paused_until?: string | null }
    if (trigger === 'schedule' && team.paused_until && new Date(team.paused_until) > new Date()) return json({ skipped: 'paused' })
    if (!agent.enabled && trigger === 'schedule') return json({ skipped: 'disabled' })
    if (key === 'requests' && !refId) {
      // manual run: review the latest online request
      const { data: last } = await admin.from('service_requests').select('id').eq('created_by_staff', false).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!last) return json({ ok: true, summary: 'لا توجد طلبات', count: 0 })
      body.ref_id = last.id
    }
    const ref = (body.ref_id as string | undefined) ?? null
    const since = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const { count } = await admin.from('agent_runs').select('id', { count: 'exact', head: true }).eq('agent_key', key).gte('started_at', since).not('summary', 'in', '("محادثة","اختبار")').or('ok.is.null,ok.eq.true')
    if (!testing && (count ?? 0) >= agent.monthly_runs) return fail('ai_limit_reached', 429)

    const { data: run } = await admin.from('agent_runs').insert({ agent_key: key, trigger, model: agent.model, summary: testing ? 'اختبار' : null }).select('id').single()
    runId = run?.id ?? null
    const ctx = await context(admin, key)
    const { today, data } = await agentData(admin, agent, ref)
    const content = `تاريخ اليوم: ${today}\n\nملاحظات المالك:\n${ctx.notes}\n\nردود المالك السابقة على اقتراحاتك:\n${ctx.feedback}\n\nالبيانات:\n${JSON.stringify(data).slice(0, 120000)}`
    const system = `${voice(agent, ctx.prefs)}\n\n${jobOf(agent)}${thText(agent)}`

    if (key === 'brief') {
      const { out, usage } = await ask(apiKey, agent.model, system, content, BRIEF_SCHEMA)
      if (testing) {
        await admin.from('agent_runs').update({ finished_at: new Date().toISOString(), ok: true, ...usage }).eq('id', runId)
        return json({ ok: true, test: true, summary: out.text, brief: out })
      }
      await admin.from('agent_briefs').upsert({ day: today, text: out.text, points: out.points, celebrate: out.celebrate, seen_at: null, created_at: new Date().toISOString() })
      if (!(ctx.prefs.quiet_days ?? []).includes(new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Casablanca' })).getDay())) {
        await admin.rpc('notify', { p_type: 'agent_brief', p_severity: 'info', p_ar: `☕ ${out.text.slice(0, 80)}`, p_fr: '☕ Café du matin', p_body: out.points.map((p: { avatar: string; text: string }) => `${p.avatar} ${p.text}`).join('\n').slice(0, 400), p_link: '/dashboard' })
      }
      await admin.from('agent_runs').update({ finished_at: new Date().toISOString(), ok: true, summary: out.text, ...usage }).eq('id', runId)
      return json({ ok: true, summary: out.text, count: out.points.length })
    }

    const { out, usage } = await ask(apiKey, agent.model, system, content, RUN_SCHEMA)
    const items = (out.items ?? []) as Item[]
    if (testing) {
      await admin.from('agent_runs').update({ finished_at: new Date().toISOString(), ok: true, ...usage }).eq('id', runId)
      return json({ ok: true, test: true, summary: out.summary, items })
    }
    // every post gets its own short tracking link (?src=CODE)
    const SITE = 'https://yassir1778.github.io/sweet-house'
    const STORE_SITE = 'https://yassir1778.github.io/sweet-house-store'
    const prefix: Record<string, string> = { facebook: 'fb', instagram: 'ig', tiktok: 'tt', whatsapp: 'wa', google: 'go' }
    for (const it of items) {
      for (const post of it.posts ?? []) {
        const channel = prefix[post.channel] ? post.channel : 'other'
        const code = `${prefix[channel] ?? 'x'}${crypto.randomUUID().replace(/-/g, '').slice(0, 5)}`
        const path = /^\/[a-z0-9/_-]*$/i.test(post.link_path ?? '') ? post.link_path : '/'
        await admin.from('campaign_links').insert({ code, channel, path, label: post.text.slice(0, 80) })
        post.code = code
        // store paths (and instagram/tiktok home links) go to the Store site
        const toStore = /^\/(shop|p|school-list|faq|returns|checkout)(\/|$)/.test(path) || (['instagram', 'tiktok'].includes(channel) && path === '/')
        post.link = `${toStore ? STORE_SITE : SITE}${path === '/' ? '/' : path}?src=${code}`
      }
      // the planner's weeks become the plan the channel agents follow
      if (key === 'planner' && it.plan?.length) {
        const byMonth: Record<string, unknown[]> = {}
        for (const w of it.plan) (byMonth[`${w.week_start.slice(0, 7)}-01`] ??= []).push(w)
        for (const [month, weeks] of Object.entries(byMonth)) await admin.from('marketing_plan').upsert({ month, plan: weeks, updated_at: new Date().toISOString() })
      }
    }
    if (items.length) {
      await admin.from('agent_suggestions').insert(items.map((i) => ({
        agent_key: key, run_id: runId, ref_id: ref, severity: i.severity, title: i.title.slice(0, 300), body: i.body,
        link: i.link?.startsWith('/') ? i.link : null, payload: payloadOf(i),
      })))
    }
    const worst = items.some((i) => i.severity === 'danger') ? 'danger' : items.some((i) => i.severity === 'warning') ? 'warning' : 'info'
    // Requests agent only notifies when something is missing; others once per run. Quiet hours: urgent only.
    const shouldNotify = agent.notify_mode === 'push' && (key !== 'requests' || worst !== 'info') && (!quiet(ctx.prefs) || worst === 'danger')
    if (shouldNotify) {
      await admin.rpc('notify', {
        p_type: `agent_${key}`, p_severity: worst,
        p_ar: `${agent.avatar} ${agent.persona_name}: ${items.length ? `${items.length} اقتراح` : 'كل شيء على ما يرام'}`,
        p_fr: `${agent.avatar} ${agent.name_fr} : ${items.length}`,
        p_body: String(out.summary ?? '').slice(0, 400), p_link: '/agents',
      })
    }
    await admin.from('agent_runs').update({ finished_at: new Date().toISOString(), ok: true, summary: out.summary, ...usage }).eq('id', runId)
    return json({ ok: true, summary: out.summary, count: items.length })
  } catch (e) {
    const msg = String((e as Error).message ?? e)
    const code = msg.includes('credit balance') ? 'ai_no_credit' : msg
    if (runId) await admin.from('agent_runs').update({ finished_at: new Date().toISOString(), ok: false, error: code.slice(0, 500) }).eq('id', runId)
    return fail(code, 500)
  }
})
