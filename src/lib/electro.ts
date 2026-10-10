/** Electrostatics of 2D-placed point charges in arbitrary units (Coulomb constant k = 1, softened core). */

export interface Charge {
  id: number
  x: number
  y: number
  /** Signed charge in arbitrary units. */
  q: number
}

export interface Bounds {
  w: number
  h: number
}

/** Softening radius (same units as positions) that avoids infinities in the shader and the tracer. */
export const SOFT = 4

export function potentialAt(charges: Charge[], x: number, y: number): number {
  let v = 0
  for (const c of charges) v += c.q / Math.sqrt((x - c.x) ** 2 + (y - c.y) ** 2 + SOFT * SOFT)
  return v
}

export function fieldAt(charges: Charge[], x: number, y: number): { ex: number; ey: number } {
  let ex = 0
  let ey = 0
  for (const c of charges) {
    const dx = x - c.x
    const dy = y - c.y
    const r2 = dx * dx + dy * dy + SOFT * SOFT
    const k = c.q / (r2 * Math.sqrt(r2))
    ex += k * dx
    ey += k * dy
  }
  return { ex, ey }
}

/**
 * Follow the field from (x, y) with RK2 steps of fixed length. `dir` = +1 follows E, -1 goes against it.
 * Stops at a charge of the opposite sign, outside the bounds, at a stagnation point or after maxSteps.
 */
export function traceFieldLine(charges: Charge[], x: number, y: number, dir: 1 | -1, b: Bounds, step = 3, maxSteps = 1500): { x: number; y: number }[] {
  const pts = [{ x, y }]
  const dirAt = (px: number, py: number) => {
    const { ex, ey } = fieldAt(charges, px, py)
    const m = Math.hypot(ex, ey)
    return m < 1e-12 ? null : { x: (dir * ex) / m, y: (dir * ey) / m }
  }
  for (let i = 0; i < maxSteps; i++) {
    const d1 = dirAt(x, y)
    if (!d1) break
    const d2 = dirAt(x + (d1.x * step) / 2, y + (d1.y * step) / 2)
    if (!d2) break
    x += d2.x * step
    y += d2.y * step
    pts.push({ x, y })
    if (x < -20 || y < -20 || x > b.w + 20 || y > b.h + 20) break
    // A sink for this direction: a charge whose sign attracts the line.
    if (charges.some((c) => c.q * dir < 0 && Math.hypot(x - c.x, y - c.y) < step * 1.2)) break
  }
  return pts
}

/** Field lines seeded on small circles around the sources (positive charges, or negative ones if none are positive). */
export function fieldLines(charges: Charge[], b: Bounds, perUnit = 6): { x: number; y: number }[][] {
  const lines: { x: number; y: number }[][] = []
  const pos = charges.filter((c) => c.q > 0)
  const sources = pos.length ? pos : charges.filter((c) => c.q < 0)
  const dir = pos.length ? 1 : -1
  for (const c of sources) {
    const n = Math.max(4, Math.min(48, Math.round(Math.abs(c.q) * perUnit)))
    const phase = 0.5
    for (let k = 0; k < n; k++) {
      const a = phase + (2 * Math.PI * k) / n
      lines.push(traceFieldLine(charges, c.x + Math.cos(a) * 6, c.y + Math.sin(a) * 6, dir, b))
    }
  }
  return lines
}

/**
 * Diverging colour for a potential value: blue for negative, white-ish for 0, red for positive, with thin
 * equipotential lines. `gradPerPx` is |E| times the world size of one output pixel, which keeps the lines
 * about one pixel wide everywhere (the GPU shader does the same).
 */
export function potentialToRgb(v: number, dark: boolean, gradPerPx = 0): [number, number, number] {
  const s = Math.tanh(v * 8) // compress dynamic range
  const a = Math.abs(s)
  const base: [number, number, number] = dark ? [18, 20, 26] : [250, 250, 252]
  const tint: [number, number, number] = s >= 0 ? [239, 68, 68] : [59, 130, 246]
  const k = a * 0.9
  const rgb = [0, 1, 2].map((i) => base[i] * (1 - k) + tint[i] * k)
  if (gradPerPx > 0) {
    const f = Math.abs((((v * 24) % 1) + 1) % 1 - 0.5) // 0.5 on a contour line
    const distPx = (0.5 - f) / (24 * gradPerPx)
    const line = Math.max(0, Math.min(1, 1.0 - distPx)) * 0.35
    const ink = dark ? 255 : 0
    for (let i = 0; i < 3; i++) rgb[i] = rgb[i] * (1 - line) + ink * line
  }
  return rgb.map(Math.round) as [number, number, number]
}
