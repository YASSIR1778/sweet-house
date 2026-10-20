/** Download rows as a CSV that Excel opens correctly (UTF-8 BOM, ";" separator). */
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = '﻿' + [headers, ...rows].map((r) => r.map(esc).join(';')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/** Centimes → "12,50" for spreadsheets. */
export const csvMoney = (c: number | null | undefined) => ((c ?? 0) / 100).toFixed(2).replace('.', ',')
