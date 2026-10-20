import { useQuery } from '@tanstack/react-query'
import { createHashRouter, Navigate, RouterProvider } from 'react-router'
import { AuthProvider, useAuth } from '@/shared/lib/auth'
import { getSupabase } from '@/shared/lib/supabase'
import { Spinner } from '@/shared/ui/primitives'
import { LogoMark } from '@/shared/ui/brand'
import { Layout } from './Layout'
import { NAV } from './nav'
import { LoginPage } from './pages/Login'
import { SetupPage } from './pages/Setup'
import { NoAccessPage } from './pages/NoAccess'

const sb = getSupabase('admin')

const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      ...NAV.flatMap((g) => g.items).map((it) => ({ path: it.path.slice(1), element: it.element })),
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
])

function Gate() {
  const { session, me, loading } = useAuth()
  const setup = useQuery({
    queryKey: ['setup-status'],
    queryFn: async () => {
      const { data, error } = await sb.rpc('setup_status')
      if (error) throw error
      return data as { has_owner: boolean }
    },
  })

  if (loading || setup.isLoading) return <Splash />
  if (setup.data && !setup.data.has_owner) return <SetupPage onDone={() => setup.refetch()} />
  if (!session) return <LoginPage />
  if (!me) return <NoAccessPage />
  if (!me.can_use_admin && !me.permissions.includes('admin.access')) return <NoAccessPage />
  return <RouterProvider router={router} />
}

function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5">
      <LogoMark size={56} className="animate-pulse" />
      <Spinner />
    </div>
  )
}

export function App() {
  return (
    <AuthProvider sb={sb}>
      <Gate />
    </AuthProvider>
  )
}
