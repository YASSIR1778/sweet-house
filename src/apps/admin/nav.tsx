import type { ReactNode } from 'react'
import {
  Banknote,
  Barcode,
  Coins,
  BarChart3,
  Boxes,
  CalendarClock,
  ClipboardList,
  FileText,
  Globe,
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
import { ProductsPage } from './pages/Products'
import { CategoriesPage } from './pages/Categories'
import { ServicesPage } from './pages/Services'
import { SalesPage } from './pages/Sales'
import { CustomersPage } from './pages/Customers'
import { EmployeesPage } from './pages/Employees'
import { RolesPage } from './pages/Roles'
import { SettingsPage } from './pages/Settings'
import { DevicesPage } from './pages/Devices'
import { ActivityPage } from './pages/Activity'
import { TrashPage } from './pages/Trash'
import { ShiftsPage } from './pages/Shifts'
import { RiyadPage } from './pages/Riyad'
import { ExpensesPage } from './pages/Expenses'
import { PurchasesPage } from './pages/Purchases'
import { StockPage } from './pages/Stock'
import { PayrollPage } from './pages/Payroll'
import { ReportsPage } from './pages/Reports'
import { OrdersPage } from './pages/Orders'
import { RequestsPage } from './pages/Requests'
import { WebsitePage } from './pages/Website'
import { InvoicesPage } from './pages/Invoices'
import { LabelsPage } from './pages/Labels'
import { AttendancePage } from './pages/Attendance'

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
    items: [{ path: '/dashboard', ar: 'لوحة القيادة', fr: 'Tableau de bord', icon: LayoutDashboard, element: <DashboardPage /> }],
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
