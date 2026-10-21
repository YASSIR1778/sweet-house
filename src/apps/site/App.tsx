import { createBrowserRouter, RouterProvider } from 'react-router'
import { CartProvider } from './cart'
import { FocusLayout, SiteLayout } from './Layout'
import { HomePage } from './pages/Home'
import { ShopPage } from './pages/Shop'
import { ProductLanding } from './pages/ProductLanding'
import { StoreHome } from './pages/StoreHome'
import { ReturnsPage, SchoolListPage, StoreFaqPage } from './pages/StoreInfo'
import { BRAND, applyBrandColors, otherSitePath } from '@/shared/lib/brand'
import { CheckoutPage } from './pages/Checkout'
import { ServiceRequestPage, ServicesPage } from './pages/Services'
import { AbroadPage } from './pages/Abroad'
import { AlertsPage, MyDocumentsPage, UnsubscribePage } from './pages/Customer'
import { TrackPage } from './pages/Track'
import { ContactPage, LegalPage, NotFoundPage } from './pages/Info'
import { captureCampaign } from './data'

// Old links that now belong to the other site (Store ↔ Services) jump there.
function Elsewhere() {
  const url = otherSitePath(location.pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ''), '') || '/')
  if (url) location.replace(url + location.search)
  return <NotFoundPage />
}

const common = [
  { path: 'track', element: <TrackPage /> },
  { path: 'track/:code', element: <TrackPage /> },
  { path: 'contact', element: <ContactPage /> },
  { path: 'privacy', element: <LegalPage kind="privacy" /> },
  { path: 'terms', element: <LegalPage kind="terms" /> },
  { path: 'unsubscribe', element: <UnsubscribePage /> },
  { path: '*', element: <Elsewhere /> },
]

const pages =
  BRAND === 'store'
    ? [
        { index: true, element: <StoreHome /> },
        { path: 'shop', element: <ShopPage /> },
        { path: 'shop/:id', element: <ProductLanding /> },
        { path: 'checkout', element: <CheckoutPage /> },
        { path: 'school-list', element: <SchoolListPage /> },
        { path: 'faq', element: <StoreFaqPage /> },
        { path: 'returns', element: <ReturnsPage /> },
        ...common,
      ]
    : [
        { index: true, element: <HomePage /> },
        { path: 'services', element: <ServicesPage /> },
        { path: 'services/:id', element: <ServiceRequestPage /> },
        { path: 'abroad', element: <AbroadPage /> },
        { path: 'my', element: <MyDocumentsPage /> },
        { path: 'alerts', element: <AlertsPage /> },
        ...common,
      ]

const router = createBrowserRouter(
  [
    // ad landing pages: no menu, nothing between the visitor and the order
    ...(BRAND === 'store' ? [{ path: '/p/:id', element: <FocusLayout /> }] : []),
    { path: '/', element: <SiteLayout />, children: pages },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') },
)

captureCampaign()
applyBrandColors()

export function App() {
  return (
    <CartProvider>
      <RouterProvider router={router} />
    </CartProvider>
  )
}
