import { useEffect, useRef, useState } from 'react'
import { Check, Layout, Panel, Slider } from '../components'
import { useDark, useFrame, useT } from '../ctx'
import { energy, positions, rk4, type DoublePendulum, type PState } from '../lib/pendulum'

const W = 800
const H = 640
const DT = 0.002
const TRAIL_EVERY = 4

type Pt = [number, number]

const START: PState = [(2 * Math.PI) / 3, (3 * Math.PI) / 4, 0, 0]
const TWIN_EPS = 1e-3

export default function PendulumSim() {
  const t = useT()
  const dark = useDark()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [m2, setM2] = useState(1)
  const [l2, setL2] = useState(1)
  const [g, setG] = useState(9.81)
  const [speed, setSpeed] = useState(1)
  const [trailLen, setTrailLen] = useState(1500)
  const [twin, setTwin] = useState(true)
  const [paused, setPaused] = useState(false)
  const [drift, setDrift] = useState(0)
  const [time, setTime] = useState(0)
  const p: DoublePendulum = { m1: 1, m2, l1: 1, l2, g }
  const sim = useRef({ a: [...START] as PState, b: [START[0] + TWIN_EPS, START[1], 0, 0] as PState, trailA: [] as Pt[], trailB: [] as Pt[], e0: 0, time: 0, acc: 0, step: 0, dragging: null as null | 1 | 2 })
  const live = useRef({ p, speed, trailLen, twin, paused, dark })
  useEffect(() => {
    live.current = { p, speed, trailLen, twin, paused, dark }
  })

  const restart = (s: PState) => {
    const st = sim.current
    st.a = [...s]
    st.b = [s[0] + TWIN_EPS, s[1], 0, 0]
    st.trailA = []
    st.trailB = []
    st.e0 = energy(live.current.p, st.a)
    st.time = 0
  }
  useEffect(() => {
    sim.current.e0 = energy({ m1: 1, m2, l1: 1, l2, g }, sim.current.a)
  }, [m2, l2, g])

  useFrame((dt) => {
    const { p: pp, speed: sp, trailLen: tl, twin: tw, paused: pa, dark: dk } = live.current
    const st = sim.current
    if (!pa && !st.dragging) {
      st.acc += dt * sp
      let guard = 0
      while (st.acc >= DT && guard++ < 600) {
        st.a = rk4(pp, st.a, DT)
        if (tw) st.b = rk4(pp, st.b, DT)
        st.acc -= DT
        st.time += DT
        if (++st.step % TRAIL_EVERY === 0) {
          const q = positions(pp, st.a)
          st.trailA.push([q.x2, q.y2])
          if (tw) {
            const r = positions(pp, st.b)
            st.trailB.push([r.x2, r.y2])
          }
        }
      }
      if (st.trailA.length > tl) st.trailA.splice(0, st.trailA.length - tl)
      if (st.trailB.length > tl) st.trailB.splice(0, st.trailB.length - tl)
      setDrift(Math.abs(energy(pp, st.a) - st.e0))
      setTime(st.time)
    }
    draw(canvas.current!, pp, st, tw, dk)
  })

  const toAngles = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const py = ((e.clientY - r.top) / r.height) * H
    return { px, py }
  }
  const onDown = (e: React.PointerEvent) => {
    const { px, py } = toAngles(e)
    const sc = scaleOf(p)
    const q = positions(p, sim.current.a)
    const b1 = { x: PIV.x + q.x1 * sc, y: PIV.y - q.y1 * sc }
    const b2 = { x: PIV.x + q.x2 * sc, y: PIV.y - q.y2 * sc }
    const d1 = Math.hypot(px - b1.x, py - b1.y)
    const d2 = Math.hypot(px - b2.x, py - b2.y)
    if (Math.min(d1, d2) < 32) {
      sim.current.dragging = d2 <= d1 ? 2 : 1
      canvas.current?.setPointerCapture(e.pointerId)
    }
  }
  const onMove = (e: React.PointerEvent) => {
    const st = sim.current
    if (!st.dragging) return
    const { px, py } = toAngles(e)
    const sc = scaleOf(p)
    const s: PState = [...st.a]
    if (st.dragging === 1) s[0] = Math.atan2(px - PIV.x, py - PIV.y)
    else {
      const x1 = PIV.x + Math.sin(s[0]) * p.l1 * sc
      const y1 = PIV.y + Math.cos(s[0]) * p.l1 * sc
      s[1] = Math.atan2(px - x1, py - y1)
    }
    s[2] = 0
    s[3] = 0
    restart(s)
  }
  const onUp = () => {
    sim.current.dragging = null
    sim.current.e0 = energy(p, sim.current.a)
  }

  return (
    <Layout
      controls={
        <>
          <Panel title="Pendulum">
            <Slider label="Lower mass (upper = 1)" value={m2} min={0.1} max={5} step={0.1} onChange={setM2} format={(v) => v.toFixed(1)} />
            <Slider label="Lower rod length (upper = 1 m)" value={l2} min={0.3} max={2} step={0.05} onChange={setL2} format={(v) => `${v.toFixed(2)} m`} />
            <Slider label="Gravity" value={g} min={1} max={25} step={0.1} onChange={setG} format={(v) => `${v.toFixed(1)} m/s²`} />
          </Panel>
          <Panel title="Display">
            <Slider label="Playback speed" value={speed} min={0.1} max={3} step={0.1} onChange={setSpeed} format={(v) => `${v.toFixed(1)}×`} />
            <Slider label="Trail length" value={trailLen} min={0} max={4000} step={100} onChange={setTrailLen} />
            <Check label="Second pendulum, started 0.001 rad apart" checked={twin} onChange={(v) => {
              setTwin(v)
              sim.current.b = [sim.current.a[0] + TWIN_EPS, sim.current.a[1], sim.current.a[2], sim.current.a[3]]
              sim.current.trailB = []
            }} />
            <div className="row">
              <button onClick={() => setPaused(!paused)}>{paused ? t('Run') : t('Pause')}</button>
              <button onClick={() => restart(START)}>{t('Reset')}</button>
              <button onClick={() => restart([(Math.random() * 2 - 1) * Math.PI, (Math.random() * 2 - 1) * Math.PI, 0, 0])}>{t('Random')}</button>
            </div>
          </Panel>
          <Panel title="Numbers">
            <p className="hint mono">
              {t('Time')}: {time.toFixed(1)} s
              <br />
              {t('Energy drift')}: {drift.toExponential(1)} J
            </p>
          </Panel>
        </>
      }
      explain={
        <>
          <h3>{t('What you are seeing')}</h3>
          <p>{t("A double pendulum integrated with the classical Runge-Kutta (RK4) method at a 2 ms step. Its energy stays constant to about one part in a billion, so what you see is the real dynamics rather than numerical error. Grab either bob to set a new starting position.")}</p>
          <p>{t('It is chaotic: the second (grey) pendulum starts only 0.001 rad away from the first, yet after some seconds the two paths part completely. This sensitivity to initial conditions is the hallmark of chaos.')}</p>
        </>
      }
    >
      <canvas
        ref={canvas}
        width={W}
        height={H}
        className="sim-canvas"
        style={{ aspectRatio: `${W} / ${H}`, touchAction: 'none', cursor: 'grab' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="img"
        aria-label={t('Double pendulum with trails. Drag the bobs.')}
      />
    </Layout>
  )
}

const PIV = { x: W / 2, y: 250 }
const scaleOf = (p: DoublePendulum) => 230 / (p.l1 + p.l2)

function draw(c: HTMLCanvasElement, p: DoublePendulum, st: { a: PState; b: PState; trailA: Pt[]; trailB: Pt[] }, twin: boolean, dark: boolean) {
  const ctx = c.getContext('2d')!
  const sc = scaleOf(p)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = dark ? '#0b0d11' : '#ffffff'
  ctx.fillRect(0, 0, W, H)
  const trail = (pts: Pt[], rgb: string) => {
    const n = pts.length
    const chunk = Math.max(4, Math.floor(n / 40))
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    for (let i = 0; i + 1 < n; i += chunk) {
      ctx.strokeStyle = `rgba(${rgb},${(0.08 + 0.85 * (i / n)).toFixed(3)})`
      ctx.beginPath()
      const end = Math.min(n - 1, i + chunk)
      for (let k = i; k <= end; k++) {
        const x = PIV.x + pts[k][0] * sc
        const y = PIV.y - pts[k][1] * sc
        if (k === i) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }
  if (twin) trail(st.trailB, dark ? '160,168,184' : '110,118,134')
  trail(st.trailA, dark ? '251,146,60' : '234,88,12')
  const rod = (s: PState, rod: string, bob1: string, bob2: string) => {
    const q = positions(p, s)
    const x1 = PIV.x + q.x1 * sc
    const y1 = PIV.y - q.y1 * sc
    const x2 = PIV.x + q.x2 * sc
    const y2 = PIV.y - q.y2 * sc
    ctx.strokeStyle = rod
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(PIV.x, PIV.y)
    ctx.lineTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    ctx.fillStyle = bob1
    ctx.beginPath()
    ctx.arc(x1, y1, 9 + 4 * p.m1, 0, 2 * Math.PI)
    ctx.fill()
    ctx.fillStyle = bob2
    ctx.beginPath()
    ctx.arc(x2, y2, 9 + 4 * Math.sqrt(p.m2), 0, 2 * Math.PI)
    ctx.fill()
  }
  if (twin) rod(st.b, dark ? 'rgba(160,168,184,0.45)' : 'rgba(110,118,134,0.45)', dark ? 'rgba(160,168,184,0.55)' : 'rgba(110,118,134,0.55)', dark ? 'rgba(160,168,184,0.55)' : 'rgba(110,118,134,0.55)')
  rod(st.a, dark ? '#c7ccd6' : '#3d4452', '#3b82f6', '#f97316')
  ctx.fillStyle = dark ? '#e6e8ec' : '#1d2129'
  ctx.beginPath()
  ctx.arc(PIV.x, PIV.y, 5, 0, 2 * Math.PI)
  ctx.fill()
}
