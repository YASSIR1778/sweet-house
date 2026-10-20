import { useQuery } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { uuid } from './utils'

export type RequestStatus = { key: string; name_ar: string; name_fr: string; color: string; icon: string | null; sort: number; is_final: boolean; is_cancel: boolean; allow_download: boolean; template_ar: string | null; template_fr: string | null }

export const ORDER_STATUSES: Record<string, { ar: string; fr: string; color: string }> = {
  new: { ar: 'جديد', fr: 'Nouvelle', color: '#2563EB' },
  confirmed: { ar: 'مؤكد', fr: 'Confirmée', color: '#7C3AED' },
  preparing: { ar: 'قيد التحضير', fr: 'En préparation', color: '#D97706' },
  shipped: { ar: 'في الطريق', fr: 'Expédiée', color: '#0891B2' },
  ready: { ar: 'جاهز للاستلام', fr: 'Prête au retrait', color: '#16A34A' },
  delivered: { ar: 'تم التسليم', fr: 'Livrée', color: '#0F172A' },
  cancelled: { ar: 'ملغى', fr: 'Annulée', color: '#94A3B8' },
}

export const PAYMENT_STATUS: Record<string, { ar: string; fr: string; tone: 'danger' | 'warning' | 'success' }> = {
  unpaid: { ar: 'غير مدفوع', fr: 'Non payé', tone: 'danger' },
  proof_uploaded: { ar: 'وصل للتأكيد', fr: 'Justificatif à vérifier', tone: 'warning' },
  paid: { ar: 'مدفوع', fr: 'Payé', tone: 'success' },
}

export function useRequestStatuses(sb: SupabaseClient) {
  return useQuery({
    queryKey: ['request-statuses'],
    staleTime: 5 * 60_000,
    queryFn: async () => (await sb.from('request_statuses').select('*').order('sort')).data as RequestStatus[],
  })
}

/** Public tracking link (the website lives at the repo root). */
export function siteTrackUrl(code: string) {
  const base = import.meta.env.BASE_URL
  return `${location.origin}${base}track/${code}`
}

export async function openStaffFile(sb: SupabaseClient, path: string) {
  const { data, error } = await sb.storage.from('customer-docs').createSignedUrl(path, 120)
  if (error) throw error
  window.open(data.signedUrl, '_blank')
}

export async function uploadStaffFile(sb: SupabaseClient, target: { request?: string; order?: string }, file: File, kind: 'deliverable' | 'upload' | 'payment_proof') {
  const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin'
  const folder = target.request ? `requests/${target.request}` : `orders/${target.order}`
  const path = `${folder}/${kind}-${uuid()}.${ext}`
  const { error } = await sb.storage.from('customer-docs').upload(path, file, { contentType: file.type || undefined })
  if (error) throw error
  const { error: e2 } = await sb.rpc('register_staff_file', { p_request: target.request ?? null, p_order: target.order ?? null, p_path: path, p_name: file.name, p_size: file.size, p_mime: file.type, p_kind: kind })
  if (e2) throw e2
}

export function useOnlinePending(sb: SupabaseClient, enabled = true) {
  return useQuery({
    queryKey: ['online-pending'],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => (await sb.rpc('online_pending')).data as { requests: number; requests_new: number; orders: number; orders_new: number; proofs: number },
  })
}
