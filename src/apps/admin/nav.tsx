import { lazy, type ReactNode } from 'react'
import {
  Banknote,
  Barcode,
  BookOpen,
  Bot,
  Coins,
  BarChart3,
  Boxes,
  CalendarClock,
  ClipboardList,
  FileText,
  Globe,
  LifeBuoy,
  Megaphone,
  LayoutDashboard,
  MonitorSmartphone,
  Package,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Tags,
  Trash,
  Truck,
  Users,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { DashboardPage } from './pages/Dashboard'
const ProductsPage = lazy(() => import('./pages/Products').then((m) => ({ default: m.ProductsPage })))
const CategoriesPage = lazy(() => import('./pages/Categories').then((m) => ({ default: m.CategoriesPage })))
const ServicesPage = lazy(() => import('./pages/Services').then((m) => ({ default: m.ServicesPage })))
const GuidesPage = lazy(() => import('./pages/Guides').then((m) => ({ default: m.GuidesPage })))
const SalesPage = lazy(() => import('./pages/Sales').then((m) => ({ default: m.SalesPage })))
const CustomersPage = lazy(() => import('./pages/Customers').then((m) => ({ default: m.CustomersPage })))
const EmployeesPage = lazy(() => import('./pages/Employees').then((m) => ({ default: m.EmployeesPage })))
const RolesPage = lazy(() => import('./pages/Roles').then((m) => ({ default: m.RolesPage })))
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })))
const DevicesPage = lazy(() => import('./pages/Devices').then((m) => ({ default: m.DevicesPage })))
const ActivityPage = lazy(() => import('./pages/Activity').then((m) => ({ default: m.ActivityPage })))
const TrashPage = lazy(() => import('./pages/Trash').then((m) => ({ default: m.TrashPage })))
const ShiftsPage = lazy(() => import('./pages/Shifts').then((m) => ({ default: m.ShiftsPage })))
const RiyadPage = lazy(() => import('./pages/Riyad').then((m) => ({ default: m.RiyadPage })))
const ExpensesPage = lazy(() => import('./pages/Expenses').then((m) => ({ default: m.ExpensesPage })))
const PurchasesPage = lazy(() => import('./pages/Purchases').then((m) => ({ default: m.PurchasesPage })))
const StockPage = lazy(() => import('./pages/Stock').then((m) => ({ default: m.StockPage })))
const PayrollPage = lazy(() => import('./pages/Payroll').then((m) => ({ default: m.PayrollPage })))
const ReportsPage = lazy(() => import('./pages/Reports').then((m) => ({ default: m.ReportsPage })))
const OrdersPage = lazy(() => import('./pages/Orders').then((m) => ({ default: m.OrdersPage })))
const RequestsPage = lazy(() => import('./pages/Requests').then((m) => ({ default: m.RequestsPage })))
const WebsitePage = lazy(() => import('./pages/Website').then((m) => ({ default: m.WebsitePage })))
const InvoicesPage = lazy(() => import('./pages/Invoices').then((m) => ({ default: m.InvoicesPage })))
const LabelsPage = lazy(() => import('./pages/Labels').then((m) => ({ default: m.LabelsPage })))
const AttendancePage = lazy(() => import('./pages/Attendance').then((m) => ({ default: m.AttendancePage })))
const BroadcastsPage = lazy(() => import('./pages/Broadcasts').then((m) => ({ default: m.BroadcastsPage })))
const AgentsPage = lazy(() => import('./pages/Agents').then((m) => ({ default: m.AgentsPage })))
const HelpPage = lazy(() => import('./pages/Help').then((m) => ({ default: m.HelpPage })))

export type NavItem = {
  path: string
  ar: string
  fr: string
  icon: LucideIcon
  perm?: string
  element: ReactNode
  soon?: number // phase number when it ships
}

export type NavGroup = { ar: string; fr: string; items: NavItem[] }


