import { describe, expect, it } from 'vitest'
import { cauchyIndex, criticalAngle, minDeviation, refract, snellAngle, traceRay, type OpticElement } from './optics'

const deg = (r: number) => (r * 180) / Math.PI
const rad = (d: number) => (d * Math.PI) / 180

describe("Snell's law", () => {
  it('air to glass at 30 degrees', () => {
    expect(deg(snellAngle(rad(30), 1, 1.5)!)).toBeCloseTo(19.4712, 3)
  })
  it('is reversible', () => {
    const t = snellAngle(rad(40), 1, 1.33)!
    expect(deg(snellAngle(t, 1.33, 1)!)).toBeCloseTo(40, 9)
  })
  it('critical angle of glass to air is 41.81 degrees; water 48.75', () => {
    expect(deg(criticalAngle(1.5, 1)!)).toBeCloseTo(41.8103, 3)
    expect(deg(criticalAngle(1.33, 1)!)).toBeCloseTo(48.7536, 2)
    expect(criticalAngle(1, 1.5)).toBeNull()
  })
  it('total internal reflection beyond the critical angle', () => {
    expect(snellAngle(rad(45), 1.5, 1)).toBeNull()
    expect(snellAngle(rad(40), 1.5, 1)).not.toBeNull()
  })
  it('vector refraction agrees with the scalar law', () => {
    const th = rad(35)
    const d = { x: Math.sin(th), y: -Math.cos(th) }
    const r = refract(d, { x: 0, y: 1 }, 1, 1.5)!
    expect(Math.asin(r.x)).toBeCloseTo(snellAngle(th, 1, 1.5)!, 9)
    expect(refract({ x: Math.sin(rad(60)), y: Math.cos(rad(60)) }, { x: 0, y: -1 }, 1.5, 1)).toBeNull()
  })
})

describe('dispersion', () => {
  it('blue bends more than red and n(589) is preserved', () => {
    expect(cauchyIndex(1.5, 589)).toBeCloseTo(1.5, 12)
    expect(cauchyIndex(1.5, 450)).toBeGreaterThan(cauchyIndex(1.5, 650))
    expect(cauchyIndex(1.5, 450, 0)).toBe(1.5)
  })
  it('minimum deviation of a 60 degree prism, n=1.5', () => {
    expect(deg(minDeviation(rad(60), 1.5)!)).toBeCloseTo(37.1808, 3)
  })
})

describe('ray tracer', () => {
  const mirror: OpticElement = { id: 1, kind: 'mirror', x: 100, y: 0, angle: rad(45), size: 100, param: 0 }
  it('a 45 degree mirror turns a ray by 90 degrees', () => {
    const r = traceRay({ elements: [mirror] }, { x: 0, y: 0 }, { x: 1, y: 0 }, 589, 0)
    expect(r.points[1].x).toBeCloseTo(100, 6)
    const last = r.points[2]
    expect(Math.abs(last.x - 100)).toBeLessThan(1e-6)
    expect(Math.abs(last.y)).toBeGreaterThan(100)
  })
  it('a thin lens focuses a parallel ray at f', () => {
    const lens: OpticElement = { id: 2, kind: 'lens', x: 100, y: 0, angle: 0, size: 80, param: 200 }
    const r = traceRay({ elements: [lens] }, { x: 0, y: 30 }, { x: 1, y: 0 }, 589, 0)
    const [p, q] = [r.points[1], r.points[2]]
    const t = (300 - p.x) / (q.x - p.x)
    expect(p.y + t * (q.y - p.y)).toBeCloseTo(0, 6)
  })
  it('a ray inside glass hitting the exit face too steeply is totally reflected', () => {
    const block: OpticElement = { id: 3, kind: 'block', x: 0, y: 0, angle: 0, size: 100, param: 1.5 }
    // enter the left face at a steep angle so the top face is hit beyond the critical angle
    const r = traceRay({ elements: [block] }, { x: -200, y: -40 }, { x: Math.cos(rad(40)), y: Math.sin(rad(40)) }, 589, 0)
    expect(r.tir).toBe(true)
  })
})
