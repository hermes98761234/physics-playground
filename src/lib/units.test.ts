import { describe, expect, it } from 'vitest'
import { formatEng } from './units'

describe('formatEng', () => {
  it('picks SI prefixes', () => {
    expect(formatEng(0.0125, 'A')).toBe('12.5 mA')
    expect(formatEng(4.7e-6, 'F')).toBe('4.7 µF')
    expect(formatEng(2200, 'Ω')).toBe('2.2 kΩ')
    expect(formatEng(12, 'V')).toBe('12 V')
    expect(formatEng(-0.003, 'V')).toBe('-3 mV')
    expect(formatEng(0, 'V')).toBe('0 V')
  })
})
