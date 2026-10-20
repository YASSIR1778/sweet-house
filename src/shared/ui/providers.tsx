import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { LangProvider, useLang } from '@/shared/lib/i18n'
import { isConfigured } from '@/shared/lib/supabase'
import { TooltipProvider } from './overlay'
import { LogoMark } from './brand'
import '@/shared/styles/globals.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
})

function ThemedToaster() {
  const { dir } = useLang()
  return <Toaster position={dir === 'rtl' ? 'top-left' : 'top-right'} dir={dir} richColors closeButton toastOptions={{ style: { fontFamily: 'inherit' } }} />
}

function NotConfigured() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <LogoMark size={56} />
      <h1 className="text-xl font-bold">Supabase غير مربوط</h1>
      <p className="max-w-md text-sm text-muted">
        أضف VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY في ملف .env أو في متغيرات GitHub ثم أعد البناء.
      </p>
    </div>
  )
}

export function mount(app: ReactNode) {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {}))
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <LangProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            {isConfigured ? app : <NotConfigured />}
            <ThemedToaster />
          </TooltipProvider>
        </QueryClientProvider>
      </LangProvider>
    </StrictMode>,
  )
}

export { queryClient }
