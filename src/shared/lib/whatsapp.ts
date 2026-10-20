import type { SupabaseClient } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { callFn } from './fn'
import { whatsappLink } from './utils'

let modeCache: { mode: string; at: number } | null = null

async function mode(sb: SupabaseClient) {
  if (modeCache && Date.now() - modeCache.at < 60_000) return modeCache.mode
  const { data } = await sb.from('settings').select('value').eq('key', 'whatsapp').single()
  const m = (data?.value as { mode?: string } | null)?.mode ?? 'manual'
  modeCache = { mode: m, at: Date.now() }
  return m
}

/**
 * Send a WhatsApp message: automatically through the Cloud API when the
 * owner enabled "auto" mode, otherwise open WhatsApp with the text ready.
 */
export async function sendWhatsApp(sb: SupabaseClient, phone: string, text: string, lang: 'ar' | 'fr') {
  if ((await mode(sb)) === 'auto') {
    try {
      await callFn(sb, 'whatsapp-send', { to: phone, text })
      toast.success(lang === 'ar' ? 'أُرسلت رسالة واتساب تلقائياً ✅' : 'Message WhatsApp envoyé ✅')
      return
    } catch (e) {
      toast.error((lang === 'ar' ? 'تعذر الإرسال التلقائي، افتح واتساب يدوياً: ' : 'Envoi auto impossible : ') + String((e as Error).message))
    }
  }
  window.open(whatsappLink(phone, text), '_blank')
}

export function resetWhatsAppMode() {
  modeCache = null
}
