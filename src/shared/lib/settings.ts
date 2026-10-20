import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'

export function useSettings<T>(sb: SupabaseClient, key: string) {
  return useQuery({
    queryKey: ['settings', key],
    queryFn: async () => {
      const { data, error } = await sb.from('settings').select('value').eq('key', key).maybeSingle()
      if (error) throw error
      return (data?.value ?? {}) as T
    },
  })
}

export function useAllSettings(sb: SupabaseClient) {
  return useQuery({
    queryKey: ['settings', '*'],
    queryFn: async () => {
      const { data, error } = await sb.from('settings').select('key, value')
      if (error) throw error
      return Object.fromEntries((data ?? []).map((r) => [r.key, r.value])) as Record<string, Record<string, unknown>>
    },
  })
}

export function useSaveSetting(sb: SupabaseClient) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      const { error } = await sb.from('settings').update({ value }).eq('key', key)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })
}
