import { describe, expect, it } from 'vitest'
import { buildPreset, CFL_LIMIT, courantNumber, isStable, maxStableDt, paintDisc, WaveField, type WaveParams } from './wave'

const params = (courant: number, extra: Partial<WaveParams> = {}): WaveParams => ({ courant, freq: 0.04, sources: [], line: null, ...extra })

describe('CFL condition', () => {
  it('limit is 1/sqrt(2) in 2D', () => {
    expect(CFL_LIMIT).toBeCloseTo(0.70710678, 7)
  })
  it('courant number and stability', () => {
    expect(courantNumber(2, 0.1, 0.4)).toBeCloseTo(0.5, 12)
    expect(isStable(2, 0.1, 0.4)).toBe(true)
    expect(isStable(2, 0.2, 0.4)).toBe(false)
    expect(isStable(1, maxStableDt(1, 0.5), 0.5)).toBe(true)
  })
  it('a run below the limit stays bounded while the scheme blows up above it', () => {
    const run = (r: number) => {
      const w = new WaveField(48, 48)
      w.cur[24 * 48 + 24] = 1
      w.prev[24 * 48 + 24] = 1
      // Bypass the clamp the solver applies, to test the raw scheme.
      const p = params(r)
      for (let i = 0; i < 60; i++) {
        const r2 = r * r
        const { nx, ny, prev, cur, next } = w
        for (let y = 1; y < ny - 1; y++)
          for (let x = 1; x < nx - 1; x++) {
            const k = y * nx + x
            next[k] = 2 * cur[k] - prev[k] + r2 * (cur[k - 1] + cur[k + 1] + cur[k - nx] + cur[k + nx] - 4 * cur[k])
          }
        ;[w.prev, w.cur, w.next] = [cur, next, prev]
      }
      void p
      return w.energy()
    }
    expect(run(0.7)).toBeLessThan(1e3)
    expect(run(0.8)).toBeGreaterThan(1e6)
  })
  it('step() clamps the courant number so it never diverges', () => {
    const w = new WaveField(64, 64)
    for (let i = 0; i < 300; i++) w.step(params(5, { sources: [{ x: 32, y: 32 }] }))
    expect(Number.isFinite(w.energy())).toBe(true)
    expect(w.energy()).toBeLessThan(1e6)
  })
})

describe('wave propagation', () => {
  it('a pulse travels at c = r cells per step', () => {
    const w = new WaveField(200, 100)
    const r = 0.5
    w.cur[50 * 200 + 60] = 1
    w.prev[50 * 200 + 60] = 1
    for (let i = 0; i < 80; i++) w.step(params(r, { freq: 0 }))
    // find the front along the row: the outermost significant sample
    let front = 0
    for (let x = 61; x < 190; x++) if (Math.abs(w.cur[50 * 200 + x]) > 0.002) front = x
    expect(front - 60).toBeGreaterThan(0.5 * 80 * 0.8)
    expect(front - 60).toBeLessThan(0.5 * 80 * 1.15)
  })
  it('the sponge absorbs most of the energy that reaches the border', () => {
    const w = new WaveField(120, 120)
    w.cur[60 * 120 + 60] = 1
    w.prev[60 * 120 + 60] = 1
    for (let i = 0; i < 400; i++) w.step(params(0.6, { freq: 0 }))
    expect(w.energy()).toBeLessThan(0.1)
  })
  it('walls stay at zero', () => {
    const s = buildPreset('doubleSlit', 200, 120)
    const w = new WaveField(200, 120)
    w.wall.set(s.wall)
    for (let i = 0; i < 100; i++) w.step(params(0.6, { line: s.line }))
    for (let i = 0; i < w.wall.length; i++) if (w.wall[i]) expect(w.cur[i]).toBe(0)
  })
})

describe('presets and painting', () => {
  it('double slit has exactly two openings in the barrier column', () => {
    const nx = 480
    const ny = 300
    const s = buildPreset('doubleSlit')
    const x = Math.floor(nx * 0.4) + 2
    let openings = 0
    for (let y = 29; y < ny - 29; y++) if (!s.wall[y * nx + x] && s.wall[(y - 1) * nx + x]) openings++
    expect(openings).toBe(2)
    expect(s.line).not.toBeNull()
  })
  it('paintDisc paints and erases', () => {
    const wall = new Uint8Array(100 * 100)
    paintDisc(wall, 100, 100, 50, 50, 5, 1)
    expect(wall[50 * 100 + 50]).toBe(1)
    expect(wall[50 * 100 + 60]).toBe(0)
    paintDisc(wall, 100, 100, 50, 50, 8, 0)
    expect(wall.reduce((a, b) => a + b, 0)).toBe(0)
  })
})
