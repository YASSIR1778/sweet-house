import { Lock, LogOut } from 'lucide-react'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { Button } from '@/shared/ui/primitives'
import { EmptyState } from '@/shared/ui/data'

export function NoAccessPage() {
  const { signOut } = useAuth()
  const { t } = useLang()
  return (
    <div className="flex min-h-screen items-center justify-center">
      <EmptyState
        icon={<Lock />}
        title={t('لا يمكنك الدخول إلى لوحة التحكم', "Accès au tableau de bord non autorisé")}
        description={t('حسابك لا يملك صلاحية الدخول. تواصل مع المالك.', "Votre compte n'a pas accès. Contactez le propriétaire.")}
        action={
          <Button variant="outline" onClick={() => signOut()}>
            <LogOut />
            {t('تسجيل الخروج', 'Déconnexion')}
          </Button>
        }
      />
    </div>
  )
}
