/** 2D scalar wave equation u_tt = c² ∇²u on a regular grid, leapfrog scheme. Mirrors the WGSL compute shader. */

/** The 2D CFL stability limit for the Courant number r = c·dt/dx is r <= 1/sqrt(2). */
export const CFL_LIMIT = 1 / Math.SQRT2

export const courantNumber = (c: number, dt: number, dx: number) => (c * dt) / dx
export const isStable = (c: number, dt: number, dx: number) => courantNumber(c, dt, dx) <= CFL_LIMIT + 1e-12
/** Largest time step that keeps the scheme stable. */
export const maxStableDt = (c: number, dx: number) => (CFL_LIMIT * dx) / c

export const GRID_W = 480
export const GRID_H = 300
export const SPONGE = 28
export const MAX_SOURCES = 8

export interface PointSource {
  x: number
  y: number
}

export interface LineSource {
  x: number
  y0: number
  y1: number
}

export interface WaveParams {
  /** Courant number r = c·dt/dx (clamped to the CFL limit). */
  courant: number
  /** Drive frequency in cycles per time step. */
  freq: number
  sources: PointSource[]
  line: LineSource | null
}

/** Quadratic absorbing ramp: 0 in the interior, rising to ~0.25 at the very edge. */
export function spongeDamping(x: number, y: number, nx: number, ny: number, width = SPONGE): number {
  const d = Math.min(x, y, nx - 1 - x, ny - 1 - y)
  if (d >= width) return 0
  const s = (width - d) / width
  return 0.25 * s * s
}

export function drive(t: number, freq: number): number {
  return Math.sin(2 * Math.PI * freq * t)
}

export class WaveField {
  readonly nx: number
  readonly ny: number
  prev: Float32Array
  cur: Float32Array
  next: Float32Array
  /** 1 = wall. */
  wall: Uint8Array
  readonly damp: Float32Array
  time = 0
  /** Phase of the drive in radians, accumulated so that changing the frequency never jumps. */
  phase = 0

  constructor(nx = GRID_W, ny = GRID_H) {
    this.nx = nx
    this.ny = ny
    this.prev = new Float32Array(nx * ny)
    this.cur = new Float32Array(nx * ny)
    this.next = new Float32Array(nx * ny)
    this.wall = new Uint8Array(nx * ny)
    this.damp = new Float32Array(nx * ny)
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) this.damp[y * nx + x] = spongeDamping(x, y, nx, ny)
  }

  reset() {
    this.prev.fill(0)
    this.cur.fill(0)
    this.next.fill(0)
    this.time = 0
    this.phase = 0
  }

  step(p: WaveParams) {
    const { nx, ny, prev, cur, next, wall, damp } = this
    const r = Math.min(p.courant, CFL_LIMIT)
    const r2 = r * r
    for (let y = 1; y < ny - 1; y++) {
      for (let x = 1; x < nx - 1; x++) {
        const i = y * nx + x
        if (wall[i]) {
          next[i] = 0
          continue
        }
        const lap = cur[i - 1] + cur[i + 1] + cur[i - nx] + cur[i + nx] - 4 * cur[i]
        const s = damp[i]
        next[i] = (2 * cur[i] - (1 - s) * prev[i] + r2 * lap) / (1 + s)
      }
    }
    const v = Math.sin(this.phase)
    for (const s of p.sources) {
      const i = Math.round(s.y) * nx + Math.round(s.x)
      if (!wall[i]) next[i] = v
    }
    if (p.line) {
      for (let y = p.line.y0; y <= p.line.y1; y++) {
        const i = y * nx + p.line.x
        if (!wall[i]) next[i] = v
      }
    }
    this.prev = cur
    this.cur = next
    this.next = prev
    this.time++
    this.phase = (this.phase + 2 * Math.PI * p.freq) % (2 * Math.PI)
  }

  /** Total of u² over the grid, a proxy for wave energy. */
  energy(): number {
    let e = 0
    for (let i = 0; i < this.cur.length; i++) e += this.cur[i] * this.cur[i]
    return e
  }
}

export type PresetName = 'ripple' | 'doubleSlit' | 'singleSlit' | 'lens' | 'empty'

export interface Scene {
  wall: Uint8Array
  sources: PointSource[]
  line: LineSource | null
}

function fillRect(wall: Uint8Array, nx: number, x0: number, y0: number, x1: number, y1: number, v: number) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) wall[y * nx + x] = v
}

export function buildPreset(name: PresetName, nx = GRID_W, ny = GRID_H): Scene {
  const wall = new Uint8Array(nx * ny)
  const cy = Math.floor(ny / 2)
  const barX = Math.floor(nx * 0.4)
  switch (name) {
    case 'empty':
      return { wall, sources: [], line: null }
    case 'ripple':
      return { wall, sources: [{ x: Math.floor(nx / 2), y: cy }], line: null }
    case 'doubleSlit': {
      fillRect(wall, nx, barX, SPONGE, barX + 5, ny - SPONGE - 1, 1)
      const sep = 36
      const half = 7
      for (const c of [cy - sep / 2, cy + sep / 2]) fillRect(wall, nx, barX, Math.round(c) - half, barX + 5, Math.round(c) + half, 0)
      return { wall, sources: [], line: { x: Math.floor(nx * 0.18), y0: SPONGE, y1: ny - SPONGE - 1 } }
    }
    case 'singleSlit': {
      fillRect(wall, nx, barX, SPONGE, barX + 5, ny - SPONGE - 1, 1)
      fillRect(wall, nx, barX, cy - 10, barX + 5, cy + 10, 0)
      return { wall, sources: [], line: { x: Math.floor(nx * 0.18), y0: SPONGE, y1: ny - SPONGE - 1 } }
    }
    case 'lens': {
      // A reflecting parabolic mirror focusing a point source placed at its focus into a plane wave.
      const fx = Math.floor(nx * 0.35)
      for (let y = SPONGE + 10; y < ny - SPONGE - 10; y++) {
        const dy = y - cy
        const x = Math.round(nx * 0.18 + (dy * dy) / (4 * (fx - nx * 0.18)))
        fillRect(wall, nx, x - 1, y, x, y, 1)
      }
      return { wall, sources: [{ x: fx, y: cy }], line: null }
    }
  }
}

/** Paint a filled disc of `value` (1 = wall, 0 = clear) into the wall mask. */
export function paintDisc(wall: Uint8Array, nx: number, ny: number, cx: number, cy: number, radius: number, value: 0 | 1) {
  const r2 = radius * radius
  for (let y = Math.max(1, Math.floor(cy - radius)); y <= Math.min(ny - 2, Math.ceil(cy + radius)); y++) {
    for (let x = Math.max(1, Math.floor(cx - radius)); x <= Math.min(nx - 2, Math.ceil(cx + radius)); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) wall[y * nx + x] = value
    }
  }
}