export const NAV: NavGroup[] = [
  {
    ar: 'الرئيسية',
    fr: 'Général',
    items: [
      { path: '/dashboard', ar: 'لوحة القيادة', fr: 'Tableau de bord', icon: LayoutDashboard, element: <DashboardPage /> },
      // 'owner' is not a real permission: only the owner passes can('owner')
      { path: '/agents', ar: 'الوكلاء الذكيون', fr: 'Agents IA', icon: Bot, perm: 'owner', element: <AgentsPage /> },
    ],
  },
  {
    ar: 'المبيعات',
    fr: 'Ventes',
    items: [
      { path: '/sales', ar: 'المبيعات', fr: 'Ventes', icon: Receipt, perm: 'reports.sales', element: <SalesPage /> },
      { path: '/invoices', ar: 'الفواتير', fr: 'Factures', icon: FileText, perm: 'pos.invoice', element: <InvoicesPage /> },
      { path: '/shifts', ar: 'الورديات والصندوق', fr: 'Caisses', icon: Banknote, perm: 'reports.shifts', element: <ShiftsPage /> },
      { path: '/riyad', ar: 'رياض', fr: 'Riyad', icon: Wallet, perm: 'riyad.view_balance', element: <RiyadPage /> },
      { path: '/customers', ar: 'الزبائن', fr: 'Clients', icon: UserRound, perm: 'customers.manage', element: <CustomersPage /> },
    ],
  },
  {
    ar: 'الكتالوج',
    fr: 'Catalogue',
    items: [
      { path: '/products', ar: 'المنتجات', fr: 'Produits', icon: Package, perm: 'products.manage', element: <ProductsPage /> },
      { path: '/categories', ar: 'الفئات', fr: 'Catégories', icon: Tags, perm: 'products.manage', element: <CategoriesPage /> },
      { path: '/services', ar: 'الخدمات', fr: 'Services', icon: Sparkles, perm: 'services.manage', element: <ServicesPage /> },
      // every dashboard user reads the guides; editing and sharing check their own permissions
      { path: '/guides', ar: 'أدلة الخدمات', fr: 'Guides des services', icon: BookOpen, element: <GuidesPage /> },
      { path: '/labels', ar: 'ملصقات الباركود', fr: 'Étiquettes', icon: Barcode, perm: 'labels.print', element: <LabelsPage /> },
      { path: '/stock', ar: 'المخزون والجرد', fr: 'Stock & inventaire', icon: Boxes, perm: 'stock.inventory', element: <StockPage /> },
      { path: '/purchases', ar: 'المشتريات والموردون', fr: 'Achats & fournisseurs', icon: Truck, perm: 'purchases.manage', element: <PurchasesPage /> },
    ],
  },
  {
    ar: 'الأونلاين',
    fr: 'En ligne',
    items: [
      { path: '/orders', ar: 'طلبات المتجر', fr: 'Commandes', icon: ShoppingCart, perm: 'orders.manage', element: <OrdersPage /> },
      { path: '/requests', ar: 'طلبات الخدمات', fr: 'Demandes de services', icon: ClipboardList, perm: 'requests.manage', element: <RequestsPage /> },
      { path: '/help', ar: 'طلبات المساعدة', fr: 'Demandes d’aide', icon: LifeBuoy, perm: 'requests.manage', element: <HelpPage /> },
      { path: '/broadcasts', ar: 'قائمة البث', fr: 'Diffusion', icon: Megaphone, perm: 'broadcast.manage', element: <BroadcastsPage /> },
      { path: '/website', ar: 'محرر الموقع', fr: 'Éditeur du site', icon: Globe, perm: 'website.edit', element: <WebsitePage /> },
    ],
  },
  {
    ar: 'الإدارة',
    fr: 'Gestion',
    items: [
      { path: '/reports', ar: 'التقارير', fr: 'Rapports', icon: BarChart3, perm: 'reports.sales', element: <ReportsPage /> },
      { path: '/expenses', ar: 'المصاريف', fr: 'Dépenses', icon: FileText, perm: 'expenses.manage', element: <ExpensesPage /> },
      { path: '/employees', ar: 'الموظفون', fr: 'Employés', icon: Users, perm: 'employees.manage', element: <EmployeesPage /> },
      { path: '/attendance', ar: 'الحضور والانصراف', fr: 'Présences', icon: CalendarClock, perm: 'employees.manage', element: <AttendancePage /> },
      { path: '/payroll', ar: 'الرواتب والعمولات', fr: 'Salaires', icon: Coins, perm: 'employees.manage', element: <PayrollPage /> },
      { path: '/roles', ar: 'الأدوار والصلاحيات', fr: 'Rôles & permissions', icon: ShieldCheck, perm: 'employees.manage', element: <RolesPage /> },
      { path: '/devices', ar: 'أجهزة نقطة البيع', fr: 'Appareils POS', icon: MonitorSmartphone, perm: 'settings.manage', element: <DevicesPage /> },
      { path: '/activity', ar: 'سجل النشاطات', fr: "Journal d'activité", icon: ScrollText, perm: 'logs.view', element: <ActivityPage /> },
      { path: '/trash', ar: 'سلة المهملات', fr: 'Corbeille', icon: Trash, perm: 'trash.manage', element: <TrashPage /> },
      { path: '/settings', ar: 'الإعدادات', fr: 'Paramètres', icon: Settings, perm: 'settings.manage', element: <SettingsPage /> },
    ],
  },
]
