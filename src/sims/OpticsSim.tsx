import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Layout, Panel, Slider } from '../components'
import { useDark, useT } from '../ctx'
import { criticalAngle, minDeviation, polygonOf, segmentOf, traceSource, wavelengthToRgb, type ElementKind, type OpticElement, type Source } from '../lib/optics'

const W = 900
const H = 560
const PX = 1.5 // canvas pixels per world unit
const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

interface SceneState {
  elements: OpticElement[]
  source: Source
}

let nextId = 100
const el = (kind: ElementKind, x: number, y: number, angle = 0, size?: number, param?: number): OpticElement => ({
  id: nextId++,
  kind,
  x,
  y,
  angle,
  size: size ?? (kind === 'prism' ? 110 : kind === 'block' ? 90 : 90),
  param: param ?? (kind === 'lens' ? 180 : kind === 'mirror' ? 0 : 1.5),
})

const baseSource: Source = { x: 70, y: 280, angle: 0, rays: 1, width: 80, white: true, dispersion: 1 }

const PRESETS: Record<string, () => SceneState> = {
  prism: () => ({ elements: [el('prism', 430, 270, rad(-6))], source: { ...baseSource, y: 250, angle: rad(8), dispersion: 3 } }),
  lens: () => ({ elements: [el('lens', 330, 280, 0, 120, 200)], source: { ...baseSource, rays: 9, width: 160, white: false } }),
  tir: () => ({ elements: [el('prism', 400, 280, rad(30), 130)], source: { ...baseSource, white: false, rays: 3, width: 40 } }),
  mirrors: () => ({
    elements: [el('mirror', 700, 280, rad(-20), 110), el('mirror', 330, 90, rad(115), 120), el('lens', 200, 280, 0, 70, -150)],
    source: { ...baseSource, white: false, rays: 5, width: 60, x: 50 },
  }),
}

function drawScene(ctx: CanvasRenderingContext2D, scene: SceneState, selected: number | 'src' | null, dark: boolean, tirCount: { v: boolean }) {
  const X = (x: number) => x * PX
  const Y = (y: number) => (H - y) * PX
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = dark ? '#05070a' : '#10141c'
  ctx.fillRect(0, 0, W * PX, H * PX)
  // subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  ctx.lineWidth = 1
  for (let x = 0; x <= W; x += 50) {
    ctx.beginPath()
    ctx.moveTo(X(x), 0)
    ctx.lineTo(X(x), H * PX)
    ctx.stroke()
  }
  for (let y = 0; y <= H; y += 50) {
    ctx.beginPath()
    ctx.moveTo(0, Y(y))
    ctx.lineTo(W * PX, Y(y))
    ctx.stroke()
  }

  // glass bodies
  for (const e of scene.elements) {
    if (e.kind === 'prism' || e.kind === 'block') {
      const poly = polygonOf(e)
      ctx.beginPath()
      poly.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))))
      ctx.closePath()
      ctx.fillStyle = 'rgba(120,180,255,0.16)'
      ctx.fill()
      ctx.strokeStyle = e.id === selected ? '#fbbf24' : 'rgba(170,210,255,0.75)'
      ctx.lineWidth = e.id === selected ? 3 : 2
      ctx.stroke()
    }
  }

  // rays, additive so overlapping colours make white
  const rays = traceSource({ elements: scene.elements }, scene.source)
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const white = scene.source.white
  for (const r of rays) {
    const [cr, cg, cb] = white ? wavelengthToRgb(r.wavelength) : [255, 236, 160]
    if (r.tir) tirCount.v = true
    ctx.strokeStyle = `rgba(${cr},${cg},${cb},${white ? 0.55 : 0.85})`
    ctx.lineWidth = white ? 2.5 : 2
    ctx.beginPath()
    r.points.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))))
    ctx.stroke()
  }
  ctx.globalCompositeOperation = 'source-over'

  // mirrors and lenses on top
  for (const e of scene.elements) {
    if (e.kind !== 'mirror' && e.kind !== 'lens') continue
    const s = segmentOf(e)
    const sel = e.id === selected
    if (e.kind === 'mirror') {
      ctx.strokeStyle = sel ? '#fbbf24' : '#dfe6f1'
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.moveTo(X(s.a.x), Y(s.a.y))
      ctx.lineTo(X(s.b.x), Y(s.b.y))
      ctx.stroke()
      // hatching on the back
      const dx = (s.b.x - s.a.x) / 12
      const dy = (s.b.y - s.a.y) / 12
      const nx = -dy / 1.5
      const ny = dx / 1.5
      ctx.strokeStyle = 'rgba(223,230,241,0.5)'
      ctx.lineWidth = 1.5
      for (let i = 0; i <= 12; i++) {
        const px = s.a.x + dx * i
        const py = s.a.y + dy * i
        ctx.beginPath()
        ctx.moveTo(X(px), Y(py))
        ctx.lineTo(X(px + nx + dx * 0.6), Y(py + ny + dy * 0.6))
        ctx.stroke()
      }
    } else {
      const ax = Math.cos(e.angle)
      const ay = Math.sin(e.angle) // lens plane direction is (-sin, cos); its normal is (cos, sin)
      const steps = 24
      ctx.beginPath()
      const pt = (u: number, side: number) => {
        // u in [-1,1] along the lens plane, side = +-1 for the two faces
        const along = u * e.size
        const off = e.param > 0 ? side * e.size * 0.22 * (1 - u * u) : side * e.size * 0.1 * (0.3 + 0.7 * u * u)
        return { x: e.x - ay * along + ax * off, y: e.y + ax * along + ay * off }
      }
      for (let i = 0; i <= steps; i++) {
        const p = pt(-1 + (2 * i) / steps, 1)
        if (i) ctx.lineTo(X(p.x), Y(p.y))
        else ctx.moveTo(X(p.x), Y(p.y))
      }
      for (let i = steps; i >= 0; i--) {
        const p = pt(-1 + (2 * i) / steps, -1)
        ctx.lineTo(X(p.x), Y(p.y))
      }
      ctx.closePath()
      ctx.fillStyle = 'rgba(120,200,255,0.2)'
      ctx.fill()
      ctx.strokeStyle = sel ? '#fbbf24' : 'rgba(170,220,255,0.9)'
      ctx.lineWidth = sel ? 3 : 2
      ctx.stroke()
      // focal points
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      for (const sgn of [-1, 1]) {
        ctx.beginPath()
        ctx.arc(X(e.x + sgn * ax * e.param), Y(e.y + sgn * ay * e.param), 3, 0, 2 * Math.PI)
        ctx.fill()
      }
    }
  }

  // light source
  const src = scene.source
  ctx.fillStyle = selected === 'src' ? '#fbbf24' : '#f8fafc'
  ctx.beginPath()
  ctx.arc(X(src.x), Y(src.y), 9, 0, 2 * Math.PI)
  ctx.fill()
  ctx.strokeStyle = ctx.fillStyle
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(X(src.x), Y(src.y))
  ctx.lineTo(X(src.x + 26 * Math.cos(src.angle)), Y(src.y + 26 * Math.sin(src.angle)))
  ctx.stroke()
}

