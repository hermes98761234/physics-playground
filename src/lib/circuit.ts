/** Transient response of series RC, RL and RLC circuits driven by a DC source through a switch. */

export type CircuitKind = 'RC' | 'RL' | 'RLC'

export interface CircuitParams {
  kind: CircuitKind
  /** Source voltage (V). */
  V: number
  /** Resistance (ohm). */
  R: number
  /** Inductance (H), used by RL and RLC. */
  L: number
  /** Capacitance (F), used by RC and RLC. */
  C: number
}

/** State: capacitor charge q (C) and loop current i (A). */
export interface CircuitState {
  q: number
  i: number
}

/** Source voltage seen by the loop: V while the switch is on the source, 0 while it shorts the loop. */
function deriv(p: CircuitParams, s: CircuitState, v: number): CircuitState {
  switch (p.kind) {
    case 'RC': {
      const i = (v - s.q / p.C) / p.R
      return { q: i, i: 0 }
    }
    case 'RL':
      return { q: s.i, i: (v - p.R * s.i) / p.L }
    case 'RLC':
      return { q: s.i, i: (v - p.R * s.i - s.q / p.C) / p.L }
  }
}

/** One classical RK4 step of length dt with source voltage v. */
export function stepCircuit(p: CircuitParams, s: CircuitState, v: number, dt: number): CircuitState {
  const k1 = deriv(p, s, v)
  const k2 = deriv(p, { q: s.q + (dt / 2) * k1.q, i: s.i + (dt / 2) * k1.i }, v)
  const k3 = deriv(p, { q: s.q + (dt / 2) * k2.q, i: s.i + (dt / 2) * k2.i }, v)
  const k4 = deriv(p, { q: s.q + dt * k3.q, i: s.i + dt * k3.i }, v)
  const q = s.q + (dt / 6) * (k1.q + 2 * k2.q + 2 * k3.q + k4.q)
  let i = s.i + (dt / 6) * (k1.i + 2 * k2.i + 2 * k3.i + k4.i)
  if (p.kind === 'RC') i = (v - q / p.C) / p.R
  return { q, i }
}

/** Voltages across each element for state s and source voltage v. */
export function voltages(p: CircuitParams, s: CircuitState, v: number): { vR: number; vC: number; vL: number } {
  const vR = p.R * s.i
  if (p.kind === 'RC') return { vR, vC: s.q / p.C, vL: 0 }
  if (p.kind === 'RL') return { vR, vC: 0, vL: v - vR }
  const vC = s.q / p.C
  return { vR, vC, vL: v - vR - vC }
}

/** Largest stable-and-accurate time step for RK4 (a small fraction of the fastest time scale). */
export function maxDt(p: CircuitParams): number {
  const scales = [Infinity]
  if (p.kind !== 'RL') scales.push(p.R * p.C)
  if (p.kind !== 'RC') scales.push(p.L / p.R)
  if (p.kind === 'RLC') scales.push(Math.sqrt(p.L * p.C))
  return Math.min(...scales) / 25
}

/** Advance by `duration` seconds with the switch held, using as many RK4 sub-steps as needed. */
export function advance(p: CircuitParams, s: CircuitState, v: number, duration: number): CircuitState {
  const n = Math.max(1, Math.ceil(duration / maxDt(p)))
  const h = duration / n
  let cur = s
  for (let k = 0; k < n; k++) cur = stepCircuit(p, cur, v, h)
  return cur
}

export interface RlcDamping {
  alpha: number
  omega0: number
  regime: 'under' | 'critical' | 'over'
}

export function rlcDamping(R: number, L: number, C: number): RlcDamping {
  const alpha = R / (2 * L)
  const omega0 = 1 / Math.sqrt(L * C)
  const rel = (alpha - omega0) / omega0
  const regime = Math.abs(rel) < 1e-9 ? 'critical' : alpha < omega0 ? 'under' : 'over'
  return { alpha, omega0, regime }
}

/** Analytical capacitor voltage of a series RLC after a step V at t=0 from rest. */
export function rlcStepVc(p: CircuitParams, t: number): number {
  const { alpha, omega0, regime } = rlcDamping(p.R, p.L, p.C)
  if (regime === 'under') {
    const wd = Math.sqrt(omega0 * omega0 - alpha * alpha)
    return p.V * (1 - Math.exp(-alpha * t) * (Math.cos(wd * t) + (alpha / wd) * Math.sin(wd * t)))
  }
  if (regime === 'critical') return p.V * (1 - Math.exp(-alpha * t) * (1 + alpha * t))
  const b = Math.sqrt(alpha * alpha - omega0 * omega0)
  const s1 = -alpha + b
  const s2 = -alpha - b
  return p.V * (1 - (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s2 - s1))
}

/** Analytical capacitor voltage of an RC circuit charging from 0: V (1 - e^{-t/RC}). */
export const rcStepVc = (p: CircuitParams, t: number) => p.V * (1 - Math.exp(-t / (p.R * p.C)))

/** Analytical current of an RL circuit switched on from rest: (V/R)(1 - e^{-tR/L}). */
export const rlStepI = (p: CircuitParams, t: number) => (p.V / p.R) * (1 - Math.exp((-t * p.R) / p.L))

/** A good time window (s) over which to show the transient. */
export function timeWindow(p: CircuitParams): number {
  if (p.kind === 'RC') return 5 * p.R * p.C
  if (p.kind === 'RL') return (5 * p.L) / p.R
  const { alpha, omega0, regime } = rlcDamping(p.R, p.L, p.C)
  if (regime === 'under') return Math.min(5 / alpha, (10 * 2 * Math.PI) / omega0)
  const slow = regime === 'critical' ? alpha : alpha - Math.sqrt(alpha * alpha - omega0 * omega0)
  return 5 / slow
}
