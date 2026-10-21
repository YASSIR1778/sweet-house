import type { SupabaseClient } from '@supabase/supabase-js'
import { callFn } from './fn'
import { compress } from '@/shared/ui/media'

/** Resize a photo (≤1600px JPEG/WebP) and return it as base64 for the ai function. */
export async function imageForAi(file: Blob): Promise<{ image: string; mime: string }> {
  const blob = await compress(file, 1600)
  const mime = blob.type && /^image\/(jpeg|png|webp|gif)$/.test(blob.type) ? blob.type : 'image/jpeg'
  const buf = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return { image: btoa(bin), mime }
}

export type IdCard = {
  readable: boolean
  side?: 'front' | 'back' | 'unknown'
  cin?: string | null
  last_name_fr?: string | null
  first_name_fr?: string | null
  last_name_ar?: string | null
  first_name_ar?: string | null
  birth_date?: string | null
  birth_place_fr?: string | null
  birth_place_ar?: string | null
  expiry_date?: string | null
  sex?: string | null
  father_name?: string | null
  mother_name?: string | null
  address?: string | null
  civil_number?: string | null
}
export type RiyadRead = { readable: boolean; total_in: number | null; total_out: number | null; balance: number | null; operations_count?: number | null; date?: string | null; notes?: string }

export const readIdCard = async (sb: SupabaseClient, file: Blob) => callFn<IdCard>(sb, 'ai', { action: 'id_card', ...(await imageForAi(file)) })
export const readRiyad = async (sb: SupabaseClient, file: Blob) => callFn<RiyadRead>(sb, 'ai', { action: 'riyad', ...(await imageForAi(file)) })
export const aiWrite = (sb: SupabaseClient, p: Record<string, string>) => callFn<{ text: string }>(sb, 'ai', { action: 'write', ...p })
export const aiServiceDocs = (sb: SupabaseClient, name: string) =>
  callFn<{ required_documents?: { name_ar: string; name_fr: string; required: boolean }[]; fields?: { key: string; label_ar: string; label_fr: string; type: string; required: boolean; options?: string[] }[]; duration_ar?: string; duration_fr?: string; official_url?: string }>(sb, 'ai', { action: 'service_docs', name })
