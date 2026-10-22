import type { Plugin } from 'vite'

// The page head each public site ships before React loads: what Google,
// Facebook and WhatsApp previews read.
const HEADS = {
  services: {
    title: 'سويت هاوس للخدمات — خدمات إدارية بتطوان | Sweet House Services',
    description: 'أكثر من 40 خدمة إدارية بتطوان: السجل العدلي، جواز السفر، CNSS، المقاول الذاتي، الضرائب… اطلب وتبّع ملفك من تيليفونك، حتى من خارج المغرب.',
    url: 'https://yassir1778.github.io/sweet-house/',
  },
  store: {
    title: 'متجر سويت هاوس — توصيل لجميع المدن والدفع عند الاستلام | Sweet House Store',
    description: 'كلشي اللي محتاج، يوصلك لباب الدار: المنزل والمطبخ، الهاتف والإلكترونيات، الأطفال، المدرسة والمكتب… الثمن واضح، والدفع عند الاستلام.',
    url: 'https://yassir1778.github.io/sweet-house-store/',
  },
}

export function brandHtml(brand: keyof typeof HEADS): Plugin {
  const h = HEADS[brand]
  return {
    name: 'brand-html',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        // only the public site page, not the POS / admin apps
        if (!ctx.filename.replace(/\\/g, '/').endsWith('/index.html') || /\/(pos|admin)\/index\.html$/.test(ctx.filename.replace(/\\/g, '/'))) return html
        const meta = [
          `<meta name="description" content="${h.description}" />`,
          `<meta property="og:type" content="website" />`,
          `<meta property="og:title" content="${h.title}" />`,
          `<meta property="og:description" content="${h.description}" />`,
          `<meta property="og:url" content="${h.url}" />`,
          `<meta property="og:locale" content="ar_MA" />`,
        ].join('\n    ')
        return html.replace(/<title>[^<]*<\/title>/, `<title>${h.title}</title>\n    ${meta}`)
      },
    },
  }
}
