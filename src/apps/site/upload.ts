import { callFn } from '@/shared/lib/fn'
import { sb } from './data'

export const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp,image/heic,.doc,.docx'
export const MAX_FILE = 10 * 1024 * 1024

/** Upload one customer file to the private bucket via a signed URL. */
export async function uploadPublicFile(code: string, phone: string, file: File, kind: 'upload' | 'payment_proof') {
  if (file.size > MAX_FILE) throw new Error('file_too_big')
  const mime = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream')
  const { path, token } = await callFn<{ path: string; token: string }>(sb, 'public-files', { action: 'upload', code, phone, name: file.name, size: file.size, mime, kind })
  const { error } = await sb.storage.from('customer-docs').uploadToSignedUrl(path, token, file, { contentType: mime })
  if (error) throw error
  await callFn(sb, 'public-files', { action: 'register', code, phone, path, name: file.name, size: file.size, mime, kind })
}

export async function downloadPublicFile(code: string, phone: string, fileId: string) {
  const { url } = await callFn<{ url: string }>(sb, 'public-files', { action: 'download', code, phone, file_id: fileId })
  window.open(url, '_blank')
}
