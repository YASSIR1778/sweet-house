import { createBrowserRouter, RouterProvider } from 'react-router'
import { CartProvider } from './cart'
import { SiteLayout } from './Layout'
import { HomePage } from './pages/Home'
import { ProductPage, ShopPage } from './pages/Shop'
import { CheckoutPage } from './pages/Checkout'
import { ServiceRequestPage, ServicesPage } from './pages/Services'
import { AbroadPage } from './pages/Abroad'
import { AlertsPage, MyDocumentsPage, UnsubscribePage } from './pages/Customer'
import { TrackPage } from './pages/Track'
import { ContactPage, LegalPage, NotFoundPage } from './pages/Info'
import { captureCampaign } from './data'

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <SiteLayout />,
      children: [
        { index: true, element: <HomePage /> },
        { path: 'shop', element: <ShopPage /> },
        { path: 'shop/:id', element: <ProductPage /> },
        { path: 'checkout', element: <CheckoutPage /> },
        { path: 'services', element: <ServicesPage /> },
        { path: 'services/:id', element: <ServiceRequestPage /> },
        { path: 'abroad', element: <AbroadPage /> },
        { path: 'my', element: <MyDocumentsPage /> },
        { path: 'alerts', element: <AlertsPage /> },
        { path: 'unsubscribe', element: <UnsubscribePage /> },
        { path: 'track', element: <TrackPage /> },
        { path: 'track/:code', element: <TrackPage /> },
        { path: 'contact', element: <ContactPage /> },
        { path: 'privacy', element: <LegalPage kind="privacy" /> },
        { path: 'terms', element: <LegalPage kind="terms" /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') },
)

captureCampaign()

export function App() {
  return (
    <CartProvider>
      <RouterProvider router={router} />
    </CartProvider>
  )
}