export default function OpticsSim() {
  const t = useT()
  const dark = useDark()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [scene, setScene] = useState<SceneState>(PRESETS.prism)
  const [selected, setSelected] = useState<number | 'src' | null>('src')
  const drag = useRef<{ id: number | 'src'; dx: number; dy: number } | null>(null)
  const tirRef = useRef({ v: false })
  const [tir, setTir] = useState(false)

  useEffect(() => {
    const c = canvasRef.current!
    c.width = W * PX
    c.height = H * PX
    const ctx = c.getContext('2d')!
    tirRef.current.v = false
    drawScene(ctx, scene, selected, dark, tirRef.current)
    setTir(tirRef.current.v)
  }, [scene, selected, dark])

  const world = (e: React.PointerEvent | React.WheelEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * W, y: H - ((e.clientY - r.top) / r.height) * H }
  }
  const hit = (p: { x: number; y: number }): number | 'src' | null => {
    if (Math.hypot(p.x - scene.source.x, p.y - scene.source.y) < 22) return 'src'
    for (let i = scene.elements.length - 1; i >= 0; i--) {
      const e = scene.elements[i]
      if (Math.hypot(p.x - e.x, p.y - e.y) < (e.kind === 'prism' ? e.size * 0.8 : e.size * 0.9)) return e.id
    }
    return null
  }
  const patchEl = (id: number, patch: Partial<OpticElement>) => setScene((s) => ({ ...s, elements: s.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) }))
  const patchSrc = (patch: Partial<Source>) => setScene((s) => ({ ...s, source: { ...s.source, ...patch } }))

  const onDown = (e: React.PointerEvent) => {
    const p = world(e)
    const h = hit(p)
    setSelected(h)
    if (h === null) return
    canvasRef.current?.setPointerCapture(e.pointerId)
    const o = h === 'src' ? scene.source : scene.elements.find((x) => x.id === h)!
    drag.current = { id: h, dx: o.x - p.x, dy: o.y - p.y }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = world(e)
    const x = Math.max(0, Math.min(W, p.x + d.dx))
    const y = Math.max(0, Math.min(H, p.y + d.dy))
    if (d.id === 'src') patchSrc({ x, y })
    else patchEl(d.id, { x, y })
  }
  const onWheel = (e: React.WheelEvent) => {
    if (selected === null) return
    const step = rad(e.deltaY > 0 ? 3 : -3)
    if (selected === 'src') patchSrc({ angle: scene.source.angle + step })
    else patchEl(selected, { angle: (scene.elements.find((x) => x.id === selected)?.angle ?? 0) + step })
  }
  useEffect(() => {
    // wheel needs a non-passive listener to stop the page from scrolling while rotating
    const c = canvasRef.current!
    const stop = (e: WheelEvent) => {
      if (selected !== null) e.preventDefault()
    }
    c.addEventListener('wheel', stop, { passive: false })
    return () => c.removeEventListener('wheel', stop)
  }, [selected])

  const add = (kind: ElementKind) => {
    const e = el(kind, 450 + Math.random() * 120, 200 + Math.random() * 160)
    setScene((s) => ({ ...s, elements: [...s.elements, e] }))
    setSelected(e.id)
  }
  const sel = typeof selected === 'number' ? scene.elements.find((e) => e.id === selected) : undefined
  const info = useMemo(() => {
    if (!sel || (sel.kind !== 'prism' && sel.kind !== 'block')) return null
    const crit = criticalAngle(sel.param, 1)
    const dev = sel.kind === 'prism' ? minDeviation(Math.PI / 3, sel.param) : null
    return { crit: crit === null ? null : deg(crit), dev: dev === null ? null : deg(dev) }
  }, [sel])

  return (
    <Layout
      controls={
        <>
          <Panel title="Examples">
            <div className="row">
              <button onClick={() => setScene(PRESETS.prism())}>{t('Rainbow prism')}</button>
              <button onClick={() => setScene(PRESETS.lens())}>{t('Focusing lens')}</button>
              <button onClick={() => setScene(PRESETS.tir())}>{t('Total reflection')}</button>
              <button onClick={() => setScene(PRESETS.mirrors())}>{t('Mirrors')}</button>
            </div>
          </Panel>
          <Panel title="Add an element">
            <div className="row">
              <button onClick={() => add('lens')}>{t('Lens')}</button>
              <button onClick={() => add('mirror')}>{t('Mirror')}</button>
              <button onClick={() => add('prism')}>{t('Prism')}</button>
              <button onClick={() => add('block')}>{t('Glass block')}</button>
            </div>
            <p className="hint">{t('Drag objects to move them. Scroll over the canvas to rotate the selected one.')}</p>
          </Panel>
          {selected === 'src' && (
            <Panel title="Light source">
              <Slider label="Direction" value={Math.round(deg(scene.source.angle) % 360)} min={-180} max={180} step={1} onChange={(v) => patchSrc({ angle: rad(v) })} format={(v) => `${v}°`} />
              <Slider label="Number of rays" value={scene.source.rays} min={1} max={15} step={1} onChange={(v) => patchSrc({ rays: v })} />
              <Slider label="Beam width" value={scene.source.width} min={10} max={300} step={5} onChange={(v) => patchSrc({ width: v })} />
              <Check label="White light (all colours)" checked={scene.source.white} onChange={(v) => patchSrc({ white: v })} />
              <Slider label="Dispersion strength" value={scene.source.dispersion} min={0} max={6} step={0.25} onChange={(v) => patchSrc({ dispersion: v })} format={(v) => `${v}×`} />
            </Panel>
          )}
          {sel && (
            <Panel title="Selected element">
              <Slider label="Rotation" value={Math.round(deg(sel.angle) % 360)} min={-180} max={180} step={1} onChange={(v) => patchEl(sel.id, { angle: rad(v) })} format={(v) => `${v}°`} />
              <Slider label="Size" value={sel.size} min={30} max={200} step={5} onChange={(v) => patchEl(sel.id, { size: v })} />
              {sel.kind === 'lens' && (
                <Slider label="Focal length (negative: diverging)" value={sel.param} min={-300} max={300} step={10} onChange={(v) => patchEl(sel.id, { param: v === 0 ? 10 : v })} />
              )}
              {(sel.kind === 'prism' || sel.kind === 'block') && (
                <Slider label="Refractive index n" value={sel.param} min={1.1} max={2.4} step={0.05} onChange={(v) => patchEl(sel.id, { param: v })} format={(v) => v.toFixed(2)} />
              )}
              {info && (
                <p className="hint">
                  {info.crit !== null && `${t('Critical angle')}: ${info.crit.toFixed(1)}°`}
                  {info.dev !== null && ` · ${t('Min. deviation (60° prism)')}: ${info.dev.toFixed(1)}°`}
                </p>
              )}
              <button
                className="danger"
                onClick={() => {
                  setScene((s) => ({ ...s, elements: s.elements.filter((e) => e.id !== sel.id) }))
                  setSelected(null)
                }}
              >
                {t('Delete')}
              </button>
            </Panel>
          )}
          {tir && <p className="hint ok-text">{t('Total internal reflection is happening in the glass.')}</p>}
        </>
      }
      explain={
        <>
          <h3>{t('What you are seeing')}</h3>
          <p>{t("Rays are traced with the vector form of Snell's law, n₁ sin θ₁ = n₂ sin θ₂. When light inside glass meets the surface beyond the critical angle asin(1/n) it cannot leave and is totally reflected. Mirrors reflect with angle in = angle out. Lenses are ideal thin lenses: a ray at height h bends by h/f.")}</p>
          <p>{t('Glass slows blue light more than red (Cauchy: n = A + B/λ²), so white light fans out into a spectrum in a prism. Raise the dispersion strength to exaggerate it.')}</p>
        </>
      }
    >
      <canvas
        ref={canvasRef}
        className="sim-canvas"
        style={{ aspectRatio: `${W} / ${H}`, touchAction: 'none', cursor: 'grab' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onWheel={onWheel}
        role="img"
        aria-label={t('Optics bench. Drag lenses, mirrors and prisms.')}
      />
    </Layout>
  )
}
