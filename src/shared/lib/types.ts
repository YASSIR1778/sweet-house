export type Me = {
  id: string
  full_name: string
  username: string | null
  avatar_url: string | null
  color: string
  is_owner: boolean
  can_use_pos: boolean
  can_use_admin: boolean
  role: { id: string; name_ar: string; name_fr: string } | null
  permissions: string[]
  max_discount_percent: number
}

export type Category = {
  id: string
  parent_id: string | null
  name_ar: string
  name_fr: string
  icon: string | null
  color: string
  image_url: string | null
  sort: number
  is_online: boolean
  deleted_at: string | null
}

export type Pack = { id?: string; name_ar: string; name_fr: string; factor: number; barcode: string | null; price: number }

export type Variant = {
  id?: string
  name_ar: string | null
  name_fr: string | null
  sku: string | null
  barcode: string | null
  price: number
  compare_at_price?: number | null
  stock_qty?: number
  image_url?: string | null
  cost?: number
  initial_stock?: number
  packs: Pack[]
}

export type Product = {
  id: string
  category_id: string | null
  name_ar: string
  name_fr: string
  description_ar: string | null
  description_fr: string | null
  brand: string | null
  images: string[]
  tax_rate: number
  track_stock: boolean
  low_stock_alert: number
  has_variants: boolean
  is_online: boolean
  is_featured: boolean
  sort: number
  deleted_at: string | null
  created_at: string
}

export type ServiceCategory = {
  id: string
  kind: 'counter' | 'admin'
  name_ar: string
  name_fr: string
  icon: string | null
  color: string
  sort: number
}

export type DocReq = { name_ar: string; name_fr: string; required: boolean }
export type ServiceField = {
  key: string
  label_ar: string
  label_fr: string
  type: 'text' | 'textarea' | 'number' | 'date' | 'select'
  required: boolean
  options?: string[]
}

export type Service = {
  id: string
  category_id: string | null
  kind: 'counter' | 'admin'
  system_key: string | null
  name_ar: string
  name_fr: string
  description_ar: string | null
  description_fr: string | null
  pricing_mode: 'fixed' | 'tiered' | 'open'
  price: number
  unit_ar: string | null
  unit_fr: string | null
  tax_rate: number
  icon: string | null
  image_url: string | null
  pos_quick: boolean
  pos_color: string | null
  pos_sort: number
  is_online: boolean
  duration_ar: string | null
  duration_fr: string | null
  official_url: string | null
  required_documents: DocReq[]
  fields: ServiceField[]
  sort: number
  is_active: boolean
  deleted_at: string | null
  service_price_tiers?: { min_qty: number; unit_price: number }[]
}

export type Role = {
  id: string
  name_ar: string
  name_fr: string
  description: string | null
  color: string
  is_owner: boolean
  permissions: string[]
  max_discount_percent: number
  deleted_at: string | null
}

export type Employee = {
  id: string
  auth_user_id: string | null
  full_name: string
  username: string | null
  phone: string | null
  avatar_url: string | null
  color: string
  role_id: string | null
  is_owner: boolean
  extra_permissions: string[]
  revoked_permissions: string[]
  max_discount_percent: number | null
  can_use_pos: boolean
  can_use_admin: boolean
  monthly_salary: number
  hire_date: string | null
  is_active: boolean
  notes: string | null
  deleted_at: string | null
  created_at: string
}

export type Permission = { key: string; group_key: string; name_ar: string; name_fr: string; sort: number }

export type SaleItem = {
  line_no: number
  item_type: 'product' | 'service' | 'custom'
  name_ar: string
  name_fr: string
  qty: number
  unit_price: number
  original_unit_price: number
  discount: number
  total: number
  tax_rate: number
}

export type Sale = {
  id: string
  number: string
  status: 'completed' | 'voided'
  customer_id: string | null
  employee_id: string
  employee_name: string
  customer: { id: string; full_name: string; phone: string | null } | null
  subtotal: number
  discount_total: number
  total: number
  tax_total: number
  cash_received: number
  change_given: number
  paid_cash: number
  paid_card: number
  paid_credit: number
  note: string | null
  void_reason: string | null
  voided_at: string | null
  created_at: string
  items: SaleItem[]
}

export type Customer = {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  company_name: string | null
  ice: string | null
  address: string | null
  city: string | null
  notes: string | null
  deleted_at: string | null
  created_at: string
}

export type StoreSettings = {
  name_ar: string
  name_fr: string
  tagline_ar: string
  tagline_fr: string
  phone: string
  whatsapp: string
  email: string
  address_ar: string
  address_fr: string
  city: string
  maps_url: string
  logo_url: string | null
  hours: { day: number; open: string | null; close: string | null }[]
  socials: Record<string, string>
}

export type LegalSettings = {
  company_name: string
  ice: string
  if: string
  rc: string
  patente: string
  cnss: string
  default_tax_rate: number
  tax_rates: number[]
  cndp?: string
}

export type ReceiptSettings = {
  show_logo: boolean
  show_legal: boolean
  show_qr: boolean
  show_employee: boolean
  header_ar: string
  header_fr: string
  footer_ar: string
  footer_fr: string
  languages: 'both' | 'ar' | 'fr'
  qr_url?: string
  qr_label_ar?: string
  qr_label_fr?: string
}
