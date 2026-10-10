import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Layout, Panel, Slider } from '../components'
import { useDark, useT } from '../ctx'
import { createCpuField, createGpuField, FIELD_H, FIELD_W, MAX_CHARGES, type FieldBackend } from '../gpu/field'
import { fieldAt, fieldLines, potentialAt, type Charge } from '../lib/electro'

let nextId = 1
const mk = (x: number, y: number, q: number): Charge => ({ id: nextId++, x, y, q })
const PRESETS: Record<string, () => Charge[]> = {
  dipole: () => [mk(300, 250, 2), mk(500, 250, -2)],
  same: () => [mk(300, 250, 2), mk(500, 250, 2)],
  quad: () => [mk(330, 180, 1.5), mk(470, 180, -1.5), mk(330, 320, -1.5), mk(470, 320, 1.5)],
  single: () => [mk(400, 250, 2.5)],
}

export default function FieldSim() {
  const t = useT()
  const dark = useDark()
  const mapRef = useRef<HTMLCanvasElement>(null)
  const topRef = useRef<HTMLCanvasElement>(null)
  const backend = useRef<FieldBackend | null>(null)
  const [mode, setMode] = useState<'gpu' | 'cpu'>('gpu')
  const [kind, setKind] = useState<'gpu' | 'cpu' | null>(null)
  const [charges, setCharges] = useState<Charge[]>(PRESETS.dipole)
  const [selected, setSelected] = useState<number | null>(null)
  const [showLines, setShowLines] = useState(true)
  const [density, setDensity] = useState(6)
  const [probe, setProbe] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null)

  useEffect(() => {
    const canvas = mapRef.current!
    let dead = false
    ;(async () => {
      let b: FieldBackend | null = null
      if (mode === 'gpu') {
        try {
          b = await createGpuField(canvas)
        } catch {
          b = null
        }
        if (!b && !dead) {
          setMode('cpu')
          return
        }
      } else b = createCpuField(canvas)
      if (!b || dead) return
      backend.current = b
      setKind(b.kind)
    })()
    return () => {
      dead = true
      backend.current?.destroy()
      backend.current = null
    }
  }, [mode])

  useEffect(() => {
    if (kind) backend.current?.draw(charges, dark)
  }, [charges, dark, kind])

  const lines = useMemo(() => (showLines ? fieldLines(charges, { w: FIELD_W, h: FIELD_H }, density) : []), [charges, showLines, density])

  useEffect(() => {
    const c = topRef.current!
    const S = 2
    c.width = FIELD_W * S
    c.height = FIELD_H * S
    const ctx = c.getContext('2d')!
    ctx.scale(S, S)
    ctx.clearRect(0, 0, FIELD_W, FIELD_H)
    ctx.strokeStyle = dark ? 'rgba(230,232,236,0.85)' : 'rgba(29,33,41,0.8)'
    ctx.fillStyle = ctx.strokeStyle
    ctx.lineWidth = 1.3
    const positive = charges.some((q) => q.q > 0)
    for (const l of lines) {
      if (l.length < 2) continue
      ctx.beginPath()
      l.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.stroke()
      // arrow head at the middle of the line
      const m = Math.floor(l.length / 2)
      if (m > 0 && m < l.length - 1) {
        const a = l[m - 1]
        const b = l[m + 1]
        const ang = Math.atan2(b.y - a.y, b.x - a.x) + (positive ? 0 : Math.PI)
        ctx.save()
        ctx.translate(l[m].x, l[m].y)
        ctx.rotate(ang)
        ctx.beginPath()
        ctx.moveTo(5, 0)
        ctx.lineTo(-4, 3.5)
        ctx.lineTo(-4, -3.5)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
    }
    for (const q of charges) {
      const r = 10 + Math.min(10, Math.abs(q.q) * 3)
      ctx.beginPath()
      ctx.arc(q.x, q.y, r, 0, 2 * Math.PI)
      ctx.fillStyle = q.q >= 0 ? '#dc2626' : '#2563eb'
      ctx.fill()
      ctx.lineWidth = q.id === selected ? 4 : 2
      ctx.strokeStyle = q.id === selected ? '#fbbf24' : '#ffffff'
      ctx.stroke()
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 16px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(q.q >= 0 ? '+' : '−', q.x, q.y + 1)
    }
  }, [charges, lines, dark, selected])

  const world = (e: React.PointerEvent) => {
    const r = topRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * FIELD_W, y: ((e.clientY - r.top) / r.height) * FIELD_H }
  }
  const onDown = (e: React.PointerEvent) => {
    const p = world(e)
    const h = [...charges].reverse().find((c) => Math.hypot(c.x - p.x, c.y - p.y) < 24)
    setSelected(h ? h.id : null)
    if (!h) return
    topRef.current?.setPointerCapture(e.pointerId)
    drag.current = { id: h.id, dx: h.x - p.x, dy: h.y - p.y }
  }
  const onMove = (e: React.PointerEvent) => {
    const p = world(e)
    setProbe(p)
    const d = drag.current
    if (!d) return
    const x = Math.max(0, Math.min(FIELD_W, p.x + d.dx))
    const y = Math.max(0, Math.min(FIELD_H, p.y + d.dy))
    setCharges((cs) => cs.map((c) => (c.id === d.id ? { ...c, x, y } : c)))
  }
  const add = (q: number) => {
    if (charges.length >= MAX_CHARGES) return
    const c = mk(150 + Math.random() * 500, 100 + Math.random() * 300, q)
    setCharges([...charges, c])
    setSelected(c.id)
  }
  const sel = charges.find((c) => c.id === selected)
  const pv = probe ? potentialAt(charges, probe.x, probe.y) : 0
  const pe = probe ? fieldAt(charges, probe.x, probe.y) : { ex: 0, ey: 0 }

  return (
    <Layout
      controls={
        <>
          <Panel title="Examples">
            <div className="row">
              <button onClick={() => setCharges(PRESETS.dipole())}>{t('Dipole')}</button>
              <button onClick={() => setCharges(PRESETS.same())}>{t('Two like charges')}</button>
              <button onClick={() => setCharges(PRESETS.quad())}>{t('Quadrupole')}</button>
              <button onClick={() => setCharges(PRESETS.single())}>{t('Single charge')}</button>
            </div>
          </Panel>
          <Panel title="Charges">
            <div className="row">
              <button onClick={() => add(1.5)}>{t('Add +')}</button>
              <button onClick={() => add(-1.5)}>{t('Add −')}</button>
              <button onClick={() => setCharges([])}>{t('Clear')}</button>
            </div>
            {sel ? (
              <>
                <Slider label="Charge" value={sel.q} min={-4} max={4} step={0.1} onChange={(v) => setCharges(charges.map((c) => (c.id === sel.id ? { ...c, q: v === 0 ? 0.1 : v } : c)))} format={(v) => v.toFixed(1)} />
                <button
                  className="danger"
                  onClick={() => {
                    setCharges(charges.filter((c) => c.id !== sel.id))
                    setSelected(null)
                  }}
                >
                  {t('Delete')}
                </button>
              </>
            ) : (
              <p className="hint">{t('Drag a charge to move it. Click one to edit its value.')}</p>
            )}
          </Panel>
          <Panel title="Display">
            <Check label="Field lines" checked={showLines} onChange={setShowLines} />
            {showLines && <Slider label="Line density" value={density} min={2} max={14} step={1} onChange={setDensity} />}
          </Panel>
          <Panel title="Probe">
            <p className="hint mono">
              V = {pv.toFixed(3)} · |E| = {Math.hypot(pe.ex, pe.ey).toExponential(2)}
            </p>
            <p className="hint">
              {kind === 'gpu' ? t('Potential map rendered by a WebGPU fragment shader.') : kind === 'cpu' ? t('WebGPU is not available: potential map computed on the CPU.') : t('Starting…')}
            </p>
          </Panel>
        </>
      }
      explain={
        <>
          <h3>{t('What you are seeing')}</h3>
          <p>{t('The colour is the electric potential V = Σ kq/r: red where it is positive, blue where it is negative, with thin bands marking equipotentials. Field lines start on positive charges and end on negative ones; they are always perpendicular to the equipotentials and are denser where the field is stronger.')}</p>
          <p>{t('Units are arbitrary (k = 1) and the charge core is softened so the map stays finite. Try a dipole, then move the charges closer and watch the far field shrink.')}</p>
        </>
      }
    >
      <div className="stack" style={{ aspectRatio: `${FIELD_W} / ${FIELD_H}` }}>
        <canvas key={mode} ref={mapRef} className="sim-canvas" style={{ aspectRatio: `${FIELD_W} / ${FIELD_H}` }} />
        <canvas
          ref={topRef}
          className="sim-canvas overlay"
          style={{ touchAction: 'none' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onPointerLeave={() => setProbe(null)}
          role="img"
          aria-label={t('Electric field of point charges. Drag the charges.')}
        />
      </div>
    </Layout>
  )
}
