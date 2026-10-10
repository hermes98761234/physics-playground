/** Geometric optics: Snell's law, total internal reflection, dispersion and a 2D ray tracer. */

export interface Vec {
  x: number
  y: number
}

export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y })
export const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k })
export const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y
export const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x
export const len = (a: Vec) => Math.hypot(a.x, a.y)
export const norm = (a: Vec): Vec => {
  const l = len(a)
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l }
}
export const rot = (a: Vec, ang: number): Vec => {
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c }
}

/** Angle of refraction (radians) from Snell's law n1 sin θ1 = n2 sin θ2, or null on total internal reflection. */
export function snellAngle(theta1: number, n1: number, n2: number): number | null {
  const s = (n1 / n2) * Math.sin(theta1)
  if (Math.abs(s) > 1) return null
  return Math.asin(s)
}

/** Critical angle (radians) for light going from n1 into n2; null when n1 <= n2 (no TIR possible). */
export function criticalAngle(n1: number, n2: number): number | null {
  if (n1 <= n2) return null
  return Math.asin(n2 / n1)
}

/** Reflect direction d about a surface with unit normal n. */
export function reflect(d: Vec, n: Vec): Vec {
  return sub(d, scale(n, 2 * dot(d, n)))
}

/**
 * Vector form of Snell's law. `n` is the unit surface normal pointing against the incoming ray
 * (dot(d, n) < 0). Returns the refracted direction, or null on total internal reflection.
 */
export function refract(d: Vec, n: Vec, n1: number, n2: number): Vec | null {
  const eta = n1 / n2
  const cosI = -dot(d, n)
  const k = 1 - eta * eta * (1 - cosI * cosI)
  if (k < 0) return null
  return norm(add(scale(d, eta), scale(n, eta * cosI - Math.sqrt(k))))
}

/** Cauchy's equation n(λ) = A + B/λ², normalised so that n(589 nm) = n589. `disp` scales B (0 = no dispersion). */
export function cauchyIndex(n589: number, lambdaNm: number, disp = 1): number {
  const B = 0.0042 * 1e6 * disp // nm², typical of crown glass (~0.004 µm²)
  const A = n589 - B / (589 * 589)
  return A + B / (lambdaNm * lambdaNm)
}

/** Approximate sRGB colour of a visible wavelength (nm), components 0..255. */
export function wavelengthToRgb(nm: number): [number, number, number] {
  let r = 0
  let g = 0
  let b = 0
  if (nm >= 380 && nm < 440) {
    r = (440 - nm) / 60
    b = 1
  } else if (nm < 490) {
    g = (nm - 440) / 50
    b = 1
  } else if (nm < 510) {
    g = 1
    b = (510 - nm) / 20
  } else if (nm < 580) {
    r = (nm - 510) / 70
    g = 1
  } else if (nm < 645) {
    r = 1
    g = (645 - nm) / 65
  } else if (nm <= 780) r = 1
  let f = 1
  if (nm < 420) f = 0.3 + (0.7 * (nm - 380)) / 40
  else if (nm > 700) f = 0.3 + (0.7 * (780 - nm)) / 80
  const c = (v: number) => Math.round(255 * Math.pow(Math.max(0, v) * f, 0.8))
  return [c(r), c(g), c(b)]
}

export type ElementKind = 'lens' | 'mirror' | 'prism' | 'block'

export interface OpticElement {
  id: number
  kind: ElementKind
  x: number
  y: number
  /** Rotation in radians. */
  angle: number
  /** Half-height (lens, mirror) or circumradius-like size (prism, block). */
  size: number
  /** Focal length (lens, negative = diverging) or refractive index at 589 nm (prism, block). */
  param: number
}

export interface Source {
  x: number
  y: number
  angle: number
  rays: number
  width: number
  white: boolean
  dispersion: number
}

export interface Segment {
  a: Vec
  b: Vec
}

/** Vertices (counter-clockwise in a y-up frame) of a prism or block in world coordinates. */
export function polygonOf(e: OpticElement): Vec[] {
  let local: Vec[]
  if (e.kind === 'prism') {
    // Equilateral triangle, apex up.
    local = [0, 1, 2].map((i) => {
      const a = Math.PI / 2 + (i * 2 * Math.PI) / 3
      return { x: e.size * Math.cos(a), y: e.size * Math.sin(a) }
    })
  } else {
    const w = e.size
    const h = e.size * 0.7
    local = [
      { x: -w, y: -h },
      { x: w, y: -h },
      { x: w, y: h },
      { x: -w, y: h },
    ]
  }
  return local.map((p) => add(rot(p, e.angle), { x: e.x, y: e.y }))
}

/** Segment of a mirror or thin lens (its optical plane) in world coordinates. */
export function segmentOf(e: OpticElement): Segment {
  const d = rot({ x: 0, y: e.size }, e.angle)
  return { a: { x: e.x - d.x, y: e.y - d.y }, b: { x: e.x + d.x, y: e.y + d.y } }
}

