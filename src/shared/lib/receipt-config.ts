import { useQuery } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReceiptConfig } from '@/shared/ui/receipt'

export function useReceiptConfig(sb: SupabaseClient) {
  return useQuery({
    queryKey: ['receipt-config'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await sb.from('settings').select('key, value').in('key', ['store', 'legal', 'receipt'])
      if (error) throw error
      const m = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))
      return { store: m.store ?? {}, legal: m.legal ?? {}, receipt: m.receipt ?? {} } as ReceiptConfig
    },
  })
}
