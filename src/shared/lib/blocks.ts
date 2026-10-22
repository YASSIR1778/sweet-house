// Home page "blocks" for both public sites: the owner adds, edits, reorders,
// duplicates and deletes sections from the dashboard (website editor).
// Stored in settings: website.blocks (Services) and website_store.blocks (Store).
import type { Brand } from './brand'

export type BlockType =
  | 'products' | 'categories' | 'trust' | 'promise' | 'school'
  | 'services' | 'features' | 'shortcuts' | 'about' | 'custom_request'
  | 'banner' | 'text' | 'image' | 'video' | 'steps' | 'faq' | 'whatsapp' | 'cross'

export type BlockItem = { icon?: string; title_ar: string; title_fr?: string; text_ar?: string; text_fr?: string; link?: string; image_url?: string }

export type Block = {
  id: string
  type: BlockType
  enabled: boolean
  title_ar?: string
  title_fr?: string
  subtitle_ar?: string
  subtitle_fr?: string
  text_ar?: string
  text_fr?: string
  image_url?: string | null
  button_ar?: string
  button_fr?: string
  link?: string
  color?: string
  video_url?: string
  // products / services
  source?: 'featured' | 'latest' | 'category' | 'manual' | 'sale'
  category_id?: string | null
  ids?: string[]
  limit?: number
  layout?: 'grid' | 'carousel'
  items?: BlockItem[]
}

export const BLOCK_TYPES: Record<BlockType, { ar: string; fr: string; icon: string; sites: Brand[]; hint_ar: string }> = {
  products: { ar: 'منتجات', fr: 'Produits', icon: '🛍️', sites: ['store'], hint_ar: 'المميزة، الجديدة، المخفّضة، من قسم، أو تختارها بنفسك' },
  categories: { ar: 'الأقسام', fr: 'Rayons', icon: '🗂️', sites: ['store'], hint_ar: 'بطاقات أقسام المتجر' },
  trust: { ar: 'شريط الضمانات المتحرك', fr: 'Bandeau garanties', icon: '✅', sites: ['store'], hint_ar: 'التوصيل، الدفع عند الاستلام…' },
  promise: { ar: 'وعد الدفع عند الاستلام', fr: 'Promesse COD', icon: '💵', sites: ['store'], hint_ar: 'بانر برتقالي + 3 خطوات' },
  school: { ar: 'اللائحة المدرسية', fr: 'Liste scolaire', icon: '🎒', sites: ['store'], hint_ar: 'يبرز وحده في غشت وشتنبر' },
  services: { ar: 'خدمات', fr: 'Services', icon: '📄', sites: ['services'], hint_ar: 'الأكثر طلباً، من مجال، أو تختارها بنفسك' },
  features: { ar: 'المزايا', fr: 'Atouts', icon: '⭐', sites: ['services'], hint_ar: 'بطاقات صغيرة تحت الواجهة' },
  shortcuts: { ar: 'اختصارات الزبون', fr: 'Raccourcis', icon: '🔗', sites: ['services'], hint_ar: 'وثائقي، خارج المغرب، التنبيهات' },
  about: { ar: 'من نحن', fr: 'À propos', icon: '🏪', sites: ['services', 'store'], hint_ar: 'نص عن المحل + زر واتساب' },
  custom_request: { ar: 'لم تجد خدمتك؟', fr: 'Demande libre', icon: '✍️', sites: ['services'], hint_ar: 'دعوة لطلب خدمة غير موجودة' },
  banner: { ar: 'بانر بصورة وزر', fr: 'Bannière', icon: '🖼️', sites: ['services', 'store'], hint_ar: 'عرض، إعلان، أو ترويج لصفحة' },
  text: { ar: 'نص', fr: 'Texte', icon: '📝', sites: ['services', 'store'], hint_ar: 'عنوان وفقرة' },
  image: { ar: 'صورة', fr: 'Image', icon: '🏞️', sites: ['services', 'store'], hint_ar: 'صورة عريضة برابط اختياري' },
  video: { ar: 'فيديو', fr: 'Vidéo', icon: '🎬', sites: ['services', 'store'], hint_ar: 'YouTube أو mp4' },
  steps: { ar: 'خطوات', fr: 'Étapes', icon: '🔢', sites: ['services', 'store'], hint_ar: 'كيف نخدم في خطوات مرقمة' },
  faq: { ar: 'الأسئلة الشائعة', fr: 'FAQ', icon: '❓', sites: ['services', 'store'], hint_ar: 'من تبويب الأسئلة الشائعة' },
  whatsapp: { ar: 'تواصل واتساب', fr: 'WhatsApp', icon: '💬', sites: ['services', 'store'], hint_ar: 'بطاقة «عندك سؤال؟»' },
  cross: { ar: 'رابط الموقع الآخر', fr: 'Lien autre site', icon: '↔️', sites: ['services', 'store'], hint_ar: 'المتجر ↔ الخدمات' },
}

