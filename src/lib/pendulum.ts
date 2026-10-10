/** Double pendulum (point masses on massless rods) integrated with RK4. Angles are from the downward vertical. */

export interface DoublePendulum {
  m1: number
  m2: number
  l1: number
  l2: number
  g: number
}

/** State vector [θ1, θ2, ω1, ω2]. */
export type PState = [number, number, number, number]

export function derivative(p: DoublePendulum, s: PState): PState {
  const [t1, t2, w1, w2] = s
  const { m1, m2, l1, l2, g } = p
  const d = t1 - t2
  const sd = Math.sin(d)
  const cd = Math.cos(d)
  const den = 2 * m1 + m2 - m2 * Math.cos(2 * d)
  const a1 = (-g * (2 * m1 + m2) * Math.sin(t1) - m2 * g * Math.sin(t1 - 2 * t2) - 2 * sd * m2 * (w2 * w2 * l2 + w1 * w1 * l1 * cd)) / (l1 * den)
  const a2 = (2 * sd * (w1 * w1 * l1 * (m1 + m2) + g * (m1 + m2) * Math.cos(t1) + w2 * w2 * l2 * m2 * cd)) / (l2 * den)
  return [w1, w2, a1, a2]
}

const axpy = (s: PState, k: PState, h: number): PState => [s[0] + h * k[0], s[1] + h * k[1], s[2] + h * k[2], s[3] + h * k[3]]

export function rk4(p: DoublePendulum, s: PState, dt: number): PState {
  const k1 = derivative(p, s)
  const k2 = derivative(p, axpy(s, k1, dt / 2))
  const k3 = derivative(p, axpy(s, k2, dt / 2))
  const k4 = derivative(p, axpy(s, k3, dt))
  return [0, 1, 2, 3].map((i) => s[i] + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])) as PState
}

/** Total mechanical energy (kinetic + potential, zero potential at the pivot). */
export function energy(p: DoublePendulum, s: PState): number {
  const [t1, t2, w1, w2] = s
  const { m1, m2, l1, l2, g } = p
  const T = 0.5 * m1 * l1 * l1 * w1 * w1 + 0.5 * m2 * (l1 * l1 * w1 * w1 + l2 * l2 * w2 * w2 + 2 * l1 * l2 * w1 * w2 * Math.cos(t1 - t2))
  const V = -(m1 + m2) * g * l1 * Math.cos(t1) - m2 * g * l2 * Math.cos(t2)
  return T + V
}

/** Bob positions relative to the pivot (y up). */
export function positions(p: DoublePendulum, s: PState): { x1: number; y1: number; x2: number; y2: number } {
  const x1 = p.l1 * Math.sin(s[0])
  const y1 = -p.l1 * Math.cos(s[0])
  return { x1, y1, x2: x1 + p.l2 * Math.sin(s[1]), y2: y1 - p.l2 * Math.cos(s[1]) }
}

/** Integrate for `duration` seconds with fixed step dt. */
export function integrate(p: DoublePendulum, s: PState, duration: number, dt = 0.001): PState {
  const n = Math.max(1, Math.round(duration / dt))
  let cur = s
  for (let i = 0; i < n; i++) cur = rk4(p, cur, duration / n)
  return cur
}
