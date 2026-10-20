import { createBrowserRouter, RouterProvider } from 'react-router'
import { CartProvider } from './cart'
import { SiteLayout } from './Layout'
import { HomePage } from './pages/Home'
import { ProductPage, ShopPage } from './pages/Shop'
import { CheckoutPage } from './pages/Checkout'
import { ServiceRequestPage, ServicesPage } from './pages/Services'
import { TrackPage } from './pages/Track'
import { ContactPage, LegalPage, NotFoundPage } from './pages/Info'

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

export function App() {
  return (
    <CartProvider>
      <RouterProvider router={router} />
    </CartProvider>
  )
}