const uid = () => Math.random().toString(36).slice(2, 10)

export function newBlock(type: BlockType): Block {
  const b: Block = { id: uid(), type, enabled: true }
  if (type === 'products') Object.assign(b, { source: 'featured', limit: 8, layout: 'grid', title_ar: 'منتجات مختارة', title_fr: 'Notre sélection' })
  if (type === 'services') Object.assign(b, { source: 'featured', limit: 6, title_ar: 'الخدمات الأكثر طلباً', title_fr: 'Services les plus demandés' })
  if (type === 'banner') Object.assign(b, { title_ar: 'عنوان البانر', text_ar: '', button_ar: 'اكتشف', link: '/' })
  if (type === 'text') Object.assign(b, { title_ar: 'عنوان', text_ar: '' })
  if (type === 'steps') Object.assign(b, { items: [{ title_ar: 'اطلب' }, { title_ar: 'نأكد معك' }, { title_ar: 'توصلك' }] })
  return b
}

export const DEFAULT_BLOCKS: Record<Brand, Block[]> = {
  services: [
    { id: 's-features', type: 'features', enabled: true },
    { id: 's-services', type: 'services', enabled: true, source: 'featured', limit: 6 },
    { id: 's-custom', type: 'custom_request', enabled: true },
    {
      id: 's-steps', type: 'steps', enabled: true,
      items: [
        { icon: 'file-text', title_ar: 'اختر الخدمة واملأ الطلب', title_fr: 'Choisissez et remplissez', text_ar: 'في دقيقة واحدة، مع رفع وثائقك بأمان', text_fr: 'En une minute, documents envoyés en sécurité' },
        { icon: 'shield-check', title_ar: 'نُنجز طلبك', title_fr: 'Nous traitons', text_ar: 'فريقنا يتكفّل بكل الإجراءات', text_fr: 'Notre équipe s’occupe de tout' },
        { icon: 'message-circle', title_ar: 'رسالة واتساب عند الجاهزية', title_fr: 'Message WhatsApp', text_ar: 'حمّل وثيقتك أو استلمها من المحل', text_fr: 'Téléchargez ou retirez en boutique' },
      ],
    },
    { id: 's-cross', type: 'cross', enabled: true },
    { id: 's-shortcuts', type: 'shortcuts', enabled: true },
    { id: 's-about', type: 'about', enabled: true },
    { id: 's-faq', type: 'faq', enabled: true },
  ],
  store: [
    { id: 'p-trust', type: 'trust', enabled: true },
    { id: 'p-cats', type: 'categories', enabled: true, title_ar: 'شنو كتقلب عليه؟', title_fr: 'Que cherchez-vous ?', subtitle_ar: 'الأقسام', subtitle_fr: 'Rayons' },
    { id: 'p-best', type: 'products', enabled: true, source: 'featured', limit: 8, layout: 'grid', title_ar: 'اختيارات زبناءنا', title_fr: 'Les favoris de nos clients', subtitle_ar: 'الأكثر طلباً', subtitle_fr: 'Les plus demandés' },
    { id: 'p-promise', type: 'promise', enabled: true },
    { id: 'p-new', type: 'products', enabled: true, source: 'latest', limit: 8, layout: 'carousel', title_ar: 'وصل حديثاً', title_fr: 'Fraîchement arrivé', subtitle_ar: 'جديدنا', subtitle_fr: 'Nouveautés' },
    { id: 'p-school', type: 'school', enabled: true },
    { id: 'p-cross', type: 'cross', enabled: true },
    { id: 'p-wa', type: 'whatsapp', enabled: true },
  ],
}

/** Blocks of a site, honouring the old on/off switches until the owner edits the layout. */
export function blocksOf(brand: Brand, saved: Block[] | undefined, sections?: Record<string, boolean>): Block[] {
  if (saved?.length) return saved
  const old: Record<string, string> = brand === 'store'
    ? { 'p-cats': 'categories', 'p-best': 'best', 'p-promise': 'promise', 'p-new': 'latest', 'p-school': 'school', 'p-cross': 'cross' }
    : { 's-features': 'features', 's-services': 'services', 's-about': 'about', 's-faq': 'faq' }
  return DEFAULT_BLOCKS[brand].map((b) => ({ ...b, enabled: sections?.[old[b.id]] !== false }))
}

export type MenuLink = { label_ar: string; label_fr: string; to: string }
