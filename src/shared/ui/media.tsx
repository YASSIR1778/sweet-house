import { useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn, uuid } from '@/shared/lib/utils'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'

/** Resize to max 1200px and convert to WebP before upload (keeps storage small). */
async function compress(file: File, max = 1200): Promise<Blob> {
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file
  const img = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return new Promise((res) => canvas.toBlob((b) => res(b ?? file), 'image/webp', 0.85))
}

export async function uploadImage(sb: SupabaseClient, file: File, folder: string) {
  const blob = await compress(file)
  const ext = blob.type === 'image/webp' ? 'webp' : (file.name.split('.').pop() ?? 'bin')
  const path = `${folder}/${uuid()}.${ext}`
  const { error } = await sb.storage.from('media').upload(path, blob, { contentType: blob.type, upsert: false })
  if (error) throw error
  return sb.storage.from('media').getPublicUrl(path).data.publicUrl
}

export function ImageInput({
  sb,
  value,
  onChange,
  folder,
  className,
  aspect = 'aspect-square',
}: {
  sb: SupabaseClient
  value: string | null
  onChange: (url: string | null) => void
  folder: string
  className?: string
  aspect?: string
}) {
  const { t, lang } = useLang()
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)

  const handle = async (file?: File | null) => {
    if (!file) return
    setBusy(true)
    try {
      onChange(await uploadImage(sb, file, folder))
    } catch (e) {
      toast.error(errorMessage(e, lang))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border-2 border-dashed border-border bg-surface-2/50 transition-colors',
        drag && 'border-brand bg-brand-50',
        aspect,
        className,
      )}
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        handle(e.dataTransfer.files?.[0])
      }}
    >
      {value ? (
        <>
          <img src={value} alt="" className="size-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute end-2 top-2 rounded-full bg-navy/70 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
          >
            <X className="size-3.5" />
          </button>
        </>
      ) : (
        <button type="button" onClick={() => ref.current?.click()} className="flex size-full flex-col items-center justify-center gap-2 p-3 text-center text-muted hover:text-brand">
          {busy ? <Loader2 className="size-6 animate-spin text-brand" /> : <ImagePlus className="size-6" />}
          <span className="text-xs">{t('اضغط أو اسحب صورة', 'Cliquez ou déposez une image')}</span>
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => handle(e.target.files?.[0])} />
    </div>
  )
}
