import type { LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { useLang } from '@/shared/lib/i18n'
import { Badge, Card } from '@/shared/ui/primitives'

export function SoonPage({ phase, ar, fr, icon: Icon }: { phase: number; ar: string; fr: string; icon: LucideIcon }) {
  const { t } = useLang()
  return (
    <Card className="relative overflow-hidden">
      <div className="bg-grid absolute inset-0 opacity-50" />
      <div className="relative flex flex-col items-center px-6 py-24 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', bounce: 0.4 }}
          className="flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-brand to-[#ff9466] text-white shadow-xl shadow-brand/30"
        >
          <Icon className="size-9" />
        </motion.div>
        <Badge tone="brand" className="mt-6">
          {t(`قادم في المرحلة ${phase}`, `Prévu en phase ${phase}`)}
        </Badge>
        <h2 className="mt-3 text-2xl font-bold">{t(ar, fr)}</h2>
        <p className="mt-2 max-w-md text-sm text-muted">
          {t('هذا القسم مُخطط له في وثيقة المواصفات وسيكون متاحاً عند الانتهاء من هذه المرحلة.', 'Cette section est prévue dans le cahier des charges et sera disponible à la fin de cette phase.')}
        </p>
      </div>
    </Card>
  )
}
