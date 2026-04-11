import { describe, expect, it } from 'vitest'

import { formatMoney } from '@/lib/utils/format'

describe('formatMoney', () => {
  it('formats token codes without using Intl currency mode', () => {
    expect(() => formatMoney(1000.25, 'USDT', 'en')).not.toThrow()
    expect(formatMoney(1000.25, 'USDT', 'en')).toContain('USDT')
    expect(formatMoney(1000.25, 'USDC', 'zh')).toContain('USDC')
  })

  it('keeps ISO currencies in currency format mode', () => {
    expect(formatMoney(88.5, 'USD', 'en')).toContain('$')
  })
})
