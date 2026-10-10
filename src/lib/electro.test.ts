import { describe, expect, it } from 'vitest'
import { fieldAt, fieldLines, potentialAt, potentialToRgb, SOFT, traceFieldLine, type Charge } from './electro'

const ch = (id: number, x: number, y: number, q: number): Charge => ({ id, x, y, q })

describe('electrostatics', () => {
  it('potential of a point charge falls as 1/r (softened)', () => {
    const c = [ch(1, 0, 0, 2)]
    expect(potentialAt(c, 100, 0)).toBeCloseTo(2 / Math.sqrt(100 * 100 + SOFT * SOFT), 12)
    expect(potentialAt(c, 100, 0) / potentialAt(c, 200, 0)).toBeCloseTo(2, 2)
  })
  it('field points away from a positive charge and is the gradient of V', () => {
    const c = [ch(1, 0, 0, 1), ch(2, 80, 30, -0.5)]
    const { ex, ey } = fieldAt(c, 40, -20)
    const h = 1e-4
    expect(ex).toBeCloseTo(-(potentialAt(c, 40 + h, -20) - potentialAt(c, 40 - h, -20)) / (2 * h), 6)
    expect(ey).toBeCloseTo(-(potentialAt(c, 40, -20 + h) - potentialAt(c, 40, -20 - h)) / (2 * h), 6)
    expect(fieldAt([ch(1, 0, 0, 1)], 50, 0).ex).toBeGreaterThan(0)
  })
  it('equal charges cancel at the midpoint; a dipole is antisymmetric', () => {
    const e = fieldAt([ch(1, 0, 0, 1), ch(2, 100, 0, 1)], 50, 0)
    expect(Math.hypot(e.ex, e.ey)).toBeLessThan(1e-12)
    expect(potentialAt([ch(1, 0, 0, 1), ch(2, 100, 0, -1)], 50, 0)).toBeCloseTo(0, 12)
  })
  it('field lines run from the positive to the negative charge of a dipole', () => {
    const c = [ch(1, 200, 200, 1), ch(2, 300, 200, -1)]
    const line = traceFieldLine(c, 207, 200, 1, { w: 500, h: 400 })
    const end = line[line.length - 1]
    expect(Math.hypot(end.x - 300, end.y - 200)).toBeLessThan(6)
    expect(fieldLines(c, { w: 500, h: 400 }).length).toBeGreaterThanOrEqual(4)
  })
})

describe('potential colours', () => {
  it('is red for positive, blue for negative and neutral at zero', () => {
    const [r1, , b1] = potentialToRgb(0.2, false)
    const [r2, , b2] = potentialToRgb(-0.2, false)
    expect(r1).toBeGreaterThan(b1)
    expect(b2).toBeGreaterThan(r2)
    expect(potentialToRgb(0, false)).toEqual([250, 250, 252])
  })
})
