import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { CheckCircle2 } from 'lucide-react'
import { useLang } from '@/shared/lib/i18n'
import { LangToggle, LogoMark, ThemeToggle } from '@/shared/ui/brand'

/** Split-screen frame used by login and first-run setup. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const { t } = useLang()
  const points = [
    t('نقطة بيع سريعة بالباركود والرمز السري', 'POS rapide avec code-barres et PIN'),
    t('تحكم كامل في المنتجات والخدمات والأسعار', 'Contrôle total des produits, services et prix'),
    t('صلاحيات دقيقة لكل موظف وسجل لكل عملية', 'Permissions précises et journal complet'),
    t('تقارير حية للمبيعات والأرباح', 'Rapports en temps réel des ventes et bénéfices'),
  ]
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-navy p-12 text-white lg:flex lg:flex-col">
        <div className="bg-grid absolute inset-0 opacity-40" />
        <div className="absolute -start-32 -bottom-32 size-[28rem] rounded-full bg-brand/30 blur-3xl" />
        <div className="absolute end-10 top-24 size-64 rounded-full bg-[#2563EB]/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <LogoMark size={44} />
          <div className="font-latin text-xl font-extrabold">
            Sweet <span className="text-brand">House</span>
          </div>
        </div>
        <div className="relative mt-auto max-w-lg">
          <motion.h2 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-4xl leading-tight font-bold">
            {t('كل مكتبتك', 'Toute votre librairie')}
            <br />
            <span className="text-brand">{t('في لوحة واحدة', 'dans un seul tableau')}</span>
          </motion.h2>
          <ul className="mt-8 space-y-3.5">
            {points.map((p, i) => (
              <motion.li key={p} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.08 }} className="flex items-center gap-3 text-white/80">
                <CheckCircle2 className="size-5 shrink-0 text-brand" />
                {p}
              </motion.li>
            ))}
          </ul>
        </div>
        <div className="relative mt-12 text-xs text-white/40">© {new Date().getFullYear()} Sweet House — Tétouan</div>
      </div>

      <div className="flex flex-col">
        <div className="flex justify-end gap-1 p-4">
          <LangToggle />
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-16">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-sm">
            <LogoMark size={48} className="mb-6 lg:hidden" />
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
            <div className="mt-8">{children}</div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
