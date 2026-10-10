import { describe, expect, it } from 'vitest'
import { energy, integrate, rk4, type DoublePendulum, type PState } from './pendulum'

const p: DoublePendulum = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 }

describe('double pendulum', () => {
  it('conserves energy over a short time', () => {
    const s0: PState = [2.0, 1.0, 0, 0]
    const e0 = energy(p, s0)
    let s = s0
    let worst = 0
    for (let i = 0; i < 2000; i++) {
      s = rk4(p, s, 0.001)
      worst = Math.max(worst, Math.abs(energy(p, s) - e0))
    }
    expect(worst / Math.abs(e0)).toBeLessThan(1e-8)
  })
  it('small oscillations match the normal-mode frequency (equal masses and lengths)', () => {
    // Only the in-phase mode excited: omega^2 = (g/l)(2 - sqrt 2) with eigenvector (1, sqrt 2).
    const a = 1e-4
    const s0: PState = [a, Math.SQRT2 * a, 0, 0]
    const w = Math.sqrt(9.81 * (2 - Math.SQRT2))
    const T = (2 * Math.PI) / w
    const s = integrate(p, s0, T, 0.001)
    expect(s[0] / a).toBeCloseTo(1, 4)
    expect(s[1] / a).toBeCloseTo(Math.SQRT2, 4)
  })
  it('is chaotic: nearby starts diverge', () => {
    const a: PState = [2.5, 2.0, 0, 0]
    const b: PState = [2.5 + 1e-6, 2.0, 0, 0]
    const d0 = 1e-6
    const sa = integrate(p, a, 15, 0.002)
    const sb = integrate(p, b, 15, 0.002)
    expect(Math.abs(sa[0] - sb[0]) + Math.abs(sa[1] - sb[1])).toBeGreaterThan(1000 * d0)
  })
})
