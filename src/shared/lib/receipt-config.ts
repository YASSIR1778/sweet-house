import { useQuery } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReceiptConfig } from '@/shared/ui/receipt'
import { storage } from './utils'

const cache = storage<ReceiptConfig | null>('sh-receipt-cfg', null)

export function useReceiptConfig(sb: SupabaseClient) {
  return useQuery({
    queryKey: ['receipt-config'],
    staleTime: 5 * 60_000,
    initialData: cache.get() ?? undefined,
    initialDataUpdatedAt: 0,
    queryFn: async () => {
      const { data, error } = await sb.from('settings').select('key, value').in('key', ['store', 'legal', 'receipt'])
      if (error) throw error
      const m = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))
      const cfg = { store: m.store ?? {}, legal: m.legal ?? {}, receipt: m.receipt ?? {} } as ReceiptConfig
      cache.set(cfg)
      return cfg
    },
  })
}