/** Intersection parameter t > eps of the ray o + t d with segment ab, or null. */
export function raySegment(o: Vec, d: Vec, a: Vec, b: Vec, eps = 1e-6): number | null {
  const e = sub(b, a)
  const den = cross(d, e)
  if (Math.abs(den) < 1e-12) return null
  const w = sub(a, o)
  const t = cross(w, e) / den
  const u = cross(w, d) / den
  if (t > eps && u >= 0 && u <= 1) return t
  return null
}

/** Thin-lens deflection: a ray at height h from the axis changes slope by -h/f. */
export function thinLensDirection(d: Vec, axis: Vec, h: number, f: number): Vec {
  // axis: unit normal of the lens plane; tangent completes the frame.
  const tang = { x: -axis.y, y: axis.x }
  const dn = dot(d, axis)
  const dt = dot(d, tang)
  const s = dn >= 0 ? 1 : -1
  const slope = dt / (dn * s) - (s * h) / f
  const nn = s / Math.hypot(1, slope)
  const tt = (slope * 1) / Math.hypot(1, slope)
  return norm(add(scale(axis, nn), scale(tang, tt)))
}

export interface TracedRay {
  points: Vec[]
  wavelength: number
  tir: boolean
}

export interface Scene {
  elements: OpticElement[]
}

/** Trace one monochromatic ray through the scene. */
export function traceRay(scene: Scene, origin: Vec, dir: Vec, wavelength: number, dispersion: number, maxHits = 24, reach = 4000): TracedRay {
  const points: Vec[] = [origin]
  let o = origin
  let d = norm(dir)
  let tir = false
  const polys = scene.elements.map((e) => (e.kind === 'prism' || e.kind === 'block' ? polygonOf(e) : null))
  for (let hit = 0; hit < maxHits; hit++) {
    let best = Infinity
    let bestIdx = -1
    let bestEdge = -1
    scene.elements.forEach((e, i) => {
      const poly = polys[i]
      if (poly) {
        for (let k = 0; k < poly.length; k++) {
          const t = raySegment(o, d, poly[k], poly[(k + 1) % poly.length])
          if (t !== null && t < best) {
            best = t
            bestIdx = i
            bestEdge = k
          }
        }
      } else {
        const s = segmentOf(e)
        const t = raySegment(o, d, s.a, s.b)
        if (t !== null && t < best) {
          best = t
          bestIdx = i
          bestEdge = 0
        }
      }
    })
    if (bestIdx < 0) {
      points.push(add(o, scale(d, reach)))
      break
    }
    const e = scene.elements[bestIdx]
    const p = add(o, scale(d, best))
    points.push(p)
    o = p
    if (e.kind === 'mirror') {
      const s = segmentOf(e)
      const edge = norm(sub(s.b, s.a))
      d = reflect(d, { x: -edge.y, y: edge.x })
    } else if (e.kind === 'lens') {
      const s = segmentOf(e)
      const edge = norm(sub(s.b, s.a))
      const axis = { x: edge.y, y: -edge.x }
      const h = dot(sub(p, { x: e.x, y: e.y }), edge)
      d = thinLensDirection(d, axis, h, e.param)
    } else {
      const poly = polys[bestIdx]!
      const a = poly[bestEdge]
      const b = poly[(bestEdge + 1) % poly.length]
      const edge = norm(sub(b, a))
      const out = { x: edge.y, y: -edge.x } // outward normal of a CCW polygon
      const entering = dot(d, out) < 0
      const n = cauchyIndex(e.param, wavelength, dispersion)
      const normal = entering ? out : scale(out, -1)
      const r = entering ? refract(d, normal, 1, n) : refract(d, normal, n, 1)
      if (r) d = r
      else {
        d = reflect(d, normal)
        tir = true
      }
    }
  }
  return { points, wavelength, tir }
}

export const WHITE_WAVELENGTHS = [420, 450, 480, 510, 540, 570, 600, 630, 660, 690]

/** Trace every ray of a source (one colour or the white-light spectrum). */
export function traceSource(scene: Scene, src: Source, mono = 589): TracedRay[] {
  const out: TracedRay[] = []
  const dir = { x: Math.cos(src.angle), y: Math.sin(src.angle) }
  const nrm = { x: -dir.y, y: dir.x }
  const n = Math.max(1, src.rays)
  const lams = src.white ? WHITE_WAVELENGTHS : [mono]
  for (let i = 0; i < n; i++) {
    const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * src.width
    const o = add({ x: src.x, y: src.y }, scale(nrm, off))
    for (const l of lams) out.push(traceRay(scene, o, dir, l, src.dispersion))
  }
  return out
}

/** Minimum deviation angle of a prism with apex angle A and index n: δ = 2 asin(n sin(A/2)) − A. */
export function minDeviation(apex: number, n: number): number | null {
  const s = n * Math.sin(apex / 2)
  if (s > 1) return null
  return 2 * Math.asin(s) - apex
}
