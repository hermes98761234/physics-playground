import { describe, expect, it } from 'vitest'
import { advance, rcStepVc, rlcDamping, rlcStepVc, rlStepI, timeWindow, voltages, type CircuitParams, type CircuitState } from './circuit'

const zero: CircuitState = { q: 0, i: 0 }

describe('RC', () => {
  const p: CircuitParams = { kind: 'RC', V: 5, R: 1000, L: 0, C: 1e-6 }
  it('charges to 63.2% in one time constant', () => {
    const s = advance(p, zero, p.V, 1e-3)
    expect(voltages(p, s, p.V).vC).toBeCloseTo(5 * (1 - Math.exp(-1)), 5)
    expect(voltages(p, s, p.V).vC).toBeCloseTo(rcStepVc(p, 1e-3), 6)
  })
  it('discharges when the switch shorts the loop', () => {
    const s = advance(p, { q: p.C * 5, i: 0 }, 0, 1e-3)
    expect(voltages(p, s, 0).vC).toBeCloseTo(5 * Math.exp(-1), 5)
  })
})

describe('RL', () => {
  const p: CircuitParams = { kind: 'RL', V: 10, R: 50, L: 0.1, C: 0 }
  it('current rises as (V/R)(1 - e^{-tR/L})', () => {
    for (const t of [0.001, 0.002, 0.01]) {
      expect(advance(p, zero, p.V, t).i).toBeCloseTo(rlStepI(p, t), 7)
    }
  })
  it('inductor voltage starts at V and decays to 0', () => {
    expect(voltages(p, zero, p.V).vL).toBeCloseTo(10, 9)
    expect(Math.abs(voltages(p, advance(p, zero, p.V, 0.05), p.V).vL)).toBeLessThan(1e-3)
  })
})

describe('RLC: RK4 vs analytical', () => {
  const cases: [string, number][] = [
    ['underdamped', 20],
    ['critical', 2 * Math.sqrt(0.01 / 1e-6)],
    ['overdamped', 500],
  ]
  for (const [name, R] of cases) {
    it(name, () => {
      const p: CircuitParams = { kind: 'RLC', V: 12, R, L: 0.01, C: 1e-6 }
      expect(rlcDamping(R, p.L, p.C).regime).toBe(name === 'underdamped' ? 'under' : name === 'critical' ? 'critical' : 'over')
      for (const t of [1e-4, 5e-4, 2e-3, 5e-3]) {
        const s = advance(p, zero, p.V, t)
        expect(s.q / p.C).toBeCloseTo(rlcStepVc(p, t), 4)
      }
    })
  }
  it('underdamped response overshoots the source voltage', () => {
    const p: CircuitParams = { kind: 'RLC', V: 1, R: 10, L: 0.01, C: 1e-6 }
    const tPeak = Math.PI / Math.sqrt(1 / (p.L * p.C) - (p.R / (2 * p.L)) ** 2)
    expect(rlcStepVc(p, tPeak)).toBeGreaterThan(1.5)
    expect(timeWindow(p)).toBeGreaterThan(tPeak)
  })
})
